import {
  UserChatsResponse,
  MessagesResponse,
  ChannelTalkMessage,
  ChannelTalkManager,
} from "./types";

const BASE_URL = "https://api.channel.io";
const ACCESS_KEY = process.env.CHANNELTALK_ACCESS_KEY!;
const ACCESS_SECRET = process.env.CHANNELTALK_ACCESS_SECRET!;

// ─── 공통 fetch 헬퍼 ───

async function ctFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-access-key": ACCESS_KEY,
        "x-access-secret": ACCESS_SECRET,
        ...options.headers,
      },
    });

    // 429 — Retry-After 헤더(초) 또는 backoff(0.8s × attempt) 후 재시도
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5000)
        : 800 * (attempt + 1);
      console.warn(`[ChannelTalk] 429 → ${waitMs}ms 후 재시도 (${attempt + 1}/${MAX_RETRIES}) ${path}`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(`[ChannelTalk] ${options.method ?? "GET"} ${path} → ${res.status}:`, text);
      throw new Error(`ChannelTalk API ${res.status}: ${text.substring(0, 200)}`);
    }

    return res.json() as Promise<T>;
  }

  throw new Error(`ChannelTalk API 429 retries exhausted: ${path}`);
}

// ─── 유저챗 목록 조회 ───

export async function listUserChats(params: {
  state: "opened" | "closed" | "snoozed";
  sortOrder?: "asc" | "desc";
  limit?: number;
  since?: string;
}): Promise<UserChatsResponse> {
  const query = new URLSearchParams({
    state: params.state,
    sortOrder: params.sortOrder ?? "desc",
    limit: String(params.limit ?? 50),
  });
  if (params.since) query.set("since", params.since);

  return ctFetch<UserChatsResponse>(`/open/v5/user-chats?${query}`);
}

// 페이지네이션으로 유저챗 조회 (maxPages로 페이지 수 제한 가능)
export async function listAllUserChats(params: {
  state: "opened" | "closed" | "snoozed";
  sortOrder?: "asc" | "desc";
  maxPages?: number;
}): Promise<UserChatsResponse> {
  const allChats: UserChatsResponse["userChats"] = [];
  const allMessages: UserChatsResponse["messages"] = [];
  const usersMap = new Map<string, UserChatsResponse["users"] extends (infer U)[] | undefined ? U : never>();
  const managersMap = new Map<string, UserChatsResponse["managers"] extends (infer U)[] | undefined ? U : never>();

  let since: string | undefined;
  let page = 0;
  const maxPages = params.maxPages ?? Infinity;
  while (page < maxPages) {
    const data = await listUserChats({ ...params, limit: 50, since });
    allChats.push(...(data.userChats ?? []));
    allMessages.push(...(data.messages ?? []));
    for (const u of data.users ?? []) usersMap.set(u.id, u);
    for (const m of data.managers ?? []) managersMap.set(m.id, m);
    page++;

    if (!data.next || (data.userChats ?? []).length < 50) break;
    since = data.next;
  }

  return {
    userChats: allChats,
    messages: allMessages,
    users: [...usersMap.values()],
    managers: [...managersMap.values()],
  };
}

// ─── 케이스(통계) 조회 ───

export interface UserChatCase {
  id: string;
  userChatId: string;
  channelId: string;
  userId: string;
  assigneeId?: string;
  tags?: string[];
  direction?: "INBOUND" | "OUTBOUND";
  openedAt?: number[];
  closedAt?: number[];
  askedAt?: number[];
  // 배열 필드 (케이스 사이클별)
  waitingTime?: number[];
  replyTime?: number[];
  operationWaitingTime?: number[];
  operationAvgReplyTime?: number[];
  operationTotalReplyTime?: number[];
  operationReplyCount?: number[];
  operationResolutionTime?: number[];
  snoozedTime?: number[];
  // 단일 값 필드 (전체 기간 합산)
  avgReplyTime?: number;
  totalReplyTime?: number;
  replyCount?: number;
  resolutionTime?: number;
  leadTime?: number;
  totalSnoozedTime?: number;
  createdAt: number;
  updatedAt: number;
  userChatCreatedAt?: number;
  mediumType?: string;
}

interface CasesResponse {
  cases: UserChatCase[];
  next?: string;
}

export async function listUserChatCases(params: {
  from: number;
  to: number;
  limit?: number;
  since?: string;
  sortOrder?: "asc" | "desc";
}): Promise<CasesResponse> {
  const query = new URLSearchParams({
    from: String(params.from),
    to: String(params.to),
    limit: String(params.limit ?? 500),
    sortOrder: params.sortOrder ?? "desc",
  });
  if (params.since) query.set("since", params.since);
  return ctFetch<CasesResponse>(`/open/v5/user-chats/cases?${query}`);
}

