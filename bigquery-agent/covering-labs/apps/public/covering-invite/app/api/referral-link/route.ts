import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_APP_NAME = 'coveringprod';
const DEFAULT_CHANNEL = 'referral_bridge';
const DEFAULT_CAMPAIGN = 'h2_invite_page';
const DEFAULT_AD_CREATIVE = 'invitee_cta_v1';
const DEFAULT_FALLBACK_BASE = `https://abr.ge/${DEFAULT_APP_NAME}`;
const DEFAULT_AIRBRIDGE_DEEPLINK = 'covering://';

function buildFallbackLink(params: {
  inviteCode: string;
  inviterName: string;
  variant: string;
  from: string;
}) {
  const url = new URL(DEFAULT_FALLBACK_BASE);
  url.searchParams.set('variant', params.variant);
  url.searchParams.set('airbridge_deeplink', DEFAULT_AIRBRIDGE_DEEPLINK);
  url.searchParams.set('invite_code', params.inviteCode);
  url.searchParams.set('from', params.from);
  if (params.inviterName)
    url.searchParams.set('referrer_name', params.inviterName);
  return url.toString();
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const inviteCode = searchParams.get('code')?.trim().toUpperCase();
  const inviterName = searchParams.get('name')?.trim() || '';
  const variant = searchParams.get('variant')?.trim() || 'friend_invite_v1';
  const from = searchParams.get('from')?.trim() || 'share';
  const token = process.env.AIRBRIDGE_TOKEN?.trim();

  if (!inviteCode || !/^[A-Za-z0-9_-]{4,64}$/.test(inviteCode)) {
    return NextResponse.json({ error: 'invalid code format' }, { status: 400 });
  }

  const fallbackLink = buildFallbackLink({
    inviteCode,
    inviterName,
    variant,
    from,
  });

  if (!token) {
    return NextResponse.json(
      { link: fallbackLink, mode: 'fallback' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      'https://api.airbridge.io/v1/tracking-links',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: DEFAULT_CHANNEL,
          campaignParams: {
            campaign: DEFAULT_CAMPAIGN,
            ad_group: variant,
            ad_creative: DEFAULT_AD_CREATIVE,
          },
          deeplinkUrl: `${DEFAULT_AIRBRIDGE_DEEPLINK}?${new URLSearchParams({ invite_code: inviteCode, variant, from }).toString()}`,
        }),
        signal: controller.signal,
      },
    );

    const body = await response.json();
    const link =
      body?.data?.trackingLink?.shortUrl ||
      body?.trackingLink?.shortUrl ||
      body?.shortUrl ||
      null;

    if (!response.ok || !link) {
      return NextResponse.json(
        { link: fallbackLink, mode: 'fallback' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { link, mode: 'airbridge' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { link: fallbackLink, mode: 'fallback' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
