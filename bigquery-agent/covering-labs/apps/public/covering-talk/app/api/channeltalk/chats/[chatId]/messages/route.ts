import { NextRequest, NextResponse } from "next/server";
import { getMessages, sendMessage, listManagers } from "@/lib/channeltalk/client";
import { getCurrentUser } from "@/lib/auth/session";
import { convertEmojiShortcodes } from "@/lib/channeltalk/emoji";

// 매니저 목록 캐시 (서버 프로세스 내, 30분 TTL)
let managerCache: Map<string, { name: string; avatarUrl?: string }> | null = null;
let managerCacheAt = 0;

async function getManagerMap(): Promise<Map<string, { name: string; avatarUrl?: string }>> {
  if (managerCache && Date.now() - managerCacheAt < 1000 * 60 * 30) return managerCache;
  const managers = await listManagers();
  managerCache = new Map(managers.map((m) => [m.id, { name: m.name, avatarUrl: m.avatarUrl }]));
  managerCacheAt = Date.now();
  return managerCache;
}

// blocks를 재귀적으로 순회하여 텍스트 추출 (nested blocks 지원, <b>/<i> 태그 보존)
// HTML 엔티티 디코딩 (&amp; &gt; &lt; &quot; &#39; &#123; 등)
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractBlocksText(blocks: Array<{ type: string; value?: string; blocks?: Array<{ type: string; value?: string; blocks?: unknown[] }> }>): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text" && b.value) {
      parts.push(b.value);
    } else if (b.type === "bullets" && b.value) {
      parts.push(`• ${b.value}`);
    } else if (b.type === "code" && b.value) {
      parts.push(b.value);
    }
    // 중첩 blocks 재귀 처리
    if (b.blocks?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nested = extractBlocksText(b.blocks as any);
      if (nested) parts.push(nested);
    }
  }
  return parts.join("\n");
}

