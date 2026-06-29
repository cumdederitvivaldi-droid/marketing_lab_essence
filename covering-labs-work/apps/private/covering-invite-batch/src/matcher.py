"""BigQuery 매칭 쿼리 — App Install + Sign-up JOIN."""

import logging
from google.cloud import bigquery
from config import GCP_PROJECT, MATCH_WINDOW_DAYS, SIGNUP_WINDOW_HOURS

_logger = logging.getLogger(__name__)

MATCH_QUERY = f"""
WITH installs_deeplink AS (
  SELECT
    Airbridge_Device_ID,
    REGEXP_EXTRACT(Deeplink, r'invite_code=([^&]+)') AS invite_code,
    REGEXP_EXTRACT(Deeplink, r'variant=([^&]+)') AS variant,
    TIMESTAMP(Event_Datetime) AS installed_at
  FROM `{GCP_PROJECT}.airbridge_dataset.app_events`
  WHERE Event_Name = 'App Install'
    AND Deeplink LIKE '%invite_code=%'
    AND PARSE_DATE('%Y-%m-%d', Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
),
tracking_links_dedup AS (
  SELECT Short_Link_ID, Target_URL
  FROM `{GCP_PROJECT}.airbridge_dataset.tracking_link_events`
  WHERE Target_URL LIKE '%invite_code=%'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY Short_Link_ID ORDER BY Event_Datetime DESC) = 1
),
installs_fallback AS (
  SELECT
    a.Airbridge_Device_ID,
    REGEXP_EXTRACT(t.Target_URL, r'invite_code=([^&]+)') AS invite_code,
    'friend_invite_v1' AS variant,
    TIMESTAMP(a.Event_Datetime) AS installed_at
  FROM `{GCP_PROJECT}.airbridge_dataset.app_events` a
  JOIN tracking_links_dedup t
    ON a.Campaign_Short_ID = t.Short_Link_ID
  WHERE a.Event_Name = 'App Install'
    AND a.Channel = 'referral_bridge'
    AND (a.Deeplink IS NULL OR a.Deeplink NOT LIKE '%invite_code=%')
    AND PARSE_DATE('%Y-%m-%d', a.Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
),
opens_pre_signup AS (
  -- 기 앱 설치자(가입 이력 없음)가 친구초대 페이지 거쳐 진입한 케이스.
  -- App Open 시점에 User_ID 아직 없음 → 가입 후 device_users로 매칭.
  SELECT
    a.Airbridge_Device_ID,
    REGEXP_EXTRACT(t.Target_URL, r'invite_code=([^&]+)') AS invite_code,
    'friend_invite_v1' AS variant,
    TIMESTAMP(a.Event_Datetime) AS installed_at
  FROM `{GCP_PROJECT}.airbridge_dataset.app_events` a
  JOIN tracking_links_dedup t
    ON a.Campaign_Short_ID = t.Short_Link_ID
  WHERE a.Event_Name IN ('App Open', 'App Deeplink Open')
    AND a.Channel = 'referral_bridge'
    AND a.User_ID IS NULL
    AND PARSE_DATE('%Y-%m-%d', a.Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
),
installs AS (
  SELECT *, 0 AS match_priority FROM installs_deeplink
  UNION ALL
  SELECT *, 1 AS match_priority FROM installs_fallback
  UNION ALL
  SELECT *, 2 AS match_priority FROM opens_pre_signup
),
device_users AS (
  SELECT
    Airbridge_Device_ID,
    SAFE_CAST(User_ID AS INT64) AS user_id,
    TIMESTAMP(Event_Datetime) AS event_at
  FROM `{GCP_PROJECT}.airbridge_dataset.app_events`
  WHERE User_ID IS NOT NULL
    AND PARSE_DATE('%Y-%m-%d', Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY Airbridge_Device_ID
    ORDER BY Event_Datetime ASC
  ) = 1
),
users AS (
  SELECT id AS inviter_id, invite_code
  FROM `{GCP_PROJECT}.secure_dataset.user`
  WHERE invite_code IS NOT NULL
)
SELECT
  i.Airbridge_Device_ID AS airbridge_device_id,
  i.invite_code,
  COALESCE(i.variant, 'friend_invite_v1') AS variant,
  u.inviter_id,
  du.user_id AS invitee_user_id,
  i.installed_at,
  du.event_at AS signed_up_at
FROM installs i
JOIN device_users du
  ON i.Airbridge_Device_ID = du.Airbridge_Device_ID
 AND du.event_at >= i.installed_at
 AND du.event_at <= TIMESTAMP_ADD(i.installed_at, INTERVAL {SIGNUP_WINDOW_HOURS} HOUR)
JOIN users u
  ON i.invite_code = u.invite_code
WHERE du.user_id IS NOT NULL
  AND u.inviter_id != du.user_id
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY i.Airbridge_Device_ID
  ORDER BY i.match_priority ASC, du.event_at ASC, i.installed_at ASC, i.invite_code ASC
) = 1
"""


