import { NextRequest, NextResponse } from 'next/server';

/**
 * Airbridge Postback 수신 엔드포인트
 *
 * Install 이벤트: device_id + invite_code 매핑 저장 (BigQuery staging)
 * Sign-up 이벤트: device_id로 매칭 → FlareLane 쿠폰 이벤트 발송 → 장부 기록
 *
 * Postback URL:
 * https://public-labs.covering.app/covering-invite-v2/api/airbridge-postback
 *   ?event_name={eventName}
 *   &device_id={device.deviceUUID}
 *   &deeplink_url={deeplink_url}
 *   &user_id={user.externalUserID}
 *   &channel={attributionResult.attributedChannel}
 *   &timestamp={eventTimestamp}
 */

const GCP_PROJECT = process.env.GCP_PROJECT ?? 'covering-app-ccd23';
const STAGING_TABLE = `${GCP_PROJECT}.product.friend_invite_install_staging_v1`;
const LEDGER_TABLE = `${GCP_PROJECT}.product.friend_invite_reward_issuance_v1`;
const VARIANT = 'friend_invite_v1';
const FLARELANE_EVENT_NAME = 'friend_invite_reward_v1_invitee';
const REWARD_AMOUNT = 30000;

type BqRow = { f: { v: string | null }[] };
type BqQueryResult = { rows?: BqRow[]; totalRows?: string; error?: unknown };

async function getBigQueryToken(): Promise<string> {
  const resp = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!resp.ok) throw new Error(`GCP metadata ${resp.status}`);
  return (await resp.json()).access_token;
}

async function bqQuery(
  token: string,
  sql: string,
  params?: { name: string; parameterType: { type: string }; parameterValue: { value: string } }[],
): Promise<BqQueryResult> {
  const body: Record<string, unknown> = { query: sql, useLegacySql: false };
  if (params?.length) {
    body.parameterMode = 'NAMED';
    body.queryParameters = params;
  }
  const resp = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${GCP_PROJECT}/queries`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) throw new Error(`BigQuery query ${resp.status}`);
  return resp.json();
}

async function bqInsert(
  token: string,
  table: string,
  rows: Record<string, unknown>[],
): Promise<boolean> {
  const [project, dataset, tableName] = table.split('.');
  const resp = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${project}/datasets/${dataset}/tables/${tableName}/insertAll`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: rows.map((r) => ({ json: r })) }),
    },
  );
  if (!resp.ok) throw new Error(`BigQuery insert ${resp.status}`);
  const data = await resp.json();
  return !data.insertErrors?.length;
}

function extractInviteCode(deeplinkUrl: string): string | null {
  try {
    const match = deeplinkUrl.match(/invite_code=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

async function sendFlareLaneEvent(
  userId: string,
  inviteCode: string,
  inviterId: string,
): Promise<boolean> {
  const projectId = process.env.FLARELANE_PROJECT_ID;
  const apiKey = process.env.FLARELANE_API_KEY;
  if (!projectId || !apiKey) return false;

  const resp = await fetch(
    `https://api.flarelane.com/v1/projects/${projectId}/track`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            subjectType: 'user',
            subjectId: userId,
            type: FLARELANE_EVENT_NAME,
            data: {
              invite_code: inviteCode,
              inviter_id: inviterId,
              variant: VARIANT,
              reward_type: 'invitee_only',
              reward_amount: REWARD_AMOUNT,
            },
          },
        ],
      }),
    },
  );
  if (!resp.ok) return false;
  const data = await resp.json();
  return data?.events?.success === 1;
}

