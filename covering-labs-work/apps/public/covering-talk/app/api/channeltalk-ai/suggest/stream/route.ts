import { NextRequest } from "next/server";
import { suggestAnswersStreaming } from "@/lib/channeltalk-ai/suggest";
import type { PipelineStep } from "@/lib/channeltalk-ai/suggest";

// [CS-CAI-003] AI 추천 답변 — 스트리밍 (파이프라인 실시간 표시)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      message,
      tags = [],
      recentTurns = [],
      previousCategories = [],
    } = body as {
      message: string;
      tags?: string[];
      recentTurns?: Array<{ role: "user" | "manager"; text: string; senderName?: string }>;
      previousCategories?: string[];
    };

    if (!message) {
      return new Response(JSON.stringify({ error: "message는 필수입니다" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: PipelineStep) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            // stream already closed
          }
        };

        try {
          const result = await suggestAnswersStreaming(
            { customerMessage: message, chatTags: tags, recentTurns, previousCategories },
            emit,
          );

          // 최종 결과도 전송
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "result", status: "done", label: "최종 결과", data: result })}\n\n`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "error", status: "error", label: msg })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[CAI-003] 스트리밍 추천 API 오류:", err);
    return new Response(JSON.stringify({ error: "스트리밍 추천 중 오류가 발생했습니다" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