PUBLIC_MATCH_QUERY = f"""
WITH installs_public AS (
  SELECT
    Airbridge_Device_ID,
    'friend_invite_v1_public' AS variant,
    TIMESTAMP(Event_Datetime) AS installed_at
  FROM `{GCP_PROJECT}.airbridge_dataset.app_events`
  WHERE Event_Name = 'App Install'
    AND Channel = 'referral_bridge'
    AND Ad_Group = 'friend_invite_v1_public'
    AND PARSE_DATE('%Y-%m-%d', Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
),
opens_public_pre_signup AS (
  -- 공용 링크 + 기 앱 설치자(가입 이력 없음)
  SELECT
    Airbridge_Device_ID,
    'friend_invite_v1_public' AS variant,
    TIMESTAMP(Event_Datetime) AS installed_at
  FROM `{GCP_PROJECT}.airbridge_dataset.app_events`
  WHERE Event_Name IN ('App Open', 'App Deeplink Open')
    AND Channel = 'referral_bridge'
    AND Ad_Group = 'friend_invite_v1_public'
    AND User_ID IS NULL
    AND PARSE_DATE('%Y-%m-%d', Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
),
installs_public_all AS (
  SELECT * FROM installs_public
  UNION ALL
  SELECT * FROM opens_public_pre_signup
),
device_users AS (
  SELECT
    Airbridge_Device_ID,
    SAFE_CAST(User_ID AS INT64) AS user_id,
    TIMESTAMP(Event_Datetime) AS event_at
  FROM `{GCP_PROJECT}.airbridge_dataset.app_events`
  WHERE User_ID IS NOT NULL
    AND PARSE_DATE('%Y-%m-%d', Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY Airbridge_Device_ID
    ORDER BY Event_Datetime ASC
  ) = 1
)
SELECT
  i.Airbridge_Device_ID AS airbridge_device_id,
  CAST(NULL AS STRING) AS invite_code,
  i.variant,
  CAST(NULL AS INT64) AS inviter_id,
  du.user_id AS invitee_user_id,
  i.installed_at,
  du.event_at AS signed_up_at
FROM installs_public_all i
JOIN device_users du
  ON i.Airbridge_Device_ID = du.Airbridge_Device_ID
 AND du.event_at >= i.installed_at
 AND du.event_at <= TIMESTAMP_ADD(i.installed_at, INTERVAL {SIGNUP_WINDOW_HOURS} HOUR)
WHERE du.user_id IS NOT NULL
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY i.Airbridge_Device_ID
  ORDER BY du.event_at ASC
) = 1
"""


