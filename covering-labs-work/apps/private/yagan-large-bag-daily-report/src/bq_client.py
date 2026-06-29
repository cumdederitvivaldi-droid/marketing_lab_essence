import json
import shutil
import subprocess
from pathlib import Path

import config

_BQ = shutil.which("bq") or str(Path.home() / "google-cloud-sdk" / "bin" / "bq")

# 주문별 최종 상태 분류:
#   COMPLETED + 아이템 모두 성공(또는 아이템 없음) → COMPLETED
#   COMPLETED + 일부 아이템 FAILED                 → CHECK_PARTIAL
#   COMPLETED + 전체 아이템 FAILED                 → CHECK_ALL
#   CANCELED                                       → USER_CANCELED
#   FAILED + POLICY_FAIL                           → POLICY_FAIL
#   FAILED + NOTFOUND_FAIL                         → NOTFOUND_FAIL
#   FAILED + ENTER_FAIL                            → ENTER_FAIL
_STATS_SQL = """
WITH
target_orders AS (
  SELECT DISTINCT f.order_id
  FROM `covering-app-ccd23.secure_dataset.fulfillment`  AS f
  JOIN `covering-app-ccd23.secure_dataset.order_v2`     AS o  ON o.id  = f.order_id
  JOIN `covering-app-ccd23.secure_dataset.order_line`   AS ol ON ol.order_id = o.id
  JOIN `covering-app-ccd23.secure_dataset.product`      AS p  ON p.id  = ol.product_id
  WHERE DATE(f.scheduled_start_at, 'Asia/Seoul') = DATE '{target_date}'
    AND p.product_code = 'PICKUP_LARGE_COVERING_BAG'
    AND o.deleted_at  IS NULL
    AND ol.deleted_at IS NULL
),
order_status AS (
  SELECT
    f.order_id,
    CASE
      WHEN COUNTIF(f.status = 'COMPLETED') > 0 THEN 'COMPLETED'
      WHEN COUNTIF(f.status = 'CANCELED')  > 0 THEN 'CANCELED'
      WHEN COUNTIF(f.status = 'FAILED')    > 0 THEN 'FAILED'
      ELSE MAX(f.status)
    END                                                              AS final_status,
    MAX(CASE WHEN f.status = 'FAILED'    THEN f.failure_reason_code END) AS fail_code,
    MAX(CASE WHEN f.status = 'COMPLETED' THEN f.id                  END) AS completed_fulfillment_id
  FROM `covering-app-ccd23.secure_dataset.fulfillment` AS f
  WHERE f.order_id IN (SELECT order_id FROM target_orders)
    AND DATE(f.scheduled_start_at, 'Asia/Seoul') = DATE '{target_date}'
  GROUP BY f.order_id
),
item_results AS (
  SELECT
    fi.fulfillment_id,
    COUNTIF(fi.item_status = 'SUCCESS') AS success_count,
    COUNTIF(fi.item_status = 'FAILED')  AS failed_count
  FROM `covering-app-ccd23.secure_dataset.fulfillment_item` AS fi
  WHERE fi.fulfillment_id IN (
      SELECT completed_fulfillment_id FROM order_status
      WHERE completed_fulfillment_id IS NOT NULL
    )
    AND fi.deleted_at IS NULL
  GROUP BY fi.fulfillment_id
),
order_category AS (
  SELECT
    CASE
      WHEN os.final_status = 'CANCELED'                                                    THEN 'USER_CANCELED'
      WHEN os.final_status = 'FAILED' AND os.fail_code = 'POLICY_FAIL'                    THEN 'POLICY_FAIL'
      WHEN os.final_status = 'FAILED' AND os.fail_code = 'NOTFOUND_FAIL'                  THEN 'NOTFOUND_FAIL'
      WHEN os.final_status = 'FAILED' AND os.fail_code = 'ENTER_FAIL'                     THEN 'ENTER_FAIL'
      WHEN os.final_status = 'FAILED'                                                      THEN 'ENTER_FAIL'
      WHEN os.final_status = 'COMPLETED' AND ir.failed_count > 0 AND ir.success_count = 0 THEN 'CHECK_ALL'
      WHEN os.final_status = 'COMPLETED' AND ir.failed_count > 0                          THEN 'CHECK_PARTIAL'
      ELSE 'COMPLETED'
    END AS category
  FROM order_status os
  LEFT JOIN item_results ir ON ir.fulfillment_id = os.completed_fulfillment_id
)
SELECT
  COUNT(*)                              AS total,
  COUNTIF(category = 'COMPLETED')       AS completed,
  COUNTIF(category = 'CHECK_ALL')       AS check_all,
  COUNTIF(category = 'CHECK_PARTIAL')   AS check_partial,
  COUNTIF(category = 'USER_CANCELED')   AS user_canceled,
  COUNTIF(category = 'POLICY_FAIL')     AS policy_fail,
  COUNTIF(category = 'NOTFOUND_FAIL')   AS notfound_fail,
  COUNTIF(category = 'ENTER_FAIL')      AS enter_fail
FROM order_category
"""