// [CS-CT-002] 채널톡 메시지 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  const { chatId } = await params;

  try {
    const [data, managerMap] = await Promise.all([
      getMessages(chatId, { sortOrder: "desc", limit: 200 }),
      getManagerMap(),
    ]);

    const FILE_PROXY = "/api/channeltalk/file";

    const messages = (data.messages ?? [])
      .filter((msg) => {
        // 삭제된 메시지는 항상 유지 (UI에서 "삭제된 메시지입니다" 표시)
        if ((msg as unknown as Record<string, unknown>).state === "removed") return true;
        const opts = msg.options ?? [];
        if (opts.includes("immutable") && !msg.plainText?.trim()) return false;
        if (opts.includes("silentToUser") && opts.includes("silentToManager") && !msg.plainText?.trim()) return false;
        if (!msg.plainText && (!msg.blocks || msg.blocks.length === 0) && (!msg.files || msg.files.length === 0) && !msg.form?.inputs?.length) return false;
        return true;
      })
      .map((msg) => {
        const opts = msg.options ?? [];
        const isInternal = opts.includes("private") && opts.includes("silentToUser");

        // role 판별:
        // personType=manager → 실제 매니저 (파란 버블 + 이름)
        // personType=bot + actAsManager → 커버링톡 API 전송 (파란 버블 + 이름)
        // personType=bot (나머지) → 진짜 채널톡 봇 (회색 버블 + "봇")
        let role: "user" | "manager" | "bot" = msg.personType as "user" | "manager" | "bot";
        let senderName: string | undefined;
        let avatarUrl: string | undefined;

        if (msg.personType === "manager") {
          const mgr = managerMap.get(msg.personId);
          senderName = mgr?.name;
          avatarUrl = mgr?.avatarUrl;
        } else if (msg.personType === "bot") {
          const bot = data.bots?.find((b) => b.id === msg.personId);
          if (opts.includes("actAsManager")) {
            role = "manager";
            senderName = bot?.name ?? "상담사";
            // 봇 이름이 매니저 이름과 일치하면 매니저 아바타 사용
            const matchedMgr = senderName ? [...managerMap.values()].find(m => m.name === senderName) : undefined;
            avatarUrl = matchedMgr?.avatarUrl ?? bot?.avatar;
          } else {
            senderName = bot?.name;
            avatarUrl = bot?.avatar;
          }
        }

        const files = (msg.files ?? []).map((f) => {
          // 프록시를 통해 파일 접근 (signed URL API에 chatId 필요)
          const fileKey = f.key || `pub-file/64368/${f.id}/${f.name}`;
          const url = `${FILE_PROXY}?key=${encodeURIComponent(fileKey)}&chatId=${encodeURIComponent(chatId)}`;
          const thumbnailUrl = f.previewKey
            ? `${FILE_PROXY}?key=${encodeURIComponent(f.previewKey)}&chatId=${encodeURIComponent(chatId)}`
            : undefined;
          return {
            id: f.id,
            type: f.type,
            name: f.name,
            contentType: f.contentType,
            url,
            thumbnailUrl,
            width: f.width,
            height: f.height,
          };
        });

        // 폼 데이터 파싱
        // blocks의 value에서 rich text 추출 (<b>, <i> 등 태그 보존)
        // plainText는 태그가 제거된 순수 텍스트이므로 blocks 우선 사용
        let content = "";
        if (msg.blocks?.length) {
          content = extractBlocksText(msg.blocks);
        }
        if (!content) content = msg.plainText ?? "";
        // HTML 엔티티 디코딩 + 이모지 shortcode → 유니코드 변환
        content = decodeHtmlEntities(content);
        content = convertEmojiShortcodes(content);
        const formData = msg.form?.inputs?.length
          ? msg.form.inputs
              .filter((inp) => inp.value)
              .map((inp) => ({ label: inp.label, value: inp.value! }))
          : undefined;

        // content에도 폼 텍스트 포함 (AI recentTurns용)
        if (formData?.length) {
          const formText = formData.map((f) => `${f.label}: ${f.value}`).join("\n");
          content = content ? `${content}\n\n${formText}` : formText;
        }

        // 삭제된 메시지 감지
        const msgState = (msg as unknown as Record<string, unknown>).state as string | undefined;
        const isRemoved = msgState === "removed";

        return {
          id: msg.id,
          chatId: msg.chatId,
          role,
          content: isRemoved ? "" : content,
          personId: msg.personId,
          ...(senderName ? { senderName } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
          ...(formData && !isRemoved ? { formData } : {}),
          ...((msg as unknown as Record<string, unknown>).workflowButton ? { isWorkflowButton: true } : {}),
          createdAt: msg.createdAt,
          ...(isInternal ? { isInternal: true } : {}),
          ...(files.length > 0 && !isRemoved ? { files } : {}),
          ...(isRemoved ? { isRemoved: true } : {}),
        };
      });

    // desc로 가져왔으므로 시간순(오래된→최신)으로 재정렬
    messages.sort((a, b) => a.createdAt - b.createdAt);

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("[CT] messages error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// [CS-CT-003] 채널톡 메시지 전송
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  const { chatId } = await params;
  const { message, actAsManager, isInternal, mentionedManagerIds, replyKind, draftCharOverlap } = (await request.json()) as {
    message: string;
    actAsManager?: boolean;
    isInternal?: boolean;
    mentionedManagerIds?: string[];
    replyKind?: "ai_auto" | "ai_assist" | "human";
    draftCharOverlap?: number;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "메시지를 입력해주세요" }, { status: 400 });
  }

  // 채널톡 닉네임 우선 → 없으면 로그인 이름 → 없으면 "커버링"
  const user = await getCurrentUser();
  let botName = user?.name ?? "커버링";

  if (user) {
    const { supabase } = await import("@/lib/supabase/client");
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", `counselor:${user.name}`)
      .single();
    const nickname = (data?.value as Record<string, unknown>)?.channeltalk_nickname as string | undefined;
    if (nickname?.trim()) botName = nickname.trim();
  }

  try {
    const result = await sendMessage(chatId, message, {
      botName,
      actAsManager: isInternal ? false : (actAsManager ?? true),
      isInternal: isInternal ?? false,
      mentionedManagerIds,
    });

    // CS Realtime — 외부 답변만 분류 로그 기록 (내부 메시지 제외)
    if (!isInternal && replyKind && user?.name) {
      const { supabase } = await import("@/lib/supabase/client");
      await supabase.from("channeltalk_reply_logs").insert({
        chat_id: chatId,
        manager_name: user.name,
        reply_kind: replyKind,
        draft_char_overlap: draftCharOverlap ?? null,
      }).then(({ error }) => {
        if (error) console.error("[CT] reply log insert error:", error);
      });
    }

    return NextResponse.json({ ok: true, messageId: result.id });
  } catch (err) {
    console.error("[CT] send message error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
