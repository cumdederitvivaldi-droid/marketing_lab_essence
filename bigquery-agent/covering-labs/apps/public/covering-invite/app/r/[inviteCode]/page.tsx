import type { Metadata } from 'next';
import ReferralInvitee from '@/components/ReferralInvitee';
import { buildReferralMeta } from '@/utils/referralMeta';
import { param, type SearchParams, type ReferralInvalidReason, type ReferralRouteData } from '@/utils/types';

const INVITE_CODE_REGEX = /^[A-Za-z0-9_-]{4,64}$/;

function validateCode(code: string): ReferralInvalidReason | null {
  if (!code) return 'missingCode';
  if (!INVITE_CODE_REGEX.test(code)) return 'invalidCode';
  return null;
}

function buildRoute(
  inviteCode: string,
  searchParams: SearchParams,
): ReferralRouteData {
  let decoded: string;
  try {
    decoded = decodeURIComponent(inviteCode);
  } catch {
    decoded = inviteCode;
  }
  const invalidReason = validateCode(decoded);

  return {
    mode: 'live',
    path: 'invitee',
    inviteCode: decoded,
    inviterName: param(searchParams.name),
    variant: param(searchParams.variant),
    from: param(searchParams.from),
    invalidReason,
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { inviteCode: string };
  searchParams: SearchParams;
}): Promise<Metadata> {
  const route = buildRoute(params.inviteCode, searchParams);
  const origin = 'https://public-labs.covering.app';
  const meta = buildReferralMeta(route, origin);

  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: meta.url,
      siteName: 'covering',
      images: [{ url: meta.imageUrl, width: 1200, height: 630 }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
      images: [meta.imageUrl],
    },
  };
}

export default function InviteeCodePage({
  params,
  searchParams,
}: {
  params: { inviteCode: string };
  searchParams: SearchParams;
}) {
  const route = buildRoute(params.inviteCode, searchParams);

  return <ReferralInvitee route={route} />;
}
