import { NextResponse } from 'next/server';
import {
  SHEET_ID,
  SHEET_NAME,
  createPublicError,
  createRecentApplicationBlockedError,
  formatKstTimestamp,
  getAccessToken,
  getRecentApplicationStatus,
} from '@/src/server/delivery-application';
import { sendFlareLaneEvent } from '@/src/server/flarelane';

const DEFAULT_SUBMIT_ERROR = '지금은 신청을 저장할 수 없습니다. 잠시 후 다시 시도해주세요.';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

type SubmitRequestBody = {
  name?: string;
  phone?: string;
  address?: string;
  addressDetail?: string;
  entryMethod?: string;
  entryDetail?: string;
  request?: string;
  trackingContext?: Record<string, unknown>;
};

function buildProductPurchaseResultProps(
  trackingContext: Record<string, unknown>,
  extra: Record<string, unknown>,
) {
  return {
    ...trackingContext,
    app_name: 'large-coveringbag-order',
    funnel_name: 'large_coveringbag_order',
    product_code: 'LARGE_COVERING_BAG',
    product_name: 'large_coveringbag',
    product_volume_l: 220,
    screen_name: 'ProductPurchaseScreen',
    ...extra,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}

export async function POST(request: Request) {
  let body: SubmitRequestBody = {};
  let trackingContext: Record<string, unknown> = {};

  try {
    try {
      body = (await request.json()) as SubmitRequestBody;
      trackingContext = body.trackingContext || {};
    } catch (cause) {
      throw createPublicError('요청 본문(JSON) 형식이 올바르지 않습니다.', 400, cause);
    }
    const token = await getAccessToken('https://www.googleapis.com/auth/spreadsheets', DEFAULT_SUBMIT_ERROR);
    const recentApplication = await getRecentApplicationStatus(token, body.phone || '', DEFAULT_SUBMIT_ERROR);

    if (recentApplication.blocked) {
      throw createRecentApplicationBlockedError(recentApplication.submittedAt);
    }

    const timestamp = formatKstTimestamp();
    const uuid = globalThis.crypto.randomUUID();
    const e164Phone = recentApplication.normalizedPhone
      ? `+82${recentApplication.normalizedPhone.replace(/^0/, '')}`
      : '';

    const trimDetail = String(body.addressDetail || '').trim();
    const trimEntryMethod = String(body.entryMethod || '').trim();
    const trimEntryDetail = String(body.entryDetail || '').trim();
    const sheetEntryMethod =
      trimEntryMethod === '기타사항' && trimEntryDetail ? trimEntryDetail : trimEntryMethod;
    const fullAddress = trimDetail ? `${body.address || ''}, ${trimDetail}` : body.address || '';
    const values = [[
      timestamp,
      sheetEntryMethod,
      uuid,
      String(body.request || '').trim(),
      e164Phone,
      body.name || '',
      fullAddress,
      '',
      '',
      '',
      '',
    ]];

    try {
      const sheetsRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${SHEET_NAME}!A:K`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values }),
        },
      );
      const sheetsData = await sheetsRes.json();

      if (!sheetsRes.ok) {
        throw createPublicError(DEFAULT_SUBMIT_ERROR, 502, sheetsData);
      }
    } catch (error) {
      throw createPublicError(DEFAULT_SUBMIT_ERROR, 502, error);
    }

    await sendFlareLaneEvent(
      '[EVENT] ProductPurchaseResult',
      buildProductPurchaseResultProps(trackingContext, {
        funnel_step: 'submit_success',
        is_success: true,
        result_type: 'submitted',
        product_totalQuantity: 1,
        application_id: uuid,
      }),
      'submit_api',
    );

    return NextResponse.json({ success: true }, { headers: corsHeaders() });
  } catch (err) {
    const error = err as Error & {
      statusCode?: number;
      publicMessage?: string;
      code?: string;
      submittedAt?: string | null;
    };
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    const publicMessage = error?.publicMessage || DEFAULT_SUBMIT_ERROR;
    const resultType = error?.code === 'RECENT_APPLICATION_BLOCKED'
      ? 'recent_application_blocked'
      : 'error';

    await sendFlareLaneEvent(
      '[EVENT] ProductPurchaseResult',
      buildProductPurchaseResultProps(trackingContext, {
        funnel_step: resultType === 'recent_application_blocked' ? 'submit_blocked' : 'submit_error',
        is_success: false,
        result_type: resultType,
        product_totalQuantity: 1,
        error_code: error?.code || String(statusCode),
      }),
      'submit_api',
    );

    return NextResponse.json(
      {
        success: false,
        error: publicMessage,
        code: error?.code,
        submittedAt: error?.submittedAt || null,
      },
      {
        status: statusCode,
        headers: corsHeaders(),
      },
    );
  }
}
