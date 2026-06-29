import { SendPlainMessageParams, HappyTalkResponse } from "./types";
import { generateSerialNumber } from "../utils/serial-number";

const API_HOST = process.env.HAPPYTALK_API_HOST;

export interface RichButton {
  name: string;
  type: "BK" | "WL" | "AL" | "MD";
  url_mobile?: string;
  url_pc?: string;
  extra?: string;
}

export interface SendRichMessageParams {
  user_key: string;
  sender_key?: string;
  message: string;
  buttons: RichButton[];
}

/** Rich 메시지 발송 (버튼 포함) */
export async function sendRichMessage(params: SendRichMessageParams): Promise<HappyTalkResponse> {
  const serialNumber = generateSerialNumber("rich");

  const body = {
    user_key: params.user_key,
    sender_key: params.sender_key ?? process.env.SENDER_KEY!,
    serial_number: serialNumber,
    chat_bubble_type: "TEXT",
    message: params.message,
    attachment: {
      buttons: params.buttons.map((btn) => ({
        name: btn.name,
        type: btn.type,
        ...(btn.url_mobile ? { url_mobile: btn.url_mobile } : {}),
        ...(btn.url_pc ? { url_pc: btn.url_pc } : {}),
        ...(btn.extra ? { extra: btn.extra } : {}),
      })),
    },
  };

  const response = await fetch(
    `${API_HOST}/kakaoWebhook/v3/bzc/chat/send/rich`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "HT-Client-Id": process.env.HT_CLIENT_ID!,
        "HT-Client-Secret": process.env.HT_CLIENT_SECRET!,
      },
      body: JSON.stringify(body),
    }
  );

  const result: HappyTalkResponse = await response.json();

  if (result.code !== "0") {
    console.error("[HappyTalk] Rich 메시지 발송 실패:", result);
    throw new Error(`HappyTalk Rich API Error: ${result.code} - ${result.message ?? "Unknown"}`);
  }

  return result;
}

export async function sendPlainMessage(
  params: Omit<SendPlainMessageParams, "serial_number" | "chat_bubble_type"> & {
    serial_number?: string;
  }
): Promise<HappyTalkResponse> {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const serialNumber =
      params.serial_number ?? generateSerialNumber("resp");

    const body: SendPlainMessageParams = {
      user_key: params.user_key,
      sender_key: params.sender_key ?? process.env.SENDER_KEY!,
      serial_number: serialNumber,
      chat_bubble_type: "TEXT",
      message: params.message,
    };

    try {
      const response = await fetch(
        `${API_HOST}/kakaoWebhook/v3/bzc/chat/send/plain`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "HT-Client-Id": process.env.HT_CLIENT_ID!,
            "HT-Client-Secret": process.env.HT_CLIENT_SECRET!,
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        console.error(`[HappyTalk] HTTP ${response.status} (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, text);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`HappyTalk HTTP ${response.status}: ${text.substring(0, 200)}`);
      }

      const result: HappyTalkResponse = await response.json();

      if (result.code !== "0") {
        console.error(`[HappyTalk] 발송 실패 code=${result.code} (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, result);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(
          `HappyTalk API Error: ${result.code} - ${result.message ?? "Unknown"}`
        );
      }

      return result;
    } catch (err) {
      if (attempt < MAX_RETRIES && err instanceof TypeError) {
        // fetch 자체 실패 (네트워크 에러)
        console.error(`[HappyTalk] 네트워크 에러 (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, err.message);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw new Error("HappyTalk: 최대 재시도 횟수 초과");
}

/** 이미지 메시지 발송 */
export async function sendImageMessage(params: {
  user_key: string;
  sender_key?: string;
  imageUrl: string;
  message?: string;
}): Promise<HappyTalkResponse> {
  const serialNumber = generateSerialNumber("img");

  const body: SendPlainMessageParams = {
    user_key: params.user_key,
    sender_key: params.sender_key ?? process.env.SENDER_KEY!,
    serial_number: serialNumber,
    chat_bubble_type: "IMAGE",
    message: params.message,
    attachment: {
      image: { img_url: params.imageUrl },
    },
  };

  const response = await fetch(
    `${API_HOST}/kakaoWebhook/v3/bzc/chat/send/plain`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "HT-Client-Id": process.env.HT_CLIENT_ID!,
        "HT-Client-Secret": process.env.HT_CLIENT_SECRET!,
      },
      body: JSON.stringify(body),
    }
  );

  const result: HappyTalkResponse = await response.json();

  if (result.code !== "0") {
    console.error("[HappyTalk] 이미지 발송 실패:", result);
    throw new Error(`HappyTalk Image API Error: ${result.code} - ${result.message ?? "Unknown"}`);
  }

  return result;
}

/** 파일 메시지 발송 (chat_bubble_type: FILE) */
export async function sendFileMessage(params: {
  user_key: string;
  sender_key?: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
}): Promise<HappyTalkResponse> {
  const body: SendPlainMessageParams = {
    user_key: params.user_key,
    sender_key: params.sender_key ?? process.env.SENDER_KEY!,
    serial_number: generateSerialNumber("file"),
    chat_bubble_type: "FILE",
    attachment: {
      file: { file_url: params.fileUrl, file_name: params.fileName, file_size: params.fileSize },
    },
  };

  const response = await fetch(
    `${API_HOST}/kakaoWebhook/v3/bzc/chat/send/plain`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "HT-Client-Id": process.env.HT_CLIENT_ID!,
        "HT-Client-Secret": process.env.HT_CLIENT_SECRET!,
      },
      body: JSON.stringify(body),
    }
  );

  const result: HappyTalkResponse = await response.json();
  if (result.code !== "0") {
    console.error("[HappyTalk] 파일 발송 실패:", result);
    throw new Error(`HappyTalk File API Error: ${result.code} - ${result.message ?? "Unknown"}`);
  }
  return result;
}
