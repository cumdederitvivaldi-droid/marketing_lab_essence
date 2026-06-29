/**
 * 채널톡 App Store API — Native Function 호출
 * writeUserChatMessage + botName으로 이미지 인라인 전송
 * (managerId와 botName은 oneof — 둘 중 하나만 사용 가능)
 */

const APP_API_URL = "https://app-store-api.channel.io/general/v1/native/functions";
const APP_SECRET = process.env.CHANNELTALK_APP_SECRET!;
const CHANNEL_ID = "64368";

// ─── 토큰 캐시 (30분 유효) ───

let cachedToken: { accessToken: string; refreshToken: string; expiresAt: number } | null = null;

async function callNative(method: string, params: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-access-token"] = token;

  const res = await fetch(APP_API_URL, {
    method: "PUT",
    headers,
    body: JSON.stringify({ method, params }),
  });

  const data = await res.json();
  if (data.error) {
    console.error(`[CT-App] ${method} error:`, data.error);
    throw new Error(`CT-App ${method}: ${data.error.message ?? JSON.stringify(data.error)}`);
  }
  return data.result ?? data;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  if (cachedToken?.refreshToken) {
    try {
      const result = await callNative("refreshToken", {
        refreshToken: cachedToken.refreshToken,
      });
      cachedToken = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: Date.now() + (result.expiresIn ?? 1800) * 1000,
      };
      return cachedToken.accessToken;
    } catch {
      cachedToken = null;
    }
  }

  const result = await callNative("issueToken", {
    secret: APP_SECRET,
    channelId: CHANNEL_ID,
  });

  cachedToken = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: Date.now() + (result.expiresIn ?? 1800) * 1000,
  };
  return cachedToken.accessToken;
}

// ─── 파일 전송 (이미지/PDF/문서 등 모든 파일) ───

export async function sendFileViaApp(
  userChatId: string,
  fileUrl: string,
  fileName: string,
  options?: {
    botName?: string;
    mime?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getAccessToken();

    await callNative("writeUserChatMessage", {
      channelId: CHANNEL_ID,
      userChatId,
      dto: {
        botName: options?.botName ?? "커버링",
        files: [
          {
            url: fileUrl,
            mime: options?.mime ?? "application/octet-stream",
            fileName,
          },
        ],
      },
    }, token);

    return { success: true };
  } catch (err) {
    console.error("[CT-App] sendFileViaApp error:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