EXISTING_MATCH_QUERY = f"""
WITH tracking_links_dedup AS (
  SELECT Short_Link_ID, Target_URL
  FROM `{GCP_PROJECT}.airbridge_dataset.tracking_link_events`
  WHERE Target_URL LIKE '%invite_code=%'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY Short_Link_ID ORDER BY Event_Datetime DESC) = 1
),
opens_deeplink_existing AS (
  SELECT
    a.Airbridge_Device_ID,
    SAFE_CAST(a.User_ID AS INT64) AS user_id,
    REGEXP_EXTRACT(t.Target_URL, r'invite_code=([^&]+)') AS invite_code,
    REGEXP_EXTRACT(t.Target_URL, r'variant=([^&]+)') AS variant,
    TIMESTAMP(a.Event_Datetime) AS event_at
  FROM `{GCP_PROJECT}.airbridge_dataset.app_events` a
  JOIN tracking_links_dedup t
    ON a.Campaign_Short_ID = t.Short_Link_ID
  WHERE a.Event_Name IN ('App Open', 'App Deeplink Open')
    AND a.Channel = 'referral_bridge'
    AND a.User_ID IS NOT NULL
    AND PARSE_DATE('%Y-%m-%d', a.Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
),
installs_deeplink_existing AS (
  -- 기 가입자가 개인화 invite_code 링크 거쳐 앱 재설치한 경로.
  -- App Install 시점 User_ID null → 직후 device 활동에서 User_ID 잡힘.
  SELECT
    i.Airbridge_Device_ID,
    SAFE_CAST(du.User_ID AS INT64) AS user_id,
    REGEXP_EXTRACT(t.Target_URL, r'invite_code=([^&]+)') AS invite_code,
    REGEXP_EXTRACT(t.Target_URL, r'variant=([^&]+)') AS variant,
    TIMESTAMP(du.Event_Datetime) AS event_at
  FROM `{GCP_PROJECT}.airbridge_dataset.app_events` i
  JOIN tracking_links_dedup t
    ON i.Campaign_Short_ID = t.Short_Link_ID
  JOIN `{GCP_PROJECT}.airbridge_dataset.app_events` du
    ON i.Airbridge_Device_ID = du.Airbridge_Device_ID
   AND TIMESTAMP(du.Event_Datetime) >= TIMESTAMP(i.Event_Datetime)
   AND TIMESTAMP(du.Event_Datetime) <= TIMESTAMP_ADD(TIMESTAMP(i.Event_Datetime), INTERVAL {SIGNUP_WINDOW_HOURS} HOUR)
   AND du.User_ID IS NOT NULL
  JOIN `{GCP_PROJECT}.secure_dataset.user` u
    ON SAFE_CAST(u.id AS INT64) = SAFE_CAST(du.User_ID AS INT64)
   AND u.created_date < TIMESTAMP_SUB(TIMESTAMP(i.Event_Datetime), INTERVAL {SIGNUP_WINDOW_HOURS} HOUR)
  WHERE i.Event_Name = 'App Install'
    AND i.Channel = 'referral_bridge'
    AND PARSE_DATE('%Y-%m-%d', i.Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
    AND PARSE_DATE('%Y-%m-%d', du.Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
),
combined_existing AS (
  SELECT * FROM opens_deeplink_existing
  UNION ALL
  SELECT * FROM installs_deeplink_existing
),
users AS (
  SELECT id AS inviter_id, invite_code
  FROM `{GCP_PROJECT}.secure_dataset.user`
  WHERE invite_code IS NOT NULL
)
SELECT
  o.Airbridge_Device_ID AS airbridge_device_id,
  o.invite_code,
  COALESCE(o.variant, 'friend_invite_v1') AS variant,
  u.inviter_id,
  o.user_id AS invitee_user_id,
  CAST(NULL AS TIMESTAMP) AS installed_at,
  o.event_at AS signed_up_at
FROM combined_existing o
JOIN users u ON o.invite_code = u.invite_code
WHERE u.inviter_id != o.user_id
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY o.user_id
  ORDER BY o.event_at ASC
) = 1
"""


PUBLIC_EXISTING_MATCH_QUERY = f"""
WITH opens_public_existing AS (
  SELECT
    Airbridge_Device_ID,
    SAFE_CAST(User_ID AS INT64) AS user_id,
    TIMESTAMP(Event_Datetime) AS event_at
  FROM `{GCP_PROJECT}.airbridge_dataset.app_events`
  WHERE Event_Name IN ('App Open', 'App Deeplink Open')
    AND Channel = 'referral_bridge'
    AND Ad_Group = 'friend_invite_v1_public'
    AND User_ID IS NOT NULL
    AND PARSE_DATE('%Y-%m-%d', Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
),
installs_public_existing AS (
  -- 기 가입자가 V2 공용 share 링크 거쳐 앱 재설치한 경로.
  -- App Install 시점 User_ID null → 직후 device 활동(Home Screen 등)에서 User_ID 잡힘.
  -- secure_dataset.user.created_date < installed_at - SIGNUP_WINDOW로 기 가입자만 통과.
  SELECT
    i.Airbridge_Device_ID,
    SAFE_CAST(du.User_ID AS INT64) AS user_id,
    TIMESTAMP(du.Event_Datetime) AS event_at
  FROM `{GCP_PROJECT}.airbridge_dataset.app_events` i
  JOIN `{GCP_PROJECT}.airbridge_dataset.app_events` du
    ON i.Airbridge_Device_ID = du.Airbridge_Device_ID
   AND TIMESTAMP(du.Event_Datetime) >= TIMESTAMP(i.Event_Datetime)
   AND TIMESTAMP(du.Event_Datetime) <= TIMESTAMP_ADD(TIMESTAMP(i.Event_Datetime), INTERVAL {SIGNUP_WINDOW_HOURS} HOUR)
   AND du.User_ID IS NOT NULL
  JOIN `{GCP_PROJECT}.secure_dataset.user` u
    ON SAFE_CAST(u.id AS INT64) = SAFE_CAST(du.User_ID AS INT64)
   AND u.created_date < TIMESTAMP_SUB(TIMESTAMP(i.Event_Datetime), INTERVAL {SIGNUP_WINDOW_HOURS} HOUR)
  WHERE i.Event_Name = 'App Install'
    AND i.Channel = 'referral_bridge'
    AND i.Ad_Group = 'friend_invite_v1_public'
    AND PARSE_DATE('%Y-%m-%d', i.Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
    AND PARSE_DATE('%Y-%m-%d', du.Event_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {MATCH_WINDOW_DAYS} DAY)
),
combined AS (
  SELECT * FROM opens_public_existing
  UNION ALL
  SELECT * FROM installs_public_existing
)
SELECT
  Airbridge_Device_ID AS airbridge_device_id,
  CAST(NULL AS STRING) AS invite_code,
  'friend_invite_v1_public' AS variant,
  CAST(NULL AS INT64) AS inviter_id,
  user_id AS invitee_user_id,
  CAST(NULL AS TIMESTAMP) AS installed_at,
  event_at AS signed_up_at
FROM combined
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY user_id
  ORDER BY event_at ASC
) = 1
"""