# COMPLETED 방문 중 아이템 FAILED 사유 집계 (확인필요 사유)
_ITEM_REASONS_SQL = """
WITH
completed_fulfillments AS (
  SELECT DISTINCT f.id AS fulfillment_id
  FROM `covering-app-ccd23.secure_dataset.fulfillment`  AS f
  JOIN `covering-app-ccd23.secure_dataset.order_v2`     AS o  ON o.id  = f.order_id
  JOIN `covering-app-ccd23.secure_dataset.order_line`   AS ol ON ol.order_id = o.id
  JOIN `covering-app-ccd23.secure_dataset.product`      AS p  ON p.id  = ol.product_id
  WHERE DATE(f.scheduled_start_at, 'Asia/Seoul') = DATE '{target_date}'
    AND p.product_code = 'PICKUP_LARGE_COVERING_BAG'
    AND f.status = 'COMPLETED'
    AND o.deleted_at  IS NULL
    AND ol.deleted_at IS NULL
)
SELECT
  fi.failure_reason_message AS reason,
  COUNT(*)                  AS count
FROM `covering-app-ccd23.secure_dataset.fulfillment_item` AS fi
JOIN completed_fulfillments cf ON cf.fulfillment_id = fi.fulfillment_id
WHERE fi.item_status = 'FAILED'
  AND fi.failure_reason_message IS NOT NULL
  AND fi.deleted_at IS NULL
GROUP BY fi.failure_reason_message
ORDER BY count DESC
"""

# POLICY_FAIL 방문의 failure_reason_message 집계 (정책미준수 사유)
_POLICY_REASONS_SQL = """
SELECT
  f.failure_reason_message AS reason,
  COUNT(*)                 AS count
FROM `covering-app-ccd23.secure_dataset.fulfillment`  AS f
JOIN `covering-app-ccd23.secure_dataset.order_v2`     AS o  ON o.id  = f.order_id
JOIN `covering-app-ccd23.secure_dataset.order_line`   AS ol ON ol.order_id = o.id
JOIN `covering-app-ccd23.secure_dataset.product`      AS p  ON p.id  = ol.product_id
WHERE DATE(f.scheduled_start_at, 'Asia/Seoul') = DATE '{target_date}'
  AND p.product_code = 'PICKUP_LARGE_COVERING_BAG'
  AND f.status = 'FAILED'
  AND f.failure_reason_code = 'POLICY_FAIL'
  AND f.failure_reason_message IS NOT NULL
  AND o.deleted_at  IS NULL
  AND ol.deleted_at IS NULL
GROUP BY f.failure_reason_message
ORDER BY count DESC
"""


def _clean_json(raw: str) -> str:
    stripped = raw.strip()
    if stripped.startswith(("[", "{")):
        return stripped
    indices = [i for i in (stripped.find("["), stripped.find("{")) if i >= 0]
    if not indices:
        raise RuntimeError(f"BigQuery JSON 응답을 찾지 못했습니다.\n{raw}")
    return stripped[min(indices):]


def _run_query(sql: str) -> list[dict]:
    result = subprocess.run(
        [_BQ, "query", "--use_legacy_sql=false", "--format=json",
         f"--project_id={config.GCP_PROJECT}"],
        input=sql,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"BigQuery 조회 실패: {result.stderr.strip()}")
    raw = result.stdout.strip()
    if not raw:
        return []
    return json.loads(_clean_json(raw))


def _empty_stats() -> dict:
    return {k: 0 for k in
            ("total", "completed", "check_all", "check_partial",
             "user_canceled", "policy_fail", "notfound_fail", "enter_fail")}


def fetch_stats(target_date: str) -> dict:
    """target_date: 'YYYY-MM-DD' 형식의 KST 날짜"""
    sql = _STATS_SQL.replace("{target_date}", target_date)
    rows = _run_query(sql)
    if not rows:
        return _empty_stats()
    row = rows[0]
    return {k: int(row.get(k) or 0) for k in _empty_stats()}


def fetch_item_reasons(target_date: str) -> list[dict]:
    """확인필요 사유: COMPLETED 방문 중 아이템 FAILED 집계"""
    sql = _ITEM_REASONS_SQL.replace("{target_date}", target_date)
    rows = _run_query(sql)
    return [{"reason": r.get("reason", ""), "count": int(r.get("count") or 0)}
            for r in rows]


def fetch_policy_reasons(target_date: str) -> list[dict]:
    """정책미준수 사유: POLICY_FAIL 방문 failure_reason_message 집계"""
    sql = _POLICY_REASONS_SQL.replace("{target_date}", target_date)
    rows = _run_query(sql)
    return [{"reason": r.get("reason", ""), "count": int(r.get("count") or 0)}
            for r in rows]