async function logToStaging(
  bqToken: string,
  params: {
    eventName: string;
    deviceId: string;
    userId?: string;
    inviteCode?: string;
    action: string;
    timestamp?: string;
  },
): Promise<void> {
  try {
    await bqInsert(bqToken, STAGING_TABLE, [
      {
        event_name: params.eventName,
        device_id: params.deviceId,
        user_id: params.userId || null,
        invite_code: params.inviteCode || null,
        variant: VARIANT,
        action: params.action,
        installed_at: params.eventName.includes('Install')
          ? new Date(Number(params.timestamp) || Date.now()).toISOString()
          : null,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch {
    // 로그 실패가 메인 로직을 막지 않도록
  }
}

async function handleInstall(
  deviceId: string,
  deeplinkUrl: string,
  timestamp: string,
): Promise<NextResponse> {
  const bqToken = await getBigQueryToken();
  const inviteCode = extractInviteCode(deeplinkUrl);

  if (!inviteCode) {
    await logToStaging(bqToken, { eventName: 'Install', deviceId, action: 'install_no_code', timestamp });
    return NextResponse.json({ ok: true, action: 'install_no_code' });
  }

  const ok = await bqInsert(bqToken, STAGING_TABLE, [
    {
      event_name: 'Install',
      device_id: deviceId,
      user_id: null,
      invite_code: inviteCode,
      variant: deeplinkUrl.match(/variant=([^&]+)/)?.[1] || VARIANT,
      action: 'install_stored',
      installed_at: new Date(Number(timestamp) || Date.now()).toISOString(),
      created_at: new Date().toISOString(),
    },
  ]);

  if (!ok) {
    return NextResponse.json({ error: 'staging insert failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, action: 'install_stored', inviteCode });
}

async function handleSignup(
  deviceId: string,
  userId: string,
  timestamp: string,
): Promise<NextResponse> {
  const bqToken = await getBigQueryToken();

  if (!userId || !/^\d+$/.test(userId)) {
    await logToStaging(bqToken, { eventName: 'Sign-up', deviceId, action: 'signup_no_user' });
    return NextResponse.json({ ok: true, action: 'signup_no_user' });
  }

  // staging에서 invite_code 조회
  const result = await bqQuery(
    bqToken,
    `SELECT invite_code, variant, installed_at FROM \`${STAGING_TABLE}\` WHERE device_id = @device_id AND action = 'install_stored' AND installed_at >= TIMESTAMP_SUB(@signup_ts, INTERVAL 48 HOUR) AND installed_at <= @signup_ts ORDER BY installed_at DESC LIMIT 1`,
    [
      { name: 'device_id', parameterType: { type: 'STRING' }, parameterValue: { value: deviceId } },
      { name: 'signup_ts', parameterType: { type: 'TIMESTAMP' }, parameterValue: { value: new Date(Number(timestamp) || Date.now()).toISOString() } },
    ],
  );

  const row = result.rows?.[0];
  if (!row) {
    await logToStaging(bqToken, { eventName: 'Sign-up', deviceId, userId, action: 'signup_no_match' });
    return NextResponse.json({ ok: true, action: 'signup_no_match' });
  }

  const inviteCode = row.f[0]?.v;
  const variant = row.f[1]?.v || VARIANT;
  const installedAt = result.rows?.[0]?.f[2]?.v || null;
  if (!inviteCode) {
    await logToStaging(bqToken, { eventName: 'Sign-up', deviceId, userId, action: 'signup_no_code' });
    return NextResponse.json({ ok: true, action: 'signup_no_code' });
  }

  // 중복 체크 (user_id 또는 device_id 기준 — 탈퇴 후 재가입 방지)
  const dupCheck = await bqQuery(
    bqToken,
    `SELECT 1 FROM \`${LEDGER_TABLE}\` WHERE variant = @variant AND status = 'issued' AND (invitee_user_id = @user_id OR airbridge_device_id = @device_id) LIMIT 1`,
    [
      { name: 'user_id', parameterType: { type: 'INT64' }, parameterValue: { value: userId } },
      { name: 'variant', parameterType: { type: 'STRING' }, parameterValue: { value: variant } },
      { name: 'device_id', parameterType: { type: 'STRING' }, parameterValue: { value: deviceId } },
    ],
  );
  if (dupCheck.rows?.length) {
    await logToStaging(bqToken, { eventName: 'Sign-up', deviceId, userId, inviteCode, action: 'signup_already_issued' });
    return NextResponse.json({ ok: true, action: 'signup_already_issued' });
  }

  // inviter 조회
  const inviterResult = await bqQuery(
    bqToken,
    `SELECT id FROM \`${GCP_PROJECT}.secure_dataset.user\` WHERE invite_code = @invite_code LIMIT 1`,
    [{ name: 'invite_code', parameterType: { type: 'STRING' }, parameterValue: { value: inviteCode } }],
  );
  const inviterId = inviterResult.rows?.[0]?.f[0]?.v;
  if (!inviterId) {
    await logToStaging(bqToken, { eventName: 'Sign-up', deviceId, userId, inviteCode, action: 'signup_inviter_not_found' });
    return NextResponse.json({ ok: true, action: 'signup_inviter_not_found' });
  }

  // self invite 체크
  if (inviterId === userId) {
    await logToStaging(bqToken, { eventName: 'Sign-up', deviceId, userId, inviteCode, action: 'signup_self_invite' });
    return NextResponse.json({ ok: true, action: 'signup_self_invite' });
  }

  // FlareLane 쿠폰 이벤트 발송
  const success = await sendFlareLaneEvent(userId, inviteCode, inviterId);

  // 장부 기록 (issued/failed 즉시 기록 — streaming buffer UPDATE 불가 회피)
  const today = new Date().toISOString().slice(0, 10);
  await bqInsert(bqToken, LEDGER_TABLE, [
    {
      run_date: today,
      variant,
      invite_code: inviteCode,
      inviter_id: Number(inviterId),
      invitee_user_id: Number(userId),
      airbridge_device_id: deviceId,
      installed_at: installedAt,
      signed_up_at: new Date(Number(timestamp) || Date.now()).toISOString(),
      reward_target: 'invitee',
      status: success ? 'issued' : 'failed',
      status_reason: success ? null : 'flarelane_error',
      flarelane_event_name: FLARELANE_EVENT_NAME,
      processed_at: new Date().toISOString(),
    },
  ]);

  const action = success ? 'signup_issued' : 'signup_failed';
  await logToStaging(bqToken, { eventName: 'Sign-up', deviceId, userId, inviteCode, action });

  return NextResponse.json({ ok: true, action, inviteCode, inviterId, userId });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const eventName = searchParams.get('event_name') || '';
  const deviceId = searchParams.get('device_id') || '';
  const deeplinkUrl = searchParams.get('deeplink_url') || '';
  const userId = searchParams.get('user_id') || '';
  const timestamp = searchParams.get('timestamp') || '';

  if (!deviceId) {
    return NextResponse.json({ error: 'missing device_id' }, { status: 400 });
  }

  try {
    if (eventName === 'Install' || eventName === 'App Install') {
      return await handleInstall(deviceId, deeplinkUrl, timestamp);
    }

    if (eventName === 'Sign-up' || eventName === 'sign_up') {
      return await handleSignup(deviceId, userId, timestamp);
    }

    return NextResponse.json({ ok: true, action: 'ignored', eventName });
  } catch (err) {
    console.error('[airbridge-postback]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
