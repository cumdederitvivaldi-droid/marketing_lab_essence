import { NextResponse } from 'next/server';
import {
  FLARELANE_CLIENT_EVENT_NAMES,
  sendFlareLaneEvent,
} from '@/src/server/flarelane';

function getExpectedOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host') || requestUrl.host;
  const protocol = forwardedProto || requestUrl.protocol.replace(':', '');

  return `${protocol}://${host}`;
}

function getCallerOrigin(request: Request) {
  const origin = request.headers.get('origin')?.trim();
  if (origin) return origin;

  const referer = request.headers.get('referer')?.trim();
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(request: Request) {
  const callerOrigin = getCallerOrigin(request);
  if (!callerOrigin) return true;

  return callerOrigin === getExpectedOrigin(request);
}

function corsHeaders(request: Request) {
  const callerOrigin = getCallerOrigin(request);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (callerOrigin && isAllowedOrigin(request)) {
    headers['Access-Control-Allow-Origin'] = callerOrigin;
    headers.Vary = 'Origin';
  }

  return headers;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: isAllowedOrigin(request) ? 200 : 403,
    headers: corsHeaders(request),
  });
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json(
      { ok: false, reason: 'origin_not_allowed' },
      { status: 403, headers: corsHeaders(request) },
    );
  }

  try {
    const body = (await request.json()) as {
      event?: unknown;
      props?: Record<string, unknown>;
    };
    const eventName = String(body.event || '').trim();

    if (!FLARELANE_CLIENT_EVENT_NAMES.has(eventName)) {
      return NextResponse.json(
        { ok: false, skipped: true, reason: 'event_not_allowed' },
        { status: 400, headers: corsHeaders(request) },
      );
    }

    const result = await sendFlareLaneEvent(eventName, body.props || {}, 'client_proxy');

    return NextResponse.json(result, { headers: corsHeaders(request) });
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'invalid_request' },
      { status: 400, headers: corsHeaders(request) },
    );
  }
}