/**
 * 단일 윈도우 [chunkFrom, chunkTo] 내 cases 를 모두 가져온다.
 * 윈도우 안에서 500 건 한도에 걸리면 to 를 가장 오래된 createdAt 직전으로
 * 줄여 가며 추가 쿼리 (boundary 누락 방지 위해 가장 오래된 케이스의 id 중복 제거).
 */
async function fetchCasesInWindow(chunkFrom: number, chunkTo: number): Promise<UserChatCase[]> {
  const collected: UserChatCase[] = [];
  const seenIds = new Set<string>();
  let pageTo = chunkTo;
  let safety = 0;
  while (safety < 50) {
    safety++;
    const data = await listUserChatCases({ from: chunkFrom, to: pageTo, limit: 500 });
    const got = data.cases ?? [];
    for (const c of got) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        collected.push(c);
      }
    }
    if (got.length < 500) break;
    const oldest = got.at(-1)!.createdAt;
    if (oldest <= chunkFrom) break;
    pageTo = oldest;  // boundary 의 case 들도 다시 받아서 dedupe
  }
  return collected;
}

export async function listAllUserChatCases(params: {
  from: number;
  to: number;
}): Promise<UserChatCase[]> {
  // KST 자정 기준 일별로 분할 후 병렬 쿼리 → 결과 합산.
  // 일별 분할 이유: Channel Talk Cases API 가 한 윈도우당 500 건만 안정적으로
  // 반환하고 since 커서를 신뢰성 있게 주지 않음. 일별로 쪼개야 안전.
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  // params.from 이 속한 KST 자정
  const fromKstMidnight = (() => {
    const d = new Date(params.from + KST_OFFSET);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime() - KST_OFFSET;
  })();

  const ranges: Array<{ from: number; to: number }> = [];
  for (let dayStart = fromKstMidnight; dayStart < params.to; dayStart += DAY_MS) {
    const dayEnd = Math.min(dayStart + DAY_MS - 1, params.to);
    const fromCapped = Math.max(dayStart, params.from);
    if (fromCapped >= dayEnd) continue;
    ranges.push({ from: fromCapped, to: dayEnd });
  }

  const results = await Promise.all(
    ranges.map((r) => fetchCasesInWindow(r.from, r.to))
  );

  // 일별 분할 사이 boundary 에서 동일 case 가 양쪽에 잡힐 가능성 → dedupe
  const seen = new Set<string>();
  const all: UserChatCase[] = [];
  for (const arr of results) {
    for (const c of arr) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        all.push(c);
      }
    }
  }
  return all;
}

// ─── 단일 유저챗 조회 ───

export async function getUserChat(userChatId: string) {
  return ctFetch<{ userChat: UserChatsResponse["userChats"][0] }>(
    `/open/v5/user-chats/${userChatId}`
  );
}

// ─── 메시지 조회 ───

export async function getMessages(
  userChatId: string,
  params?: { sortOrder?: "asc" | "desc"; limit?: number; since?: string }
): Promise<MessagesResponse> {
  const query = new URLSearchParams({
    sortOrder: params?.sortOrder ?? "asc",
    limit: String(params?.limit ?? 100),
  });
  if (params?.since) query.set("since", params.since);

  return ctFetch<MessagesResponse>(
    `/open/v5/user-chats/${userChatId}/messages?${query}`
  );
}

// ─── 메시지 전송 ───

// 채널톡 rich 태그 유효성 보정 — API가 파싱 못하는 깨진 태그 방지
function sanitizeRichTags(text: string): string {
  // 1. <b>/<i> 태그의 열기/닫기 짝 확인
  for (const tag of ["b", "i"] as const) {
    const openRe = new RegExp(`<${tag}>`, "g");
    const closeRe = new RegExp(`</${tag}>`, "g");
    const opens = (text.match(openRe) || []).length;
    const closes = (text.match(closeRe) || []).length;
    if (opens !== closes) {
      // 짝이 안 맞으면 해당 태그 모두 제거
      text = text.replace(openRe, "").replace(closeRe, "");
    }
  }
  // 2. <link> 태그 짝 확인 — 열기(<link ...>)와 닫기(</link>) 수가 다르면 깨진 link 제거
  const linkOpens = (text.match(/<link[^>]*>/g) || []).length;
  const linkCloses = (text.match(/<\/link>/g) || []).length;
  if (linkOpens !== linkCloses) {
    // 완전한 <link ...>...</link> 쌍만 유지하고, 깨진 것은 내용만 남김
    text = text.replace(/<link[^>]*>([^<]*?)(?:<\/link>)?/g, (match, content) => {
      if (match.endsWith("</link>")) return match; // 정상 쌍
      return content; // 닫기 태그 없음 → 내용만 유지
    });
    text = text.replace(/<\/link>/g, ""); // 고아 닫기 태그 제거
  }
  return text;
}

