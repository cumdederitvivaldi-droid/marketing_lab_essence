import { NextRequest, NextResponse } from "next/server";
import { createMessage } from "@/lib/ai/ai-client";

const POLISH_SYSTEM = `너는 커버링 방문수거 서비스의 고객 응대 메시지를 다듬어주는 도우미야.

## 말투 규칙
- 정중하되 친근한 존댓말 기본.
- 이모지 자연스럽게 사용 (0~2개). 특히 " : )" 스타일.
- "감사합니다", "부탁드립니다" 등 정중한 마무리.
- 불편한 상황에서는 "번거로우시겠지만" 같은 완충 표현.
- 순수 일반 텍스트. 마크다운(**, *, #, 코드블록, -)은 절대 쓰지 마.

## 예시 톤
- "네 고객님, 확인해 보겠습니다 : )"
- "수거 일정은 내일 오후 2시로 안내드릴게요!"
- "번거로우시겠지만, 주소 한 번 더 확인 부탁드립니다 : )"
- "견적은 총 150,000원(부가세 포함)으로 안내드립니다."

## 지시
- 입력된 메시지의 의미와 정보를 그대로 유지하면서, 위 톤으로 자연스럽게 다듬어줘.
- 내용을 추가하거나 빼지 마. 말투만 바꿔.
- 다듬은 메시지만 출력해. 설명이나 부연 없이.`;

// [CS-ETC-014] AI 메시지 다듬기
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  await params; // validate route param exists

  try {
    const { message } = await req.json();
    if (!message || !message.trim()) {
      return NextResponse.json({ error: "메시지를 입력해주세요" }, { status: 400 });
    }

    const response = await createMessage({
      model: "haiku",
      max_tokens: 1024,
      system: POLISH_SYSTEM,
      messages: [{ role: "user", content: message.trim() }],
    });

    const polished = response.text;

    return NextResponse.json({ polished });
  } catch (err) {
    console.error("[polish] error:", err);
    return NextResponse.json({ error: "다듬기 실패" }, { status: 500 });
  }
}
