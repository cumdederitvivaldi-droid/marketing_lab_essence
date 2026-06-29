import type { Metadata } from 'next';
import ReferralInviter from '@/components/ReferralInviter';
import { buildReferralMeta } from '@/utils/referralMeta';
import { param, type SearchParams, type ReferralRouteData } from '@/utils/types';

function buildRoute(searchParams: SearchParams): ReferralRouteData {
  return {
    mode: 'live',
    path: 'inviter',
    inviteCode: param(searchParams.code),
    inviterName: param(searchParams.name),
    variant: param(searchParams.variant),
    from: param(searchParams.from),
    campaign: param(searchParams.campaign),
    invalidReason: null,
  };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const route = buildRoute(searchParams);
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

export default function InviteSharePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const route = buildRoute(searchParams);

  return <ReferralInviter route={route} />;
}
