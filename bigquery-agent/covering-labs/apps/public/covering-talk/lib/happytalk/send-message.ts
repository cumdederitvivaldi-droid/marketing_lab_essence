import { sendPlainMessage } from "./client";

const MAX_MESSAGE_LENGTH = 1000;

/**
 * 1000자 초과 메시지를 분할하여 순차 발송
 */
export async function sendSplitMessage(params: {
  user_key: string;
  sender_key: string;
  message: string;
}): Promise<void> {
  const chunks = splitMessage(params.message, MAX_MESSAGE_LENGTH);

  for (const chunk of chunks) {
    await sendPlainMessage({
      user_key: params.user_key,
      sender_key: params.sender_key,
      message: chunk,
    });
  }
}

export function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // 단어 경계에서 자르기 (가능하면)
    let cutAt = maxLength;
    const lastNewline = remaining.lastIndexOf("\n", maxLength);
    const lastSpace = remaining.lastIndexOf(" ", maxLength);

    if (lastNewline > maxLength * 0.7) {
      cutAt = lastNewline + 1;
    } else if (lastSpace > maxLength * 0.7) {
      cutAt = lastSpace + 1;
    }

    chunks.push(remaining.slice(0, cutAt).trimEnd());
    remaining = remaining.slice(cutAt).trimStart();
  }

  return chunks;
}
