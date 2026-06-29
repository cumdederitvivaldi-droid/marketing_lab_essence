export type ReferralMode = 'preview' | 'live';

export type ReferralPath = 'inviter' | 'invitee';

export type ReferralInvalidReason = 'missingCode' | 'invalidCode';

export interface ReferralRouteData {
  mode: ReferralMode;
  path: ReferralPath;
  inviteCode: string | null;
  inviterName: string | null;
  variant: string | null;
  from: string | null;
  invalidReason: ReferralInvalidReason | null;
}

export type SearchParams = { [key: string]: string | string[] | undefined };

export function param(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
