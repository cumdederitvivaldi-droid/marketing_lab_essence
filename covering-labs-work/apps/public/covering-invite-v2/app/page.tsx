import ReferralInviter from '@/components/ReferralInviter';
import type { ReferralRouteData } from '@/utils/types';

export default function Home() {
  const route: ReferralRouteData = {
    mode: 'preview',
    path: 'inviter',
    inviteCode: null,
    inviterName: null,
    variant: null,
    from: null,
    campaign: null,
    invalidReason: null,
  };

  return <ReferralInviter route={route} />;
}
