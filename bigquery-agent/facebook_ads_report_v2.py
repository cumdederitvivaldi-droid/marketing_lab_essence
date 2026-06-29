# -*- coding: utf-8 -*-
"""
Facebook Ads Report v2
Facebook Graph API → Markdown + CSV 리포트 자동 생성

사용법:
  1. 환경변수 설정:
       set FACEBOOK_ACCESS_TOKEN=your_token_here
       set FACEBOOK_ACCOUNT_ID=act_225607806262602   (선택 — 기본값 있음)
  2. 실행:
       python facebook_ads_report_v2.py
  3. datas/ 디렉토리에 .md + .csv 파일 생성됨

필요 권한: ads_read, business_management
"""

import os
import sys
import json
import csv
import time
import requests
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding="utf-8")

# ──────────────────────────────────────────────
# 설정
# ──────────────────────────────────────────────
ACCESS_TOKEN = os.getenv("FACEBOOK_ACCESS_TOKEN", "")
ACCOUNT_ID   = os.getenv("FACEBOOK_ACCOUNT_ID", "act_225607806262602")
API_VERSION  = "v19.0"
BASE_URL     = f"https://graph.facebook.com/{API_VERSION}"

# 조회 기간: 기본 최근 30일
DATE_PRESET  = "last_30d"   # last_7d / last_30d / this_month / last_month / custom
# DATE_START = "2026-04-01"  # DATE_PRESET 대신 커스텀 기간 사용 시 주석 해제
# DATE_END   = "2026-04-29"


def api_get(endpoint: str, params: dict) -> dict:
    """Graph API GET 요청 공통 함수. 오류 시 빈 dict 반환."""
    params["access_token"] = ACCESS_TOKEN
    url = f"{BASE_URL}/{endpoint}"
    resp = requests.get(url, params=params, timeout=30)
    data = resp.json()
    if "error" in data:
        code = data["error"].get("code", "?")
        msg  = data["error"].get("message", "")
        print(f"  ⚠️  API 오류 [{code}]: {msg}")
        return {}
    return data


def get_account_info() -> dict:
    """광고 계정 기본 정보 조회."""
    data = api_get(ACCOUNT_ID, {
        "fields": "name,account_id,currency,account_status,timezone_name"
    })
    return data


def get_all_campaigns() -> dict:
    """캠페인 목록 전체 조회 (페이징). {campaign_id: {name, status, objective, created_time}} 반환."""
    result = {}
    params = {
        "fields": "id,name,status,objective,created_time",
        "limit": 200,
    }
    data = api_get(f"{ACCOUNT_ID}/campaigns", params)
    if not data:
        return result

    for c in data.get("data", []):
        result[c["id"]] = c

    while "paging" in data and "next" in data["paging"]:
        time.sleep(0.5)
        resp = requests.get(data["paging"]["next"], timeout=30)
        data = resp.json()
        if "error" in data:
            break
        for c in data.get("data", []):
            result[c["id"]] = c

    return result


def get_all_insights_ad_level() -> list:
    """계정 레벨에서 소재(Ad) 단위 인사이트를 한 번에 조회 (페이징 포함).

    개별 캠페인/광고세트/소재 호출 대신 account-level insights API를 사용해
    Rate Limit를 최소화한다.
    """
    all_rows = []
    params = {
        "fields": "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,"
                  "spend,impressions,clicks,reach,ctr,cpc,cpm,actions",
        "level": "ad",
        "date_preset": DATE_PRESET,
        # 커스텀 기간 사용 시:
        # "time_range": json.dumps({"since": DATE_START, "until": DATE_END}),
        "limit": 200,
    }
    print("  → 계정 전체 소재 인사이트 조회 중 (level=ad)...")
    data = api_get(f"{ACCOUNT_ID}/insights", params)
    if not data:
        return all_rows

    all_rows.extend(data.get("data", []))

    page = 1
    while "paging" in data and "next" in data["paging"]:
        page += 1
        print(f"  → 페이지 {page} 로딩...")
        time.sleep(1)   # Rate Limit 방지
        resp = requests.get(data["paging"]["next"], timeout=60)
        data = resp.json()
        if "error" in data:
            code = data["error"].get("code", "?")
            msg  = data["error"].get("message", "")
            print(f"  ⚠️  페이징 오류 [{code}]: {msg}")
            break
        all_rows.extend(data.get("data", []))

    return all_rows


