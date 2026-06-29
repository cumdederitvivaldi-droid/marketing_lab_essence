from datetime import datetime, timedelta, timezone

import requests

import config

_KST = timezone(timedelta(hours=9))

# 선별장 → 지역 매핑 (여러 선별장이 같은 지역으로 묶임)
# BQ 데이터가 "선별장A" 또는 "A" 어느 형태로 오더라도 처리
_REGION_MAP: dict[str, str] = {
    "FINAL_DESTINATION_A": "남양주", "선별장A": "남양주", "A": "남양주",
    "FINAL_DESTINATION_E": "남양주", "선별장E": "남양주", "E": "남양주",
    "FINAL_DESTINATION_B": "인천",   "선별장B": "인천",   "B": "인천",
    "FINAL_DESTINATION_D": "인천",   "선별장D": "인천",   "D": "인천",
    "FINAL_DESTINATION_C": "화성",   "선별장C": "화성",   "C": "화성",
    "FINAL_DESTINATION_F": "세종",   "선별장F": "세종",   "F": "세종",
}

# 지역 표시 시 괄호에 보여줄 선별장 목록
_REGION_LABELS: dict[str, str] = {
    "남양주": "선별장A, E",
    "인천":   "선별장B, D",
    "화성":   "선별장C",
    "세종":   "선별장F",
}

# 리포트에 표시할 지역 순서
_REGION_ORDER = ["남양주", "인천", "화성", "세종"]


def _post(text: str) -> None:
    """Slack chat.postMessage API를 호출해 메시지를 전송한다."""
    resp = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {config.SLACK_BOT_TOKEN}"},
        json={"channel": config.SLACK_CHANNEL, "text": text},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"Slack 전송 실패: {data.get('error')}")


def _merge_by_region(rows: list[dict]) -> dict[str, dict]:
    """선별장 단위 데이터를 지역 단위로 합산한다."""
    merged: dict[str, dict] = {}
    for row in rows:
        dest = row["destination"]
        region = _REGION_MAP.get(dest, dest)  # 매핑 없으면 원값 그대로
        if region not in merged:
            merged[region] = {"rider_count": 0, "bag_count": 0}
        merged[region]["rider_count"] += row["rider_count"]
        merged[region]["bag_count"] += row["bag_count"]
    return merged


def send_report(rows: list[dict]) -> None:
    """도착지별 통계를 지역 단위로 합산해 Slack 리포트 메시지를 전송한다."""
    now = datetime.now(_KST).strftime("%Y-%m-%d %H:%M")

    region_data = _merge_by_region(rows)

    total_riders = sum(v["rider_count"] for v in region_data.values())
    total_bags = sum(v["bag_count"] for v in region_data.values())

    lines = [
        f"*🏭 야간 선별 리포트 — {now} 기준*",
        "",
        "도착지별 기사 현황",
    ]

    # 정해진 순서대로 출력, 없는 지역은 생략
    has_any = False
    for region in _REGION_ORDER:
        data = region_data.get(region)
        if not data:
            continue
        has_any = True
        label = _REGION_LABELS.get(region, region)
        lines.append(f"\n📍 *{region}* ({label})")
        lines.append(f"  기사 {data['rider_count']}명 | 봉투 {data['bag_count']}건")

    # 매핑되지 않은 기타 지역
    for region, data in region_data.items():
        if region in _REGION_ORDER:
            continue
        has_any = True
        lines.append(f"\n📍 *{region}*")
        lines.append(f"  기사 {data['rider_count']}명 | 봉투 {data['bag_count']}건")

    if not has_any:
        lines.append("\n_당일 배차된 야간 기사님이 없습니다._")
    else:
        lines.append(f"\n*합계: 기사 {total_riders}명 | 봉투 {total_bags}건*")

    _post("\n".join(lines))
