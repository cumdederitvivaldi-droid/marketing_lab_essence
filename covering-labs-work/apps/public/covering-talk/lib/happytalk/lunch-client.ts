/**
 * 런치 전용 해피톡 클라이언트
 * 방문수거 채널(HT_CLIENT_ID/SENDER_KEY)과 분리된 런치 채널 자격증명 사용
 *
 * 환경변수:
 *   LUNCH_HT_CLIENT_ID     — 런치 채널 HT Client ID
 *   LUNCH_HT_CLIENT_SECRET — 런치 채널 HT Client Secret
 *   LUNCH_SENDER_KEY       — 런치 카카오 채널 sender_key
 *   HAPPYTALK_API_HOST     — 공용 (방문수거와 동일 호스트)
 */

import { HappyTalkResponse, SendPlainMessageParams } from "./types";
import { generateSerialNumber } from "../utils/serial-number";

// 런치 전용 호스트 (테스트: patch-kakao-api / 운영: kakao-api)
const API_HOST = (process.env.LUNCH_HAPPYTALK_API_HOST || process.env.HAPPYTALK_API_HOST || "").trim();

function lunchHeaders() {
  return {
    "Content-Type": "application/json",
    "HT-Client-Id": (process.env.LUNCH_HT_CLIENT_ID || "").trim(),
    "HT-Client-Secret": (process.env.LUNCH_HT_CLIENT_SECRET || "").trim(),
  };
}

function lunchSenderKey() {
  return (process.env.LUNCH_SENDER_KEY || "").trim();
}

/** 런치 채널 텍스트 메시지 발송 */
export async function sendLunchPlainMessage(params: {
  user_key: string;
  message: string;
  sender_key?: string;
}): Promise<HappyTalkResponse> {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const body: SendPlainMessageParams = {
      user_key: params.user_key,
      sender_key: params.sender_key ?? lunchSenderKey(),
      serial_number: generateSerialNumber("lunch"),
      chat_bubble_type: "TEXT",
      message: params.message,
    };

    try {
      const response = await fetch(
        `${API_HOST}/kakaoWebhook/v3/bzc/chat/send/plain`,
        { method: "POST", headers: lunchHeaders(), body: JSON.stringify(body) }
      );

      if (!response.ok) {
        const text = await response.text();
        console.error(`[LunchHT] HTTP ${response.status} (시도 ${attempt + 1}):`, text);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`LunchHT HTTP ${response.status}: ${text.substring(0, 200)}`);
      }

      const result: HappyTalkResponse = await response.json();
      if (result.code !== "0") {
        console.error(`[LunchHT] 발송 실패 code=${result.code} (시도 ${attempt + 1}):`, result);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`LunchHT API Error: ${result.code} - ${result.message ?? "Unknown"}`);
      }
      return result;
    } catch (err) {
      if (attempt < MAX_RETRIES && err instanceof TypeError) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw new Error("LunchHT: 최대 재시도 횟수 초과");
}

/** 런치 채널 파일 업로드 → 해피톡 CDN URL 반환 */
export async function uploadLunchFile(params: {
  file: File | Blob;
  fileName: string;
  sender_key?: string;
}): Promise<{ fileUrl: string; fileName: string; fileSize: number }> {
  const formData = new FormData();
  formData.append("sender_key", params.sender_key ?? lunchSenderKey());
  formData.append("file", params.file, params.fileName);

  const response = await fetch(
    `${API_HOST}/kakaoWebhook/v3/bzc/file/upload`,
    {
      method: "POST",
      headers: {
        "HT-Client-Id": process.env.LUNCH_HT_CLIENT_ID!,
        "HT-Client-Secret": process.env.LUNCH_HT_CLIENT_SECRET!,
      },
      body: formData,
    }
  );

  const result = await response.json();
  if (result.code !== "0000") {
    console.error("[LunchHT] 파일 업로드 실패:", result);
    throw new Error(`LunchHT File Upload Error: ${result.code} - ${result.message ?? "Unknown"}`);
  }
  return { fileUrl: result.file, fileName: result.name ?? params.fileName, fileSize: result.size ?? 0 };
}

/** 런치 채널 파일 메시지 발송 (chat_bubble_type: FILE) */
export async function sendLunchFileMessage(params: {
  user_key: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  sender_key?: string;
}): Promise<HappyTalkResponse> {
  const body: SendPlainMessageParams = {
    user_key: params.user_key,
    sender_key: params.sender_key ?? lunchSenderKey(),
    serial_number: generateSerialNumber("lunchfile"),
    chat_bubble_type: "FILE",
    attachment: {
      file: { file_url: params.fileUrl, file_name: params.fileName, file_size: params.fileSize },
    },
  };

  const response = await fetch(
    `${API_HOST}/kakaoWebhook/v3/bzc/chat/send/plain`,
    { method: "POST", headers: lunchHeaders(), body: JSON.stringify(body) }
  );

  const result: HappyTalkResponse = await response.json();
  if (result.code !== "0") {
    console.error("[LunchHT] 파일 발송 실패:", result);
    throw new Error(`LunchHT File API Error: ${result.code} - ${result.message ?? "Unknown"}`);
  }
  return result;
}

/** 런치 채널 이미지 메시지 발송 */
export async function sendLunchImageMessage(params: {
  user_key: string;
  imageUrl: string;
  message?: string;
  sender_key?: string;
}): Promise<HappyTalkResponse> {
  const body: SendPlainMessageParams = {
    user_key: params.user_key,
    sender_key: params.sender_key ?? lunchSenderKey(),
    serial_number: generateSerialNumber("lunchimg"),
    chat_bubble_type: "IMAGE",
    message: params.message,
    attachment: { image: { img_url: params.imageUrl } },
  };

  const response = await fetch(
    `${API_HOST}/kakaoWebhook/v3/bzc/chat/send/plain`,
    { method: "POST", headers: lunchHeaders(), body: JSON.stringify(body) }
  );

  const result: HappyTalkResponse = await response.json();
  if (result.code !== "0") {
    console.error("[LunchHT] 이미지 발송 실패:", result);
    throw new Error(`LunchHT Image API Error: ${result.code} - ${result.message ?? "Unknown"}`);
  }
  return result;
}