def extract_installs(actions: list) -> int:
    """actions 배열에서 앱 설치(mobile_app_install) 수 추출."""
    if not actions:
        return 0
    for a in actions:
        if a.get("action_type") == "mobile_app_install":
            return int(float(a.get("value", 0)))
    return 0


def fmt_krw(value) -> str:
    try:
        return f"₩{int(float(value)):,}"
    except (ValueError, TypeError):
        return "₩0"


def fmt_num(value) -> str:
    try:
        return f"{int(float(value)):,}"
    except (ValueError, TypeError):
        return "0"


def fmt_pct(value) -> str:
    try:
        return f"{float(value):.2f}%"
    except (ValueError, TypeError):
        return "0.00%"


# ──────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────
def main():
    if not ACCESS_TOKEN:
        print("❌ FACEBOOK_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.")
        print("   set FACEBOOK_ACCESS_TOKEN=your_token_here  (Windows)")
        print("   export FACEBOOK_ACCESS_TOKEN=your_token_here  (Mac/Linux)")
        sys.exit(1)

    print(f"📡 Facebook Ads API 연결 중 ({ACCOUNT_ID})...")

    # ── 1. 계정 정보
    account = get_account_info()
    account_name     = account.get("name", "알 수 없음")
    account_currency = account.get("currency", "KRW")
    account_status   = {1: "활성", 2: "비활성", 3: "미결제", 7: "취소"}.get(
        account.get("account_status"), str(account.get("account_status", "-"))
    )
    account_timezone = account.get("timezone_name", "-")
    print(f"✅ 계정: {account_name} ({ACCOUNT_ID}) | 상태: {account_status}")

    # ── 2. 캠페인 메타데이터 (상태, 목표, 생성일)
    print("📋 캠페인 목록 조회 중...")
    camp_meta = get_all_campaigns()
    print(f"   총 {len(camp_meta)}개 캠페인 발견")

    # ── 3. 계정 레벨 소재 인사이트 (API 호출 최소화)
    print("📊 소재 단위 인사이트 조회 중...")
    ad_insights = get_all_insights_ad_level()
    print(f"   소재 데이터 {len(ad_insights)}행 수집 완료")

    # ── 4. 캠페인 → 광고세트 → 소재 계층으로 집계
    from collections import defaultdict

    # campaign_id → adset_id → ad_id 계층 구조 구성
    camp_map = defaultdict(lambda: defaultdict(list))
    csv_rows = []

    total_spend = 0.0
    total_impressions = 0
    total_clicks = 0
    total_installs = 0

    for row in ad_insights:
        camp_id   = row.get("campaign_id", "-")
        camp_name = row.get("campaign_name", "-")
        adset_id  = row.get("adset_id", "-")
        adset_name= row.get("adset_name", "-")
        ad_id     = row.get("ad_id", "-")
        ad_name   = row.get("ad_name", "-")

        spend       = float(row.get("spend", 0) or 0)
        impressions = int(row.get("impressions", 0) or 0)
        clicks      = int(row.get("clicks", 0) or 0)
        ctr         = float(row.get("ctr", 0) or 0)
        cpc         = float(row.get("cpc", 0) or 0)
        installs    = extract_installs(row.get("actions", []))

        total_spend       += spend
        total_impressions += impressions
        total_clicks      += clicks
        total_installs    += installs

        camp_map[camp_id][adset_id].append({
            "camp_name": camp_name,
            "adset_name": adset_name,
            "ad_id": ad_id, "ad_name": ad_name,
            "spend": spend, "impressions": impressions, "clicks": clicks,
            "ctr": ctr, "cpc": cpc, "installs": installs,
        })

        meta = camp_meta.get(camp_id, {})
        csv_rows.append({
            "campaign_id": camp_id,
            "campaign_name": camp_name,
            "campaign_status": meta.get("status", "-"),
            "campaign_objective": meta.get("objective", "-"),
            "adset_id": adset_id,
            "adset_name": adset_name,
            "ad_id": ad_id,
            "ad_name": ad_name,
            "spend": round(spend, 2),
            "impressions": impressions,
            "clicks": clicks,
            "ctr": round(ctr, 4),
            "cpc": round(cpc, 2),
            "installs": installs,
            "cpi": round(spend / installs, 2) if installs else None,
        })

    # 리포트용 구조 재조립
    report_data = []
    for camp_id, adset_dict in camp_map.items():
        meta = camp_meta.get(camp_id, {})
        camp_name = meta.get("name") or list(adset_dict.values())[0][0]["camp_name"]
        camp_status = meta.get("status", "-")
        camp_obj = meta.get("objective", "-")
        camp_created = (meta.get("created_time") or "-")[:10]

        # 캠페인 합계
        c_spend = sum(ad["spend"] for ads in adset_dict.values() for ad in ads)
        c_imp   = sum(ad["impressions"] for ads in adset_dict.values() for ad in ads)
        c_clk   = sum(ad["clicks"] for ads in adset_dict.values() for ad in ads)
        c_inst  = sum(ad["installs"] for ads in adset_dict.values() for ad in ads)
        c_ctr   = c_clk / c_imp * 100 if c_imp else 0

        adset_report = []
        for adset_id, ads in adset_dict.items():
            adset_name = ads[0]["adset_name"]
            as_spend = sum(a["spend"] for a in ads)
            as_imp   = sum(a["impressions"] for a in ads)
            as_clk   = sum(a["clicks"] for a in ads)
            as_inst  = sum(a["installs"] for a in ads)
            as_ctr   = as_clk / as_imp * 100 if as_imp else 0

            adset_report.append({
                "id": adset_id, "name": adset_name,
                "spend": as_spend, "impressions": as_imp, "clicks": as_clk,
                "ctr": as_ctr, "installs": as_inst,
                "ads": ads,
            })

        report_data.append({
            "id": camp_id, "name": camp_name, "status": camp_status,
            "objective": camp_obj, "created_time": camp_created,
            "spend": c_spend, "impressions": c_imp, "clicks": c_clk,
            "ctr": c_ctr, "cpc": c_spend / c_clk if c_clk else 0,
            "installs": c_inst,
            "adsets": adset_report,
        })

    # 지출 기준 내림차순 정렬
    report_data.sort(key=lambda x: -x["spend"])

    # ── 4. 파일 저장
    os.makedirs("datas", exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    base = f"datas/{ts}_facebook_ads"

    # ── 4-1. Markdown 리포트
    lines = []
    lines.append(f"# Facebook Ads 리포트")
    lines.append(f"")
    lines.append(f"- **계정**: {account_name} (`{ACCOUNT_ID}`)")
    lines.append(f"- **상태**: {account_status} | 통화: {account_currency} | 시간대: {account_timezone}")
    lines.append(f"- **조회 기간**: `{DATE_PRESET}`")
    lines.append(f"- **생성 일시**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"")
    lines.append(f"---")
    lines.append(f"")
    lines.append(f"## 전체 요약")
    lines.append(f"")
    lines.append(f"| 지표 | 값 |")
    lines.append(f"|------|----|")
    lines.append(f"| 총 지출 | {fmt_krw(total_spend)} |")
    lines.append(f"| 총 노출 | {fmt_num(total_impressions)} |")
    lines.append(f"| 총 클릭 | {fmt_num(total_clicks)} |")
    lines.append(f"| 전체 CTR | {fmt_pct(total_clicks / total_impressions * 100 if total_impressions else 0)} |")
    lines.append(f"| 총 설치 | {fmt_num(total_installs)} |")
    lines.append(f"| 전체 CPI | {fmt_krw(total_spend / total_installs if total_installs else 0)} |")
    lines.append(f"")
    lines.append(f"---")
    lines.append(f"")
    lines.append(f"## 캠페인별 성과")
    lines.append(f"")

    for camp in report_data:
        status_icon = {"ACTIVE": "🟢", "PAUSED": "⏸️", "DELETED": "🗑️"}.get(camp["status"], "⚪")
        lines.append(f"### {status_icon} {camp['name']}")
        lines.append(f"")
        lines.append(f"| 항목 | 값 |")
        lines.append(f"|------|----|")
        lines.append(f"| 캠페인 ID | `{camp['id']}` |")
        lines.append(f"| 상태 | {camp['status']} |")
        lines.append(f"| 목표 | {camp['objective']} |")
        lines.append(f"| 생성일 | {camp['created_time']} |")
        lines.append(f"| 지출 | {fmt_krw(camp['spend'])} |")
        lines.append(f"| 노출 | {fmt_num(camp['impressions'])} |")
        lines.append(f"| 클릭 | {fmt_num(camp['clicks'])} |")
        lines.append(f"| CTR | {fmt_pct(camp['ctr'])} |")
        lines.append(f"| CPC | {fmt_krw(camp['cpc'])} |")
        lines.append(f"| 설치 | {fmt_num(camp['installs'])} |")
        cpi = camp['spend'] / camp['installs'] if camp['installs'] else 0
        lines.append(f"| CPI | {fmt_krw(cpi)} |")
        lines.append(f"")

        if camp["adsets"]:
            lines.append(f"#### 광고세트 목록")
            lines.append(f"")
            lines.append(f"| 광고세트명 | 지출 | 노출 | 클릭 | CTR | 설치 |")
            lines.append(f"|-----------|------|------|------|-----|------|")
            for adset in camp["adsets"]:
                lines.append(
                    f"| {adset['name'][:40]} "
                    f"| {fmt_krw(adset['spend'])} "
                    f"| {fmt_num(adset['impressions'])} "
                    f"| {fmt_num(adset['clicks'])} "
                    f"| {fmt_pct(adset['ctr'])} "
                    f"| {fmt_num(adset['installs'])} |"
                )
            lines.append(f"")

            # 소재 테이블
            for adset in camp["adsets"]:
                if adset["ads"]:
                    lines.append(f"##### 📌 {adset['name'][:40]} — 소재별 성과")
                    lines.append(f"")
                    lines.append(f"| 소재명 | 지출 | 노출 | 클릭 | CTR | CPC | 설치 | CPI |")
                    lines.append(f"|--------|------|------|------|-----|-----|------|-----|")
                    for ad in adset["ads"]:
                        ad_cpi = ad['spend'] / ad['installs'] if ad['installs'] else 0
                        lines.append(
                            f"| {ad['ad_name'][:35]} "
                            f"| {fmt_krw(ad['spend'])} "
                            f"| {fmt_num(ad['impressions'])} "
                            f"| {fmt_num(ad['clicks'])} "
                            f"| {fmt_pct(ad['ctr'])} "
                            f"| {fmt_krw(ad['cpc'])} "
                            f"| {fmt_num(ad['installs'])} "
                            f"| {fmt_krw(ad_cpi)} |"
                        )
                    lines.append(f"")

        lines.append(f"---")
        lines.append(f"")

    md_path = f"{base}_report.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    # ── 4-2. CSV (소재 레벨 raw data)
    csv_path = f"{base}_ad_level.csv"
    if csv_rows:
        fieldnames = list(csv_rows[0].keys())
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(csv_rows)

    # ── 4-3. TXT 메타데이터
    txt_path = f"{base}_meta.txt"
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(f"쿼리 설명: Facebook Ads Graph API 리포트 자동 생성\n")
        f.write(f"계정: {account_name} ({ACCOUNT_ID})\n")
        f.write(f"조회 기간: {DATE_PRESET}\n")
        f.write(f"추출 일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"캠페인 수: {len(report_data)}\n")
        f.write(f"소재(Ad) 수: {len(csv_rows)}\n")
        f.write(f"\n컬럼 설명 (CSV):\n")
        f.write(f"  campaign_name  = 캠페인명\n")
        f.write(f"  adset_name     = 광고세트명 (Airbridge sub_publisher_2 매핑 대상)\n")
        f.write(f"  ad_name        = 소재명 (Airbridge sub_publisher_3 매핑 대상)\n")
        f.write(f"  spend          = 지출액 (KRW)\n")
        f.write(f"  impressions    = 노출수\n")
        f.write(f"  clicks         = 클릭수\n")
        f.write(f"  ctr            = 클릭률 (소수점, ×100 = %)\n")
        f.write(f"  cpc            = 클릭당 비용 (KRW)\n")
        f.write(f"  installs       = 앱 설치수 (mobile_app_install 기준)\n")
        f.write(f"  cpi            = 설치당 비용 (KRW)\n")
        f.write(f"\n생성 파일:\n")
        f.write(f"  {md_path}  ← Markdown 리포트\n")
        f.write(f"  {csv_path}  ← 소재 레벨 raw CSV\n")

    print(f"\n✅ 완료!")
    print(f"   📄 리포트: {md_path}")
    print(f"   📊 CSV:    {csv_path}")
    print(f"   📝 메타:   {txt_path}")
    print(f"\n📈 요약: 지출 {fmt_krw(total_spend)} | 노출 {fmt_num(total_impressions)} | 클릭 {fmt_num(total_clicks)} | 설치 {fmt_num(total_installs)}")


if __name__ == "__main__":
    main()
