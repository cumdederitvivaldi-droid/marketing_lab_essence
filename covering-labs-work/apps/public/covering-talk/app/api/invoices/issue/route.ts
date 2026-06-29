import { NextRequest, NextResponse } from "next/server";
import { pickupInvoiceStore } from "@/lib/store/pickup-invoices";
import { issueTaxInvoice, getTaxInvoice } from "@/lib/bolta/client";
import { supabase } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/session";

// Vercel 함수 타임아웃 60초 (볼타 API 호출 + ntsTransactionId 후속 조회)
export const maxDuration = 60;

// [CS-ETC-064] 방문수거 단건 세금계산서 발행
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const {
      sessionId,
      email,
      businessNumber,
      businessName,
      representativeName,
      totalAmount,
      itemName,
      description,
    } = body as {
      sessionId?: string | null;
      email?: string;
      businessNumber?: string;
      businessName?: string;
      representativeName?: string;
      totalAmount?: number;
      itemName?: string;
      description?: string;
    };

    if (!email || !businessNumber || !businessName || !representativeName || !totalAmount) {
      return NextResponse.json(
        { error: "email, businessNumber, businessName, representativeName, totalAmount 필수" },
        { status: 400 }
      );
    }

    const totalAmountNum = Number(totalAmount);
    if (!Number.isFinite(totalAmountNum) || totalAmountNum <= 0) {
      return NextResponse.json({ error: "totalAmount는 양수여야 합니다" }, { status: 400 });
    }

    // 사업자번호 정규화
    const normalizeBizNumber = (v: string) => (v || "").replace(/\D/g, "");
    const suppliedBizNumber = normalizeBizNumber(businessNumber);
    if (suppliedBizNumber.length !== 10 && suppliedBizNumber.length !== 13) {
      return NextResponse.json(
        { error: `사업자번호 형식 오류: ${businessNumber} (숫자 10 또는 13자리 필요)` },
        { status: 400 }
      );
    }

    // 공급가액/세액 계산 (10/11 : 1/11)
    const supplyCost = Math.round(totalAmountNum / 11 * 10);
    const tax = totalAmountNum - supplyCost;

    // 발행자
    const currentUser = await getCurrentUser();
    const createdBy = currentUser?.name ?? null;

    // ── invoice 레코드 생성 (pending) ──
    const invoice = await pickupInvoiceStore.create({
      sessionId: sessionId ?? null,
      email: email.trim(),
      businessNumber: suppliedBizNumber,
      businessName: businessName.trim(),
      representativeName: representativeName.trim(),
      supplyCost,
      tax,
      totalAmount: totalAmountNum,
      description: (description ?? "").trim(),
      createdBy,
    });

    if (!invoice) {
      return NextResponse.json({ error: "발행 레코드 생성 실패" }, { status: 500 });
    }

    // ── 볼타 API 발행 ──
    try {
      const today = new Date().toISOString().slice(0, 10);
      const envTrim = (v: string | undefined) => (v || "").trim();
      const normalizePhone = (v: string | undefined) => (v || "").replace(/[\s()./·]/g, "");

      const defaultItemName = "방문수거 서비스";
      const finalItemName = itemName?.trim() || defaultItemName;

      const result = await issueTaxInvoice({
        date: today,
        purpose: "RECEIPT",
        supplier: {
          identificationNumber: normalizeBizNumber(envTrim(process.env.BOLTA_SUPPLIER_BIZ_NUMBER)),
          organizationName: envTrim(process.env.BOLTA_SUPPLIER_NAME) || "커버링",
          representativeName: envTrim(process.env.BOLTA_SUPPLIER_REP_NAME),
          manager: {
            email: envTrim(process.env.BOLTA_SUPPLIER_EMAIL),
            telephone: normalizePhone(process.env.BOLTA_SUPPLIER_PHONE) || undefined,
          },
        },
        supplied: {
          identificationNumber: suppliedBizNumber,
          organizationName: businessName.trim(),
          representativeName: representativeName.trim(),
          managers: [{ email: email.trim() }],
        },
        items: [{
          date: today,
          name: finalItemName,
          supplyCost,
          tax,
        }],
        description: description?.trim() || undefined,
      });

      // 성공 — issuanceKey 저장
      await pickupInvoiceStore.markIssued(invoice.id, result.issuanceKey, null);

      // ntsTransactionId 후속 조회 (실패해도 발행은 성공)
      try {
        const detail = await getTaxInvoice(result.issuanceKey);
        if (detail.ntsTransactionId) {
          await supabase
            .from("pickup_invoices")
            .update({ nts_transaction_id: detail.ntsTransactionId })
            .eq("id", invoice.id);
        }
      } catch { /* nts id 조회 실패 무시 */ }

      return NextResponse.json({
        success: true,
        invoiceId: invoice.id,
        issuanceKey: result.issuanceKey,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "볼타 API 오류";
      await pickupInvoiceStore.markFailed(invoice.id, msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } catch (err) {
    console.error("[invoices/issue] error:", err);
    return NextResponse.json({ error: "발행 처리 실패" }, { status: 500 });
  }
}
