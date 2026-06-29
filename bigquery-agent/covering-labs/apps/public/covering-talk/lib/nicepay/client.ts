import crypto from "crypto";

// ─── 환경변수 ──────────────────────────────

const NICEPAY_MID = process.env.NICEPAY_MID || "";
const NICEPAY_USR_ID = process.env.NICEPAY_USR_ID || "";
const NICEPAY_MERCHANT_KEY = process.env.NICEPAY_MERCHANT_KEY || "";

const API_URL = "https://webapi.nicepay.co.kr/webapi/smslink/api.jsp";
const DEACTIVATE_URL = "https://webapi.nicepay.co.kr/webapi/smslink/link_deactivate.jsp";

// 나이스페이 알림톡에서 고객에게 노출되는 결제 페이지 URL — rid 는 reqId 와 동일
export function nicepayPayUrl(reqId: string): string {
  return `https://web.nicepay.co.kr/smart/slo.jsp?rid=${reqId}`;
}

// ─── 헬퍼 ──────────────────────────────────

function sha256Hex(str: string): string {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

/** YYYYMMDDHHMMSS 형식 */
function formatTrDtm(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}${mo}${d}${h}${mi}${s}`;
}

function generateEncKey(sid: string, trDtm: string): string {
  const plainText = sid + NICEPAY_USR_ID + trDtm + NICEPAY_MERCHANT_KEY;
  return sha256Hex(plainText);
}

// ─── 링크결제 등록 ──────────────────────────

export interface CreatePaymentParams {
  goodsName: string;
  amount: number;
  orderId: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
  sendType?: "0" | "1" | "2" | "4"; // SMS / Email / Kakao / URL응답
  payLimitDate?: string; // YYYYMMDD
}

export interface CreatePaymentResult {
  success: boolean;
  reqId?: string;
  payUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

export async function createPaymentLink(
  params: CreatePaymentParams
): Promise<CreatePaymentResult> {
  if (!NICEPAY_MERCHANT_KEY) {
    return {
      success: false,
      errorCode: "CONFIG",
      errorMessage: "NICEPAY_MERCHANT_KEY가 설정되지 않았습니다",
    };
  }

  const sid = "0501001";
  const trDtm = formatTrDtm();
  const encKey = generateEncKey(sid, trDtm);
  const sendType = params.sendType || "0";

  const requestBody = {
    header: {
      sid,
      trDtm,
      gubun: "S",
      resCode: "",
      resMsg: "",
    },
    body: {
      usrId: NICEPAY_USR_ID,
      encKey,
      mid: NICEPAY_MID,
      goodsNm: params.goodsName,
      goodsAmt: String(params.amount),
      moid: params.orderId,
      ordNm: params.buyerName,
      ordHpNo: params.buyerPhone.replace(/-/g, ""),
      type: sendType === "2" ? "0" : "0", // kakao/09~21시 외 → type 0
      sendType,
      ...(params.buyerEmail ? { ordEmail: params.buyerEmail } : {}),
      ...(params.payLimitDate ? { payLimitDt: params.payLimitDate } : {}),
    },
  };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();
    console.log("[NICEPAY] 등록 응답:", JSON.stringify(data));

    const resCode = data.header?.resCode;
    if (resCode === "0000") {
      const reqId = data.body?.data?.[0]?.reqId;
      const payUrl = data.body?.data?.[0]?.payUrl;
      return { success: true, reqId, payUrl };
    }

    return {
      success: false,
      errorCode: resCode,
      errorMessage: data.header?.resMsg || "알 수 없는 오류",
    };
  } catch (err) {
    console.error("[NICEPAY] 등록 요청 실패:", err);
    return {
      success: false,
      errorCode: "NETWORK",
      errorMessage: String(err),
    };
  }
}

// ─── 내역 조회 ──────────────────────────────

export interface PaymentStatusResult {
  success: boolean;
  payStatus?: string; // 미완료 / 결제완료 / 결제실패 / 결제중지
  svcNm?: string;     // 결제수단
  amt?: number;
  tid?: string;
  ordNm?: string;
  sendDt?: string;
  payDt?: string;
  sentStatus?: string; // 성공/실패
  goodsNm?: string;
  errorCode?: string;
  errorMessage?: string;
}

export async function queryPaymentStatus(
  reqId: string
): Promise<PaymentStatusResult> {
  if (!NICEPAY_MERCHANT_KEY) {
    return { success: false, errorCode: "CONFIG", errorMessage: "NICEPAY_MERCHANT_KEY 미설정" };
  }

  const sid = "0501002";
  const trDtm = formatTrDtm();
  const encKey = generateEncKey(sid, trDtm);

  const requestBody = {
    header: {
      sid,
      trDtm,
      gubun: "S",
      resCode: "",
      resMsg: "",
    },
    body: {
      usrId: NICEPAY_USR_ID,
      encKey,
      mid: NICEPAY_MID,
      reqId,
    },
  };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();
    console.log("[NICEPAY] 조회 응답:", JSON.stringify(data));

    const resCode = data.header?.resCode;
    if (resCode === "0000") {
      const d = data.body?.data?.[0];
      return {
        success: true,
        payStatus: d?.payStatus,
        svcNm: d?.svcNm,
        amt: d?.amt,
        tid: d?.tid,
        ordNm: d?.ordNm,
        sendDt: d?.sendDt,
        payDt: d?.payDt,
        sentStatus: d?.sentStatus,
        goodsNm: d?.goodsNm,
      };
    }

    return {
      success: false,
      errorCode: resCode,
      errorMessage: data.header?.resMsg || "조회 실패",
    };
  } catch (err) {
    console.error("[NICEPAY] 조회 요청 실패:", err);
    return { success: false, errorCode: "NETWORK", errorMessage: String(err) };
  }
}

// ─── 비활성화 ──────────────────────────────

export interface DeactivateResult {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export async function deactivatePaymentLink(
  reqId: string
): Promise<DeactivateResult> {
  if (!NICEPAY_MERCHANT_KEY) {
    return { success: false, errorCode: "CONFIG", errorMessage: "NICEPAY_MERCHANT_KEY 미설정" };
  }

  const ediDate = formatTrDtm();
  const signData = sha256Hex(reqId + ediDate + NICEPAY_MERCHANT_KEY);

  const body = new URLSearchParams({
    ReqId: reqId,
    MID: NICEPAY_MID,
    EdiDate: ediDate,
    SignData: signData,
    CharSet: "utf-8",
  });

  try {
    const res = await fetch(DEACTIVATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await res.json();
    console.log("[NICEPAY] 비활성화 응답:", JSON.stringify(data));

    if (data.ResultCode === "0000") {
      // 응답 Signature 검증
      const expectedSig = sha256Hex(data.ReqId + data.MID + NICEPAY_MERCHANT_KEY);
      if (data.Signature !== expectedSig) {
        console.warn("[NICEPAY] Signature 불일치:", data.Signature, "vs", expectedSig);
      }
      return { success: true };
    }

    return {
      success: false,
      errorCode: data.ResultCode,
      errorMessage: data.ResultMsg || "비활성화 실패",
    };
  } catch (err) {
    console.error("[NICEPAY] 비활성화 요청 실패:", err);
    return { success: false, errorCode: "NETWORK", errorMessage: String(err) };
  }
}
