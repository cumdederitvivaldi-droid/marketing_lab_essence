/**
 * 볼타 전자세금계산서 API 클라이언트
 *
 * 환경변수:
 *   BOLTA_API_KEY        — API 키 (test_ 또는 live_ prefix)
 *   BOLTA_CUSTOMER_KEY   — 공급자(커버링) 고객 키
 *
 * 공급자 정보는 고정 (커버링), 공급받는자만 벤더별로 변경
 */

const API_BASE = "https://xapi.bolta.io/v1";

function getAuth(): string {
  const apiKey = process.env.BOLTA_API_KEY?.trim();
  if (!apiKey) throw new Error("BOLTA_API_KEY 환경변수가 설정되지 않았습니다");
  return "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
}

function getCustomerKey(): string {
  const key = process.env.BOLTA_CUSTOMER_KEY?.trim();
  if (!key) throw new Error("BOLTA_CUSTOMER_KEY 환경변수가 설정되지 않았습니다");
  return key;
}

// ─── Types ──────────────────────────────────

export interface BoltaSupplier {
  identificationNumber: string;
  organizationName: string;
  representativeName: string;
  manager: { email: string; name?: string; telephone?: string };
  address?: string;
  businessType?: string;
  businessItem?: string;
}

export interface BoltaSupplied {
  identificationNumber: string;
  organizationName: string;
  representativeName: string;
  managers: { email: string; name?: string; telephone?: string }[];
  address?: string;
  businessType?: string;
  businessItem?: string;
}

export interface BoltaItem {
  date: string;
  name: string;
  supplyCost: number;
  tax: number | null; // null = 면세
  unitPrice?: number;
  quantity?: number;
  description?: string;
}

export interface IssueTaxInvoiceParams {
  date: string; // YYYY-MM-DD
  purpose: "RECEIPT" | "CLAIM";
  supplier: BoltaSupplier;
  supplied: BoltaSupplied;
  items: BoltaItem[];
  description?: string;
}

export interface IssueTaxInvoiceResult {
  issuanceKey: string;
}

export interface TaxInvoiceDetail {
  issuanceKey: string;
  issuedAt: string;
  ntsTransactionId: string;
  invoice: {
    date: string;
    purpose: string;
    supplier: BoltaSupplier;
    supplied: BoltaSupplied;
    items: BoltaItem[];
    description: string | null;
  };
}

// ─── API Functions ──────────────────────────

/** 전자세금계산서 정발행 */
export async function issueTaxInvoice(params: IssueTaxInvoiceParams): Promise<IssueTaxInvoiceResult> {
  const res = await fetch(`${API_BASE}/taxInvoices/issue`, {
    method: "POST",
    headers: {
      "Authorization": getAuth(),
      "Content-Type": "application/json",
      "Customer-Key": getCustomerKey(),
    },
    body: JSON.stringify(params),
  });

  // text-first 방어 (HTML/빈 응답에서 res.json() 터지는 것 방지)
  const text = await res.text();
  if (!res.ok) {
    if (!text) throw new Error(`볼타 발행 실패 [${res.status}]: 빈 응답 (타임아웃/게이트웨이 오류 가능)`);
    try {
      const data = JSON.parse(text);
      throw new Error(`볼타 발행 실패: ${data.code ?? res.status} - ${data.message ?? text.slice(0, 200)}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("볼타 발행 실패")) throw e;
      throw new Error(`볼타 발행 실패 [${res.status}]: ${text.slice(0, 200)}`);
    }
  }
  if (!text) throw new Error("볼타 API가 빈 응답을 반환했습니다");
  return JSON.parse(text) as IssueTaxInvoiceResult;
}

/**
 * 수정발행 · 계약의 해제 (상계처리)
 * 원본 세금계산서의 공급가액/세액을 음수로 뒤집은 세금계산서가 자동 생성되어 원본을 상쇄함.
 * 원본 품목 공급가액이 음수인 경우 사용 불가.
 */
export async function amendTerminationTaxInvoice(
  issuanceKey: string,
  date: string
): Promise<IssueTaxInvoiceResult> {
  const res = await fetch(`${API_BASE}/taxInvoices/${issuanceKey}/amend/termination`, {
    method: "POST",
    headers: {
      "Authorization": getAuth(),
      "Content-Type": "application/json",
      "Customer-Key": getCustomerKey(),
    },
    body: JSON.stringify({ date }),
  });

  const text = await res.text();
  if (!res.ok) {
    if (!text) throw new Error(`볼타 수정발행 실패 [${res.status}]: 빈 응답 (타임아웃/게이트웨이 오류 가능)`);
    try {
      const data = JSON.parse(text);
      throw new Error(`볼타 수정발행 실패: ${data.code ?? res.status} - ${data.message ?? text.slice(0, 200)}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("볼타 수정발행 실패")) throw e;
      throw new Error(`볼타 수정발행 실패 [${res.status}]: ${text.slice(0, 200)}`);
    }
  }
  if (!text) throw new Error("볼타 API가 빈 응답을 반환했습니다");
  return JSON.parse(text) as IssueTaxInvoiceResult;
}

/** 전자세금계산서 내용 조회 */
export async function getTaxInvoice(issuanceKey: string): Promise<TaxInvoiceDetail> {
  const res = await fetch(`${API_BASE}/taxInvoices/${issuanceKey}`, {
    method: "GET",
    headers: {
      "Authorization": getAuth(),
      "Content-Type": "application/json",
    },
  });

  // 빈 body 방어 (404 등에서 Bolta가 empty response 주는 경우)
  const text = await res.text();
  if (!res.ok) {
    const envHint = process.env.BOLTA_API_KEY?.startsWith("test_") ? "테스트" : "운영";
    if (res.status === 404 || !text) {
      throw new Error(`발행키를 찾을 수 없습니다 (${envHint} 환경). 발행 환경과 현재 환경이 다를 수 있습니다.`);
    }
    try {
      const data = JSON.parse(text);
      throw new Error(`볼타 조회 실패 [${res.status}]: ${data.code ?? ""} ${data.message ?? text.slice(0, 200)}`);
    } catch {
      throw new Error(`볼타 조회 실패 [${res.status}]: ${text.slice(0, 200)}`);
    }
  }
  if (!text) throw new Error("볼타 API가 빈 응답을 반환했습니다");
  return JSON.parse(text) as TaxInvoiceDetail;
}
