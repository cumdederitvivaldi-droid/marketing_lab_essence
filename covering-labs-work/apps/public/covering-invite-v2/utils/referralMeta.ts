import type { ReferralRouteData } from './types';
import { BASE_PATH } from './basePath';

export type ReferralMeta = {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
};

function normalizeName(name: string | null) {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.length > 12 ? `${trimmed.slice(0, 12)}…` : trimmed;
}

export function buildInviteeTitle(name: string | null) {
  const n = normalizeName(name);
  return n ? `${n}님이 집정리 지원금을 보냈어요!` : '친구가 집정리 지원금을 보냈어요!';
}

export function buildInviteeDescription() {
  return '커버링 신규 가입은 30,000원, 이미 가입했다면 3,000원 지원금을 바로 사용할 수 있어요.\n가입 후 7일 이내 사용하실 수 있어요.';
}

export function buildInviterTitle() {
  return '친구에게 집정리 지원금을 선물하세요';
}

export function buildInviterDescription() {
  return '신규 가입한 친구는 30,000원, 이미 가입한 친구도 3,000원 지원금을 받아요. 카카오톡으로 바로 공유해보세요.';
}

function buildOgImageUrl(origin: string) {
  return `${origin}${BASE_PATH}/assets/figma/referral-og-card.png?v=2`;
}

function buildPublicUrl(route: ReferralRouteData, origin: string) {
  if (route.path === 'invitee' && route.mode === 'live' && route.inviteCode) {
    const url = new URL(`${BASE_PATH}/r/${encodeURIComponent(route.inviteCode)}`, origin);
    if (route.variant) url.searchParams.set('variant', route.variant);
    if (route.from) url.searchParams.set('from', route.from);
    if (route.campaign) url.searchParams.set('campaign', route.campaign);
    if (route.inviterName) url.searchParams.set('name', route.inviterName);
    return url.toString();
  }
  if (route.path === 'inviter') {
    const url = new URL(`${BASE_PATH}/invite/share`, origin);
    if (route.inviteCode) url.searchParams.set('code', route.inviteCode);
    if (route.variant) url.searchParams.set('variant', route.variant);
    if (route.from) url.searchParams.set('from', route.from);
    if (route.campaign) url.searchParams.set('campaign', route.campaign);
    if (route.inviterName) url.searchParams.set('name', route.inviterName);
    return url.toString();
  }
  return origin;
}

export function buildReferralMeta(route: ReferralRouteData, origin: string): ReferralMeta {
  if (route.path === 'invitee') {
    return {
      title: buildInviteeTitle(route.inviterName),
      description: buildInviteeDescription(),
      imageUrl: buildOgImageUrl(origin),
      url: buildPublicUrl(route, origin),
    };
  }
  return {
    title: buildInviterTitle(),
    description: buildInviterDescription(),
    imageUrl: buildOgImageUrl(origin),
    url: buildPublicUrl(route, origin),
  };
}

