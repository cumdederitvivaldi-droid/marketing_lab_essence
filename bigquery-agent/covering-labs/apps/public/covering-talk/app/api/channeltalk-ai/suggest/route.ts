import { NextRequest, NextResponse } from "next/server";
import { suggestAnswers, generatePolicyAnswerDirect, generateAiThenHuman, generateMacroAnswer, generateCombinedAnswer } from "@/lib/channeltalk-ai/suggest";

// [CS-CAI-001] 커버링 AI 상담 답변 추천
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const {
      chatId,
      message,
      tags = [],
      recentTurns = [],
      previousCategories = [],
      skipValidation = false,
      skipPolicy = false,
      classifyModel,
      debug = false,
      mode = "default",
      customerContext,
    } = body as {
      chatId: string;
      message: string;
      tags?: string[];
      recentTurns?: Array<{ role: "user" | "manager"; text: string; senderName?: string }>;
      previousCategories?: string[];
      skipValidation?: boolean;
      skipPolicy?: boolean;
      classifyModel?: string;
      debug?: boolean;
      mode?: "default" | "policy-only" | "ai-then-human" | "macro-match" | "raw" | "combined";
      customerContext?: {
        name?: string;
        grade?: string;
        isSubscriber?: boolean;
        subscriptionDate?: string;
        address?: string;
        totalOrders?: string;
        validOrders?: string;
        recentOrders?: Array<{ date: string; orderName: string; status: string; weight: string }>;
        activeOrders?: Array<{ orderId: string; orderName: string; status: string; pickupDate: string; address: string }>;
        deliveries?: Array<{ bookId: string; status: number; receivedDate: string | null; deliveredDate: string | null; address: string | null; allocatedDate: string | null }>;
      };
    };

    if (!message) {
      return NextResponse.json(
        { error: "message는 필수입니다" },
        { status: 400 }
      );
    }

    // 매크로 직접 매칭 모드
    if (mode === "macro-match") {
      const answer = await generateMacroAnswer({
        customerMessage: message,
        recentTurns,
        previousCategories,
      });
      return NextResponse.json(answer);
    }

    // AI 초안 → 인간 답변 매칭 모드
    if (mode === "ai-then-human") {
      const answer = await generateAiThenHuman({
        customerMessage: message,
        chatTags: tags,
        recentTurns,
        previousCategories,
      });
      return NextResponse.json(answer);
    }

    // 1회 통합 모드 (분류+답변 합침)
    if (mode === "combined") {
      const answer = await generateCombinedAnswer({
        customerMessage: message,
        chatTags: tags,
        recentTurns,
        customerContext,
      });
      return NextResponse.json(answer);
    }

    // 정책문서 기반 AI 답변 모드
    if (mode === "policy-only") {
      const answer = await generatePolicyAnswerDirect({
        customerMessage: message,
        chatTags: tags,
        recentTurns,
        previousCategories,
        skipPolicy,
        classifyModel,
        customerContext,
      });
      return NextResponse.json(answer);
    }

    const result = await suggestAnswers({
      customerMessage: message,
      chatTags: tags,
      recentTurns,
      previousCategories,
      skipValidation,
      debug,
      skipNormalize: mode === "raw",
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[CAI-001] 추천 API 오류:", err);
    return NextResponse.json(
      { error: "답변 추천 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
