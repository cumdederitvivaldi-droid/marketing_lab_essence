// 채널톡 Desk API (비공개) — 메시지 삭제 등 Open API에서 미지원 기능
// 인증: 데스크 로그인 세션 쿠키 (x-account, ch-session-1)

const CHANNEL_ID = "64368";
const DESK_API = "https://desk-api.channel.io";

function getDeskCookie(): string | null {
  return process.env.CHANNELTALK_DESK_COOKIE || null;
}

/** 데스크 쿠키 만료 확인 — x-account JWT의 exp 체크 */
export function getDeskCookieExpiry(): { valid: boolean; expiresAt: string | null; daysLeft: number } {
  const cookie = getDeskCookie();
  if (!cookie) return { valid: false, expiresAt: null, daysLeft: 0 };

  const match = cookie.match(/x-account=([^;]+)/);
  if (!match) return { valid: false, expiresAt: null, daysLeft: 0 };

  try {
    const payload = match[1].split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
    const exp = decoded.exp * 1000;
    const now = Date.now();
    const daysLeft = Math.floor((exp - now) / 86400000);
    return {
      valid: exp > now,
      expiresAt: new Date(exp).toISOString(),
      daysLeft: Math.max(0, daysLeft),
    };
  } catch {
    return { valid: false, expiresAt: null, daysLeft: 0 };
  }
}

/** 데스크 API fetch 헬퍼 */
async function deskFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const cookie = getDeskCookie();
  if (!cookie) throw new Error("CHANNELTALK_DESK_COOKIE 환경변수가 설정되지 않았습니다");

  return fetch(`${DESK_API}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      cookie,
      ...options.headers,
    },
  });
}

/** 메시지 삭제 */
export async function deleteMessage(userChatId: string, messageId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await deskFetch(
    `/desk/channels/${CHANNEL_ID}/user-chats/${userChatId}/messages/${messageId}`,
    { method: "DELETE" }
  );

  if (res.ok) return { ok: true };

  const body = await res.json().catch(() => null);
  const errMsg = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;

  // 401/403 → 쿠키 만료
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "데스크 세션이 만료되었습니다. 설정에서 쿠키를 갱신해주세요." };
  }

  return { ok: false, error: errMsg };
}
