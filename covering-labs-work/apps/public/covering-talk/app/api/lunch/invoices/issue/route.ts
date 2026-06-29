import { NextRequest, NextResponse } from "next/server";
import { lunchInvoiceStore } from "@/lib/store/lunch-invoices";
import { lunchVendorStore } from "@/lib/store/lunch-vendors";
import { supabase } from "@/lib/supabase/client";
import { issueTaxInvoice, getTaxInvoice } from "@/lib/bolta/client";

// [CS-ETC-041] 세금계산서 발행 요청 (단건 + 월말 합산)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { vendorId, period, orderId, invoiceType, itemName: itemNameOverride } = await request.json();
    if (!vendorId || !period) {
      return NextResponse.json({ error: "vendorId, period 필수" }, { status: 400 });
    }

    const isSingle = invoiceType === "single" && orderId;

    // 오늘 날짜 (YYYY-MM-DD, 서버 로컬)
    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

    // 벤더 조회
    const vendor = await lunchVendorStore.getById(vendorId);
    if (!vendor) {
      return NextResponse.json({ error: "벤더를 찾을 수 없습니다" }, { status: 404 });
    }
    if (!vendor.businessNumber || !vendor.representativeName || !vendor.taxEmail) {
      return NextResponse.json({ error: "사업자 정보가 부족합니다 (사업자번호, 대표자명, 이메일)" }, { status: 400 });
    }

    // ── 주문 조회 ──
    let targetOrders: { id: string; total_amount: number; date?: string }[];

    if (isSingle) {
      // 단건: 특정 주문 1건
      const { data, error } = await supabase
        .from("lunch_orders")
        .select("id, total_amount, date, invoice_issued, invoice_id")
        .eq("id", orderId)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
      }
      if (data.date && data.date > todayStr) {
        return NextResponse.json({ error: `미래 날짜 주문은 수거 완료 후 발행 가능합니다 (수거일: ${data.date})` }, { status: 400 });
      }
      // 단건 중복 발행 방어 — invoice_issued 플래그가 켜져있거나 invoice_id 가 매핑된 경우 즉시 차단
      //   재시도/중복 클릭으로 같은 주문에 대해 두 건의 invoice 가 만들어지는 것을 막음.
      if (data.invoice_issued || data.invoice_id) {
        return NextResponse.json(
          { error: "이미 발행된 주문입니다 (invoice_issued=true 또는 invoice_id 매핑됨)" },
          { status: 409 }
        );
      }
      targetOrders = [data];
    } else {
      // 월말 합산: 해당 월 전체 (월말정산 주문만)
      const { data, error } = await supabase
        .from("lunch_orders")
        .select("id, total_amount, date")
        .eq("vendor_id", vendorId)
        .like("date", `${period}%`)
        .eq("settlement_type", "monthly_invoice")
        .neq("status", "cancelled");
      if (error || !data || data.length === 0) {
        return NextResponse.json({ error: "해당 월 주문이 없습니다" }, { status: 400 });
      }

      // 미래 날짜 주문이 포함되어 있으면 발행 거부
      const futureOrders = data.filter((o) => o.date && o.date > todayStr);
      if (futureOrders.length > 0) {
        const futureDates = futureOrders.map((o) => o.date).sort();
        return NextResponse.json({
          error: `미래 날짜 주문이 포함되어 있어 발행할 수 없습니다 (${futureDates.slice(0, 3).join(", ")}${futureDates.length > 3 ? " 외" : ""}) - 수거 완료 후 발행 가능`
        }, { status: 400 });
      }

      targetOrders = data;

      // 월말 중복 발행 체크
      const existing = await lunchInvoiceStore.getByVendorPeriod(vendorId, period);
      if (existing?.status === "issued") {
        return NextResponse.json({ error: "이미 발행된 세금계산서입니다" }, { status: 409 });
      }
    }

    const totalAmount = targetOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const supplyCost = Math.round(totalAmount / 11 * 10);
    const tax = totalAmount - supplyCost;

    // 발행 기간: 단건은 주문 날짜, 월말은 YYYY-MM
    const invoicePeriod = isSingle ? (targetOrders[0].date || period) : period;

    // invoice 레코드 생성
    const invoice = await lunchInvoiceStore.create({
      vendorId,
      vendorName: vendor.name,
      invoiceType: isSingle ? "single" : "monthly",
      period: invoicePeriod,
      supplyCost,
      tax,
      totalAmount,
      orderCount: targetOrders.length,
      boltaCustomerKey: process.env.BOLTA_CUSTOMER_KEY || "",
    });

    if (!invoice) {
      return NextResponse.json({ error: "발행 레코드 생성 실패" }, { status: 500 });
    }

    // ── 볼타 API 발행 ──
    try {
      // 발행일: 주문일 또는 월말, 단 오늘 이전이어야 함 (볼타 제약)
      const today = new Date().toISOString().slice(0, 10);
      const rawDate = isSingle
        ? (targetOrders[0].date || `${period}-01`)
        : (() => {
            const [y, m] = period.split("-");
            const lastDay = new Date(Number(y), Number(m), 0).getDate();
            return `${period}-${String(lastDay).padStart(2, "0")}`;
          })();
      const issueDate = rawDate > today ? today : rawDate;

      const defaultItemName = isSingle
        ? `도시락용기 수거 서비스`
        : `도시락용기 수거 서비스 (${period})`;
      const itemName = (typeof itemNameOverride === "string" && itemNameOverride.trim())
        ? itemNameOverride.trim()
        : defaultItemName;

      // 사업자번호 정규화 (하이픈/공백 제거, 숫자만)
      const normalizeBizNumber = (v: string) => (v || "").replace(/\D/g, "");
      // 전화번호 정규화: 모든 공백/괄호/점 제거, 숫자와 '-'/'+' 만 유지
      const normalizePhone = (v: string | undefined): string => {
        const cleaned = (v || "").replace(/[\s()./·]/g, "");
        return cleaned;
      };
      const suppliedBizNumber = normalizeBizNumber(vendor.businessNumber);
      if (suppliedBizNumber.length !== 10 && suppliedBizNumber.length !== 13) {
        await lunchInvoiceStore.markFailed(invoice.id, `사업자번호 형식 오류 (10 또는 13자리 숫자 필요): ${vendor.businessNumber}`);
        return NextResponse.json({ error: `사업자번호 형식 오류: ${vendor.businessNumber} (숫자 10자리 필요)` }, { status: 400 });
      }

      // 환경변수 trim (Vercel 복붙 시 trailing \n/공백 방어)
      const envTrim = (v: string | undefined) => (v || "").trim();
      // 공급받는자 담당자 휴대폰은 볼타가 `^010-\d{3,4}-\d{4}` 형식만 허용 — 포맷 불일치 에러를 피하기 위해 애초에 미전송 (선택 필드)

      const result = await issueTaxInvoice({
        date: issueDate,
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
          organizationName: (vendor.name || "").trim(),
          representativeName: (vendor.representativeName || "").trim(),
          managers: [{
            email: (vendor.taxEmail || "").trim(),
          }],
          address: vendor.address?.trim() || undefined,
        },
        items: [{
          date: issueDate,
          name: itemName,
          supplyCost,
          tax,
        }],
      });

      // 성공
      await lunchInvoiceStore.markIssued(invoice.id, result.issuanceKey, "");

      const orderIds = targetOrders.map((o) => o.id);
      await lunchInvoiceStore.linkOrders(invoice.id, orderIds);

      // 연결된 주문들 매출발행 완료 + 정산완료 처리
      await supabase
        .from("lunch_orders")
        .update({ invoice_issued: true, status: "completed" })
        .in("id", orderIds);

      // ntsTransactionId 조회
      try {
        const detail = await getTaxInvoice(result.issuanceKey);
        if (detail.ntsTransactionId) {
          await supabase
            .from("lunch_invoices")
            .update({ nts_transaction_id: detail.ntsTransactionId })
            .eq("id", invoice.id);
        }
      } catch { /* nts id 조회 실패해도 발행은 성공 */ }

      return NextResponse.json({
        success: true,
        issuanceKey: result.issuanceKey,
        invoiceId: invoice.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "볼타 API 오류";
      await lunchInvoiceStore.markFailed(invoice.id, msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } catch (err) {
    console.error("[lunch-invoices/issue] error:", err);
    return NextResponse.json({ error: "발행 처리 실패" }, { status: 500 });
  }
}