// URL을 채널톡 링크 태그로 변환 (이미 <link> 태그 안에 있는 URL은 건너뜀)
// 자주 사용되는 URL → 친절한 표시 텍스트 매핑
const URL_DISPLAY_LABELS: [RegExp, string][] = [
  [/^https?:\/\/pf\.kakao\.com\//, "카카오톡 채널"],
  [/^https?:\/\/covering\.co\.kr/, "커버링 홈페이지"],
];

function wrapUrlsWithLinkTag(text: string): string {
  // <link> 태그 밖의 URL만 변환 (이미 <link> 태그 안에 있는 URL은 건너뜀)
  // <link ...>...</link> 블록과 그 사이의 일반 텍스트를 분리
  const parts = text.split(/(<link[^>]*>.*?<\/link>)/g);
  return parts.map((part) => {
    // <link> 태그 블록이면 그대로 반환
    if (part.startsWith("<link")) return part;
    // 일반 텍스트: URL을 <link> 태그로 변환
    return part.replace(
      /(https?:\/\/[^\s<>"')\]]+)/g,
      (url) => {
        const match = URL_DISPLAY_LABELS.find(([pattern]) => pattern.test(url));
        const label = match ? match[1] : url;
        return `<link type="url" value="${url}">${label}</link>`;
      }
    );
  }).join("");
}

export async function sendMessage(
  userChatId: string,
  text: string,
  options?: {
    botName?: string;
    actAsManager?: boolean;
    isInternal?: boolean;
    richText?: boolean; // true면 태그 변환 적용
    mentionedManagerIds?: string[];
  }
): Promise<ChannelTalkMessage> {
  const query = new URLSearchParams();
  if (options?.botName) query.set("botName", options.botName);

  const msgOptions: string[] = [];
  if (options?.actAsManager) msgOptions.push("actAsManager");
  if (options?.isInternal) {
    msgOptions.push("private", "silentToUser");
  }
  // URL 자동 링크 변환 (내부 대화 제외, 멘션 <link> 태그가 있으면 그대로 유지)
  let value = options?.isInternal ? text : wrapUrlsWithLinkTag(text);

  // <b>/<i> 태그 유효성 보정 — 닫히지 않은 태그 제거, 짝 안 맞는 태그 정리
  value = sanitizeRichTags(value);

  const body: Record<string, unknown> = {
    blocks: [{ type: "text", value }],
    ...(msgOptions.length > 0 ? { options: msgOptions } : {}),
  };

  return ctFetch<ChannelTalkMessage>(
    `/open/v5/user-chats/${userChatId}/messages${query.toString() ? `?${query}` : ""}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

// ─── 파일/이미지 메시지 전송 ───

export async function sendFileMessage(
  userChatId: string,
  fileUrl: string,
  fileName: string,
  options?: {
    botName?: string;
    actAsManager?: boolean;
    isImage?: boolean;
    isInternal?: boolean;
    contentType?: string;
    fileSize?: number;
    width?: number;
    height?: number;
  }
): Promise<ChannelTalkMessage> {
  // App API로 파일 인라인 전송 시도 (이미지/PDF/문서 등 모든 파일)
  // 내부대화는 App API에서 private 옵션이 동작하지 않으므로 Open API fallback 사용
  if (!options?.isInternal) {
    try {
      const { sendFileViaApp } = await import("./app-client");
      const result = await sendFileViaApp(userChatId, fileUrl, fileName, {
        botName: options?.botName ?? "커버링",
        mime: options?.contentType ?? (options?.isImage ? "image/png" : "application/octet-stream"),
      });
      if (result.success) {
        return { id: "app-file" } as ChannelTalkMessage;
      }
      console.error("[CT] App API 실패, fallback:", result.error);
    } catch (err) {
      console.error("[CT] App API 예외, fallback:", err);
    }
  }

  // Fallback: Open API 텍스트 URL 전송
  const query = new URLSearchParams();
  if (options?.botName) query.set("botName", options.botName);

  const msgOptions: string[] = [];
  if (options?.actAsManager) msgOptions.push("actAsManager");
  if (options?.isInternal) {
    msgOptions.push("private", "silentToUser");
  }

  const body: Record<string, unknown> = {
    ...(msgOptions.length > 0 ? { options: msgOptions } : {}),
  };

  // 내부대화는 <link> 태그가 렌더러에서 깨지므로 plain URL (채널톡이 자동 감지)
  // 그 외는 <link> 태그로 명시적 링크
  const icon = options?.isImage ? "📷" : "📎";
  if (options?.isInternal) {
    body.blocks = [
      { type: "text", value: `${icon} ${fileName}\n${fileUrl}` },
    ];
  } else {
    body.blocks = [
      { type: "text", value: `${icon} ${fileName}\n<link type="url" value="${fileUrl}">${fileUrl}</link>` },
    ];
  }

  return ctFetch<ChannelTalkMessage>(
    `/open/v5/user-chats/${userChatId}/messages${query.toString() ? `?${query}` : ""}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

// ─── 유저챗 상태 변경 ───

export async function closeChat(userChatId: string, botName = "커버링"): Promise<void> {
  await ctFetch(`/open/v4/user-chats/${userChatId}/close?botName=${encodeURIComponent(botName)}`, {
    method: "PATCH",
  });
}

export async function openChat(userChatId: string, botName = "커버링"): Promise<void> {
  await ctFetch(`/open/v4/user-chats/${userChatId}/open?botName=${encodeURIComponent(botName)}`, {
    method: "PUT",
  });
}

export async function snoozeChat(
  userChatId: string,
  opts: { duration?: string; reopenedAt?: number } = {},
  botName = "커버링"
): Promise<void> {
  // reopenedAt → 분 단위 duration으로 변환 (채널톡 API는 duration만 지원)
  let duration = opts.duration || "PT4H";
  if (opts.reopenedAt) {
    const diffMs = opts.reopenedAt - Date.now();
    const diffMin = Math.max(1, Math.round(diffMs / 60000));
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    duration = hours > 0 && mins > 0 ? `PT${hours}H${mins}M` : hours > 0 ? `PT${hours}H` : `PT${mins}M`;
  }
  const query = new URLSearchParams({ botName, duration });
  await ctFetch(`/open/v4/user-chats/${userChatId}/snooze?${query}`, {
    method: "PUT",
  });
}

export async function assignChat(
  userChatId: string,
  managerId: string,
  botName = "커버링"
): Promise<void> {
  await ctFetch(
    `/open/v4/user-chats/${userChatId}/assign-to/managers/${managerId}?botName=${encodeURIComponent(botName)}`,
    { method: "PATCH" }
  );
}

// ─── 태그 수정 ───

export async function updateChatTags(
  userChatId: string,
  tags: string[]
): Promise<void> {
  const endpoint = `/open/v4/user-chats/${userChatId}`;
  console.log("[CT] updateChatTags →", userChatId, JSON.stringify(tags));

  // 채널톡 API: tags는 append-only → 교체하려면 null로 초기화 후 다시 추가
  // Step 1: 기존 태그 전체 삭제
  await ctFetch<Record<string, unknown>>(endpoint, {
    method: "PATCH",
    body: JSON.stringify({ tags: null }),
  });

  // Step 2: 새 태그 추가 (빈 배열이면 스킵)
  if (tags.length > 0) {
    const res = await ctFetch<Record<string, unknown>>(endpoint, {
      method: "PATCH",
      body: JSON.stringify({ tags }),
    });
    console.log("[CT] updateChatTags ←", JSON.stringify(res).substring(0, 300));
  }
}

// ─── 유저별 상담 목록 조회 ───

export async function listUserChatsByUserId(userId: string, params?: {
  sortOrder?: "asc" | "desc";
  limit?: number;
}): Promise<UserChatsResponse> {
  const query = new URLSearchParams({
    sortOrder: params?.sortOrder ?? "desc",
    limit: String(params?.limit ?? 20),
  });
  return ctFetch<UserChatsResponse>(`/open/v5/users/${userId}/user-chats?${query}`);
}

// ─── 상담 설명 수정 ───

export async function updateChatDescription(
  userChatId: string,
  description: string
): Promise<void> {
  await ctFetch(`/open/v4/user-chats/${userChatId}`, {
    method: "PATCH",
    body: JSON.stringify({ description }),
  });
}

// ─── 유저 프로필 수정 ───

export async function updateUserProfile(
  userId: string,
  profile: { name?: string; mobileNumber?: string; email?: string }
): Promise<void> {
  await ctFetch(`/open/v5/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ profile }),
  });
}

// ─── 매니저 목록 조회 ───

export async function listManagers(): Promise<ChannelTalkManager[]> {
  const res = await ctFetch<{ managers: ChannelTalkManager[] }>(
    "/open/v4/managers?limit=100"
  );
  return res.managers ?? [];
}
