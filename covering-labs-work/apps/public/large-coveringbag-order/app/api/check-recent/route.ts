import { NextResponse } from 'next/server';
import {
  createPublicError,
  getAccessToken,
  getRecentApplicationStatus,
  RECENT_APPLICATION_BLOCKED_CODE,
} from '@/src/server/delivery-application';
import { sendFlareLaneEvent } from '@/src/server/flarelane';

const DEFAULT_CHECK_ERROR = '지금은 신청 가능 여부를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.';
type CheckRecentRequestBody = {
  phone?: string;
  trackingContext?: Record<string, unknown>;
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}

export async function POST(request: Request) {
  try {
    let body: CheckRecentRequestBody;

    try {
      body = (await request.json()) as CheckRecentRequestBody;
    } catch (cause) {
      throw createPublicError('요청 본문(JSON) 형식이 올바르지 않습니다.', 400, cause);
    }

    const token = await getAccessToken('https://www.googleapis.com/auth/spreadsheets.readonly', DEFAULT_CHECK_ERROR);
    const result = await getRecentApplicationStatus(token, body?.phone || '', DEFAULT_CHECK_ERROR);

    if (result.blocked) {
      await sendFlareLaneEvent(
        '[EVENT] ProductPurchaseResult',
        {
          ...(body.trackingContext || {}),
          app_name: 'large-coveringbag-order',
          funnel_name: 'large_coveringbag_order',
          product_code: 'LARGE_COVERING_BAG',
          product_name: 'large_coveringbag',
          product_volume_l: 220,
          screen_name: 'ProductPurchaseScreen',
          funnel_step: 'submit_blocked',
          is_success: false,
          result_type: 'recent_application_blocked',
          product_totalQuantity: 1,
          error_code: RECENT_APPLICATION_BLOCKED_CODE,
          submittedAt: result.submittedAt,
        },
        'check_recent_api',
      );
    }

    return NextResponse.json(result, { headers: corsHeaders() });
  } catch (err) {
    const error = err as Error & { statusCode?: number; publicMessage?: string };
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    const publicMessage = error?.publicMessage || DEFAULT_CHECK_ERROR;

    return NextResponse.json(
      { blocked: false, error: publicMessage },
      {
        status: statusCode,
        headers: corsHeaders(),
      },
    );
  }
}
