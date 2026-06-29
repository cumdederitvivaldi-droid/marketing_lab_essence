import { NextRequest, NextResponse } from "next/server";
import { IncomingMessage } from "@/lib/happytalk/types";
import { lunchConversationStore } from "@/lib/store/lunch-conversations";
import { supabase } from "@/lib/supabase/client";
import { persistImage } from "@/lib/supabase/storage";

export const maxDuration = 30;

// [CS-EXT-015] 런치 웹훅 — 메시지 수신
// 1. serial_number 기반 중복 방지 → DB 저장 (lunch_conversations + lunch_messages)
// 2. 전화번호로 벤더 자동 매핑
// 3. AI 초안 자동 생성 (반자동 — 상담사 검토 후 발송)
//    Phase: idle → order → confirm / inquiry, <order_data> JSON 자동파싱
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: IncomingMessage;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
  }

  console.log("[Webhook/lunch/message] 수신:", JSON.stringify(body));

  const { session_id, user_key, sender_key, type, contents, attachment, serial_number } = body;

  // ── 0. serial_number 기반 중복 웹훅 방지 ─────────
  if (serial_number) {
    const serialKey = `${session_id}_${serial_number}`;
    const { data: existing } = await supabase
      .from("lunch_messages")
      .select("id")
      .eq("serial_number", serialKey)
      .limit(1);
    if (existing && existing.length > 0) {
      console.log(`[Webhook/lunch/message] 중복 serial_number 무시: ${serialKey}`);
      return NextResponse.json({ status: "ok" });
    }
  }

  // ── 1. 메시지 타입 파싱 ──────────────────────────
  // 방문수거 extractImageUrls와 동일한 로직으로 이미지 URL 추출
  const isImage = type === "photo";
  const isFile = type === "file";
  let messageType: "text" | "image" | "file" = isImage ? "image" : isFile ? "file" : "text";
  let content = "";
  let imageUrl: string | undefined;

  // 이미지/파일 URL 추출 (방문수거와 동일한 3소스 체크)
  function extractImageUrls(b: Record<string, unknown>): string[] {
    const urls: string[] = [];
    const att = b.attachment as { url?: string } | undefined;
    if (att?.url) urls.push(att.url);
    if (b.image_url && typeof b.image_url === "string" && !urls.includes(b.image_url)) urls.push(b.image_url);
    const cts = b.contents as (string | { url?: string; comment?: string })[] | undefined;
    if (Array.isArray(cts)) {
      for (const item of cts) {
        if (typeof item === "object" && item?.url && !urls.includes(item.url)) urls.push(item.url);
        if (typeof item === "string" && (item.startsWith("http://") || item.startsWith("https://")) && !urls.includes(item)) urls.push(item);
      }
    }
    return urls;
  }

  if (isImage || isFile) {
    content = isImage ? "[사진 수신]" : "[파일 수신]";
    const urls = extractImageUrls(body as unknown as Record<string, unknown>);
    console.log(`[Webhook/lunch/message] 이미지 URL 추출: ${urls.length}개`, urls);
    if (urls.length > 0) {
      try {
        // persistImage(sessionId, originalUrl) — 순서: sessionId 먼저, URL 나중!
        imageUrl = await persistImage(session_id, urls[0]);
        console.log(`[Webhook/lunch/message] 이미지 저장 완료: ${imageUrl}`);
      } catch (err) {
        console.error(`[Webhook/lunch/message] persistImage 실패:`, err);
        imageUrl = urls[0]; // fallback to original URL
      }
    } else {
      console.warn("[Webhook/lunch/message] 이미지/파일이지만 URL을 추출하지 못함. body:", JSON.stringify({ type, contents, attachment, image_url: (body as unknown as Record<string, unknown>).image_url }));
    }
    // 추가 이미지가 있으면 별도 메시지로 저장
    if (urls.length > 1) {
      for (let i = 1; i < urls.length; i++) {
        let extraUrl = urls[i];
        try { extraUrl = await persistImage(session_id, urls[i]); } catch { /* fallback */ }
        await lunchConversationStore.upsertIncoming({
          sessionId: session_id, userKey: user_key, senderKey: sender_key,
          content: isImage ? "[사진 수신]" : "[파일 수신]",
          messageType: isImage ? "image" : "file",
          imageUrl: extraUrl,
        });
      }
    }
  } else {
    // text
    content = Array.isArray(contents)
      ? contents.map((c) => (typeof c === "string" ? c : "")).join("\n").trim()
      : "";
    if (!content) {
      console.warn("[Webhook/lunch/message] 빈 메시지, 무시");
      return NextResponse.json({ status: "ok" });
    }
  }

  // ── 2. 전화번호 → 벤더 매핑 ──────────────────────
  // user_key가 전화번호 형식인 경우 벤더 자동 매핑 시도
  const phoneCandidate = user_key.replace(/[^0-9]/g, "");
  const phone = /^01[016789]\d{7,8}$/.test(phoneCandidate) ? phoneCandidate : "";

  let vendorId: string | null = null;
  let vendorName = "";

  if (phone) {
    const { data: vendor } = await supabase
      .from("lunch_vendors")
      .select("id, name")
      .eq("owner_phone", phone)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (vendor) {
      vendorId = vendor.id;
      vendorName = vendor.name;
    }
  }

  // ── 3. 대화 upsert + 메시지 저장 ─────────────────
  const conv = await lunchConversationStore.upsertIncoming({
    sessionId: session_id,
    userKey: user_key,
    senderKey: sender_key,
    vendorId,
    vendorName,
    phone,
    content,
    messageType,
    imageUrl,
    serialNumber: serial_number ? String(serial_number) : undefined,
  });

  if (!conv) {
    console.error("[Webhook/lunch/message] 대화 저장 실패:", session_id);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  console.log(
    `[Webhook/lunch/message] 저장 완료: session=${session_id} vendor=${vendorName || "(미매핑)"}`,
  );

  // ── 4. AI 초안 생성 (반자동 모드) ────────────────
  // 텍스트 메시지일 때만 AI 초안 생성 (이미지/파일은 스킵)
  if (messageType === "text" && content && conv) {
    try {
      const { generateLunchAIResponse } = await import("@/lib/ai/lunch-ai");

      // 히스토리 구성 (최근 60건, 현재 메시지 제외 — 장기 대화 대응)
      const history = (conv.messages ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-60)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const isNewVendor = !conv.vendorId;
      const currentPhase = (conv.aiPhase || "idle") as "idle" | "order" | "confirm" | "inquiry";

      // 해당 벤더의 최근 주문 이력 조회 (AI 컨텍스트)
      let recentOrders: Array<{ orderNumber: string; date: string; pickupTime: string; boxCount: string; pickupAddress: string; totalAmount: number; status: string; sortingPrice?: number; }> = [];
      if (conv.vendorId) {
        const { data: orderRows } = await supabase
          .from("lunch_orders")
          .select("order_number, date, pickup_time, box_count, pickup_address, total_amount, status, sorting_price")
          .eq("vendor_id", conv.vendorId)
          .order("date", { ascending: false })
          .limit(10);
        recentOrders = (orderRows ?? []).map((o) => ({
          orderNumber: o.order_number,
          date: o.date,
          pickupTime: o.pickup_time ?? "",
          boxCount: o.box_count ?? "",
          pickupAddress: o.pickup_address ?? "",
          totalAmount: o.total_amount ?? 0,
          status: o.status ?? "confirmed",
          sortingPrice: o.sorting_price ?? undefined,
        }));
      }

      const aiResult = await generateLunchAIResponse({
        userMessage: content,
        history,
        vendorName: conv.vendorName || vendorName || "",
        isNewVendor,
        phase: currentPhase as "idle" | "order" | "confirm" | "inquiry",
        recentOrders,
      });

      // AI 초안 + Phase + 주문 데이터 저장
      await lunchConversationStore.update(session_id, {
        aiDraft: aiResult.response,
        aiPhase: aiResult.phase,
        ...(aiResult.orderData ? { aiOrderData: JSON.stringify(aiResult.orderData) } : {}),
        ...(aiResult.intent === "NEED_HUMAN" ? { status: "needs_check" } : {}),
      });

      console.log(`[Webhook/lunch/message] AI 초안 생성: phase=${aiResult.phase} intent=${aiResult.intent} len=${aiResult.response.length}`);
    } catch (aiErr) {
      console.error("[Webhook/lunch/message] AI 초안 생성 실패:", aiErr);
      // AI 실패해도 메시지 수신은 정상 처리
    }
  }

  return NextResponse.json({ status: "ok" });
}
