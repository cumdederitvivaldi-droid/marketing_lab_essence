import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIXPANEL_API_HOST = 'https://api-js.mixpanel.com';
const ALLOWED_ROUTES = new Set(['track', 'engage']);
const MAX_BODY_BYTES = 256 * 1024;

type RouteContext = {
  params: {
    route?: string[];
  };
};

function isAllowedRoute(route?: string[]) {
  return route?.length === 1 && ALLOWED_ROUTES.has(route[0]);
}

function upstreamUrl(request: Request, route: string) {
  const url = new URL(request.url);
  return `${MIXPANEL_API_HOST}/${route}${url.search}`;
}

function proxyHeaders(request: Request) {
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  const accept = request.headers.get('accept');
  const userAgent = request.headers.get('user-agent');

  if (contentType) headers.set('content-type', contentType);
  if (accept) headers.set('accept', accept);
  if (userAgent) headers.set('user-agent', userAgent);

  return headers;
}

async function requestBody(request: Request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) {
    return 'too_large' as const;
  }

  return body.byteLength > 0 ? body : undefined;
}

async function proxyMixpanel(request: Request, context: RouteContext) {
  const route = context.params.route?.[0];

  if (!route || !isAllowedRoute(context.params.route)) {
    return NextResponse.json(
      { ok: false, code: 'unsupported_mixpanel_route' },
      {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  const body = await requestBody(request);
  if (body === 'too_large') {
    return NextResponse.json(
      { ok: false, code: 'mixpanel_payload_too_large' },
      {
        status: 413,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  try {
    const response = await fetch(upstreamUrl(request, route), {
      method: request.method,
      headers: proxyHeaders(request),
      body,
      cache: 'no-store',
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('disposal-guide mixpanel proxy upstream failed', {
      route,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { ok: false, code: 'mixpanel_proxy_failed' },
      {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}

export async function GET(request: Request, context: RouteContext) {
  return proxyMixpanel(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyMixpanel(request, context);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
}