# V2 기존 가입자 분기 토글
# FlareLane V2 기존 invitee Journey (bf592f22-bdf2-404c-bf13-8e31fd41c27a) 활성화 +
# CS 사전 공지 + 보상 정책 확정 후 True로 변경.
# False인 동안에는 EXISTING 매칭 쿼리를 호출하지 않아 V2 이벤트가 발사되지 않는다.
V2_EXISTING_ENABLED = True


def query_matched_installs(client: bigquery.Client) -> list[dict]:
    """신규 가입자(App Install) + 기존 가입자(App Open) 매칭 결과를 합쳐 반환.

    각 row에 `recipient_type` ('new' or 'existing') 필드 추가.
    동일 invitee_user_id가 신규+기존 양쪽에 잡히면 신규 우선.
    `V2_EXISTING_ENABLED=False`일 때는 신규 매칭(new)만 반환.
    """
    _logger.info("BigQuery 매칭 쿼리 실행 중 (신규 개인화)...")
    result = client.query(MATCH_QUERY).result()
    new_rows = [{**dict(row), "recipient_type": "new"} for row in result]
    _logger.info(f"신규 개인화 매칭: {len(new_rows)}건")

    _logger.info("BigQuery 매칭 쿼리 실행 중 (신규 공용)...")
    result_public = client.query(PUBLIC_MATCH_QUERY).result()
    new_public_rows = [{**dict(row), "recipient_type": "new"} for row in result_public]
    _logger.info(f"신규 공용 매칭: {len(new_public_rows)}건")

    if not V2_EXISTING_ENABLED:
        _logger.info("V2_EXISTING_ENABLED=False → 기존 가입자 매칭 스킵 (V1 정책만 적용)")
        return new_rows + new_public_rows

    _logger.info("BigQuery 매칭 쿼리 실행 중 (기존 개인화)...")
    result_existing = client.query(EXISTING_MATCH_QUERY).result()
    existing_rows = [{**dict(row), "recipient_type": "existing"} for row in result_existing]
    _logger.info(f"기존 개인화 매칭: {len(existing_rows)}건")

    _logger.info("BigQuery 매칭 쿼리 실행 중 (기존 공용)...")
    result_public_existing = client.query(PUBLIC_EXISTING_MATCH_QUERY).result()
    existing_public_rows = [{**dict(row), "recipient_type": "existing"} for row in result_public_existing]
    _logger.info(f"기존 공용 매칭: {len(existing_public_rows)}건")

    # 신규에 잡힌 invitee_user_id는 기존 매칭에서 제외 (Install + Open 둘 다 발생 시 신규 우선)
    new_invitee_ids = {r["invitee_user_id"] for r in new_rows + new_public_rows}
    filtered_existing = [r for r in existing_rows + existing_public_rows if r["invitee_user_id"] not in new_invitee_ids]
    dedup_skipped = (len(existing_rows) + len(existing_public_rows)) - len(filtered_existing)
    if dedup_skipped > 0:
        _logger.info(f"기존 매칭 중 신규 중복 제외: {dedup_skipped}건")

    return new_rows + new_public_rows + filtered_existing
