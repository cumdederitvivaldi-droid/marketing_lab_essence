# Reference Mapping Guide — 매체 × Airbridge 데이터 통합

> **목적**: Facebook Ads API, BigQuery `ads_data`, Airbridge MMP 세 가지 소스를 소재 단위로 통합 분석하기 위한 매핑 규칙
>
> **최초 작성**: 2026-04-29  
> **기준 데이터**: Facebook Ads API `last_30d` (521개 소재), BigQuery `ads_data.*`, `user_acquisition_channel`

---

## 목차

1. [데이터 소스 개요](#1-데이터-소스-개요)
2. [컬럼 매핑 테이블](#2-컬럼-매핑-테이블)
3. [매핑 계층별 한계와 해결 전략](#3-매핑-계층별-한계와-해결-전략)
4. [소재 네이밍 컨벤션 파서](#4-소재-네이밍-컨벤션-파서)
5. [통합 분석 쿼리 템플릿](#5-통합-분석-쿼리-템플릿)
6. [자동화 워크플로우](#6-자동화-워크플로우)

---

## 1. 데이터 소스 개요

| 소스 | 위치 | 집계 단위 | 주요 지표 | 한계 |
|------|------|-----------|-----------|------|
| **Facebook Ads API** | `facebook_ads_report_v2.py` 실행 | 소재(Ad) 단위 | spend, impressions, clicks, CTR, CPC, installs | 실시간 API 호출 필요, Rate Limit |
| **BigQuery `daily_cost_creative`** | `covering-app-ccd23.ads_data.daily_cost_creative` | 날짜 × 소재 단위 | cost, impressions, clicks, app_installs, CPI, ROAS | Facebook 외 매체 포함 (Google, TikTok 등) |
| **BigQuery `user_acquisition_channel`** | `covering-app-ccd23.ads_data.user_acquisition_channel` | 유저 단위 (1행=1유저) | user_id, ad_channel, ad_campaign, signup_date | **캠페인 레벨까지만** 존재, 광고세트·소재 레벨 없음 |
| **Airbridge MMP 엑셀 내보내기** | `datas/mmp_all.txt` 등 | 캠페인 × 소재 단위 | installs, cost, registrations, purchases | 수동 다운로드 필요, 기간 고정 |

---

## 2. 컬럼 매핑 테이블

### 2-1. 캠페인 레벨 (3소스 완전 매핑 가능)

| Facebook Ads API | `daily_cost_creative` | `user_acquisition_channel` | 비고 |
|---|---|---|---|
| `campaign_name` | `campaign` | `ad_campaign` | **완전 일치** — 3소스 Join Key |
| `campaign_status` | *(없음)* | *(없음)* | API에서만 확인 가능 |
| `campaign_objective` | *(없음)* | *(없음)* | API에서만 확인 가능 |
| *(없음)* | `channel` | `ad_channel` | `facebook.business` = Facebook |
| *(없음)* | `date` | `signup_date` | 날짜 기준 조인 시 활용 |

### 2-2. 광고세트(Adset) 레벨

| Facebook Ads API | `daily_cost_creative` | `user_acquisition_channel` | 비고 |
|---|---|---|---|
| `adset_name` | `ad_group` | **없음** | `user_acquisition_channel`에 광고세트 레벨 없음 |
| `adset_id` | *(없음)* | *(없음)* | API에서만 확인 가능 |

> ⚠️ `user_acquisition_channel`은 광고세트 레벨 컬럼이 없음.
> 유저 귀속 분석은 캠페인 레벨에서만 가능.

### 2-3. 소재(Ad/Creative) 레벨

| Facebook Ads API | `daily_cost_creative` | Airbridge MMP 엑셀 | `user_acquisition_channel` | 비고 |
|---|---|---|---|---|
| `ad_name` | `ad_creative` | `Ad` | **없음** | **소재 레벨 유저 귀속 불가** |
| `spend` | `cost` | `Cost` | *(없음)* | 3소스 매핑 가능 (비용 검증용) |
| `installs` | `app_installs` | `Installs` | *(집계 필요)* | 설치수 크로스체크 가능 |
| `ctr` | 직접계산 | *(없음)* | *(없음)* | `clicks / impressions * 100` |
| `cpc` | 직접계산 | *(없음)* | *(없음)* | `cost / clicks` |
| *(없음)* | `roas` | *(없음)* | *(없음)* | BQ에서만 제공 |
| *(없음)* | *(없음)* | `Event_count_af_complete_registration` | *(없음)* | 회원가입 수 — Airbridge 엑셀에서만 |
| *(없음)* | *(없음)* | `Event_unique_users_af_purchase` | 집계 가능 | 구매 유저 수 |

---

## 3. 매핑 계층별 한계와 해결 전략

### 3-1. 핵심 제약: 소재 레벨 유저 귀속 불가

```
user_acquisition_channel 테이블
  ├── ad_channel = 'facebook.business'
  ├── ad_campaign = 'AOS_논타겟_앱홍보(구매)_26.01.28'   ← 여기까지만 존재
  └── ad_adset / ad_creative = ❌ 없음
```

**해결 전략 A — 캠페인 단위 유저 귀속 후 소재별 비용 비례 배분**
```sql
-- 캠페인 유입 유저를 소재별 비용 비율로 배분 (추정치)
WITH camp_users AS (
  SELECT ad_campaign, COUNT(DISTINCT user_id) AS users
  FROM `covering-app-ccd23.ads_data.user_acquisition_channel`
  WHERE ad_channel = 'facebook.business'
    AND signup_date BETWEEN '2026-04-01' AND '2026-04-29'
  GROUP BY ad_campaign
),
creative_cost_share AS (
  SELECT campaign, ad_creative,
    SUM(cost) AS creative_cost,
    SUM(SUM(cost)) OVER (PARTITION BY campaign) AS camp_total_cost,
    SAFE_DIVIDE(SUM(cost), SUM(SUM(cost)) OVER (PARTITION BY campaign)) AS cost_share
  FROM `covering-app-ccd23.ads_data.daily_cost_creative`
  WHERE channel = 'facebook'
    AND date BETWEEN '2026-04-01' AND '2026-04-29'
  GROUP BY campaign, ad_creative
)
SELECT
  c.campaign,
  c.ad_creative,
  c.creative_cost,
  c.cost_share,
  u.users AS camp_users,
  ROUND(u.users * c.cost_share) AS estimated_users_from_creative
FROM creative_cost_share c
LEFT JOIN camp_users u ON c.campaign = u.ad_campaign
ORDER BY c.creative_cost DESC
```

**해결 전략 B — Airbridge MMP 엑셀 `Ad` 컬럼 활용 (소재 레벨 실측치)**
```
mmp_all.txt 구조:
  Campaign  |  Ad                                    | Installs | Cost | 회원가입 | 구매
  AOS_논타겟_앱홍보(구매)_26.01.28 | aos_vd_all_150L(가구)1_hn1_26.04.10 | 167 | 854,713 | 89 | 14

→ `Ad` 컬럼 = Facebook Ads API `ad_name` = daily_cost_creative `ad_creative`
→ 소재 레벨 설치 + 회원가입 + 구매 수치는 여기서만 확인 가능
```

### 3-2. 비용 크로스체크 방법

Facebook Ads API의 `spend`와 BQ `daily_cost_creative.cost`는 같은 값이어야 함.

```python
# 두 소스 비용 일치 여부 검증
# Facebook API CSV: 소재 단위 spend 합계
fb_api_total = df_fb['spend'].sum()

# BQ daily_cost_creative: 같은 기간 Facebook 채널 비용 합계
# bq query: SELECT SUM(cost) FROM daily_cost_creative WHERE channel='facebook' AND date BETWEEN ...
bq_total = ...

print(f"API spend: {fb_api_total:,.0f} | BQ cost: {bq_total:,.0f} | 차이: {abs(fb_api_total - bq_total):,.0f}")
```

---

## 4. 소재 네이밍 컨벤션 파서

커버링 광고 소재명은 아래 규칙으로 구성됨. 파싱하면 소재 특성별 성과 분석 가능.

### 4-1. 소재명(Ad Name) 구조

```
{os}_{format}_{targeting}_{concept}({hook}){version}_{manager}_{date}

예시: aos_vd_all_150L(가구)1_hn1_26.04.10
      ios_vd_re_990원(특가)1_25.07.23
      ios_im_lookalike(7%)_조사마_1월14_hn1_26.01.28
```

| 파트 | 가능한 값 | 의미 |
|------|-----------|------|
| `os` | `aos`, `ios` | Android / iOS |
| `format` | `vd`, `im` | 영상(Video) / 이미지(Image) |
| `targeting` | `all`, `re`, `lookalike(X%)` | 논타겟 / 리타겟 / 유사타겟 |
| `concept(hook)` | 자유형식 | 소구 메시지 + 후킹 소재 |
| `version` | 숫자 | 소재 버전 |
| `manager` | `hn1`, `cr1`, `mk1`, `nk1`, `sj1`, `dh1` | 제작 담당자 코드 |
| `date` | `YY.MM.DD` | 소재 시작일 |

### 4-2. 캠페인명(Campaign Name) 구조

```
{OS}_{targeting_type}_{objective}_{date}

예시: AOS_논타겟_앱홍보(구매)_26.01.28
      iOS(Web2App)_논타겟_판매_26.02.03
      iOS_유사타겟_회원가입_26.01.28_1
```

| 파트 | 가능한 값 | 의미 |
|------|-----------|------|
| `OS` | `AOS`, `iOS`, `AOS(Web2App)`, `iOS(Web2App)` | OS + 트래킹 방식 |
| `targeting_type` | `논타겟`, `리타겟`, `유사타겟` | 타겟팅 방식 |
| `objective` | `앱홍보(구매)`, `판매`, `회원가입`, `리드` | 캠페인 목표 |
| `date` | `YY.MM.DD` | 캠페인 시작일 |

### 4-3. 네이밍 파서 Python 코드

```python
import re

def parse_ad_name(ad_name: str) -> dict:
    """소재명에서 구조화된 메타데이터 추출."""
    result = {
        "raw": ad_name,
        "os": None, "format": None, "targeting": None,
        "concept": None, "hook": None, "version": None,
        "manager": None, "date": None,
    }

    parts = ad_name.split("_")
    if not parts:
        return result

    # OS
    if parts[0].lower() in ("aos", "android"):
        result["os"] = "AOS"
    elif parts[0].lower() in ("ios", "iphone"):
        result["os"] = "iOS"

    # Format
    for p in parts:
        if p.lower() == "vd":
            result["format"] = "Video"
            break
        elif p.lower() == "im":
            result["format"] = "Image"
            break

    # Targeting
    for p in parts:
        if p.lower() == "all":
            result["targeting"] = "논타겟"
            break
        elif p.lower() == "re":
            result["targeting"] = "리타겟"
            break
        elif re.match(r"lookalike\(\d+%\)", p.lower()):
            result["targeting"] = f"유사타겟({p})"
            break

    # Manager code (예: hn1, cr1, mk1)
    for p in parts:
        if re.match(r"^(hn|cr|mk|nk|sj|dh)\d+$", p.lower()):
            result["manager"] = p.lower()
            break

    # Date (YY.MM.DD 형식)
    for p in parts:
        if re.match(r"^\d{2}\.\d{2}\.\d{2}$", p):
            result["date"] = p
            break

    # Concept(Hook) 추출
    concept_match = re.search(r"_([^_]+\([^)]+\)\d*)_", ad_name)
    if concept_match:
        raw = concept_match.group(1)
        hook_match = re.search(r"\(([^)]+)\)", raw)
        if hook_match:
            result["hook"] = hook_match.group(1)
            result["concept"] = raw[:raw.index("(")]
        else:
            result["concept"] = raw

    return result


def parse_campaign_name(campaign_name: str) -> dict:
    """캠페인명에서 구조화된 메타데이터 추출."""
    result = {
        "raw": campaign_name,
        "os": None, "web2app": False,
        "targeting_type": None, "objective": None, "date": None,
    }

    parts = campaign_name.split("_")
    if not parts:
        return result

    # OS + Web2App
    os_part = parts[0].upper()
    if "WEB2APP" in os_part:
        result["web2app"] = True
    result["os"] = "iOS" if "IOS" in os_part else "AOS" if "AOS" in os_part else os_part

    # Targeting type
    for p in parts:
        if "논타겟" in p:
            result["targeting_type"] = "논타겟"
        elif "리타겟" in p:
            result["targeting_type"] = "리타겟"
        elif "유사타겟" in p:
            result["targeting_type"] = "유사타겟"

    # Objective
    for p in parts:
        if "앱홍보" in p:
            result["objective"] = "앱홍보"
        elif "판매" in p:
            result["objective"] = "판매"
        elif "회원가입" in p:
            result["objective"] = "회원가입"
        elif "리드" in p:
            result["objective"] = "리드"
        elif "구매" in p and result["objective"] is None:
            result["objective"] = "구매"

    # Date
    for p in parts:
        if re.match(r"^\d{2}\.\d{2}\.\d{2}$", p):
            result["date"] = p

    return result
```

---

## 5. 통합 분석 쿼리 템플릿

### 5-1. 캠페인 단위 통합 성과 (매체비용 + Airbridge 유저 귀속)

```sql
-- 목적: 캠페인별 매체 성과 + 유저 귀속 + 실주문 전환을 한 뷰로 통합
WITH
-- 매체 집계 (Facebook만 필터)
media AS (
  SELECT
    campaign,
    SUM(cost)           AS total_cost,
    SUM(impressions)    AS total_impressions,
    SUM(clicks)         AS total_clicks,
    SUM(app_installs)   AS total_installs
  FROM `covering-app-ccd23.ads_data.daily_cost_creative`
  WHERE channel = 'facebook'
    AND date BETWEEN '2026-04-01' AND '2026-04-29'
  GROUP BY campaign
),
-- Airbridge 유저 귀속 (캠페인 레벨)
airbridge AS (
  SELECT
    ad_campaign,
    COUNT(DISTINCT user_id) AS attributed_users
  FROM `covering-app-ccd23.ads_data.user_acquisition_channel`
  WHERE ad_channel = 'facebook.business'
    AND signup_date BETWEEN '2026-04-01' AND '2026-04-29'
  GROUP BY ad_campaign
),
-- 실주문 전환 (Airbridge 귀속 유저 기준)
orders AS (
  SELECT
    u.ad_campaign,
    COUNT(DISTINCT o.user_id)  AS converted_users,
    COUNT(DISTINCT o.id)       AS total_orders
  FROM `covering-app-ccd23.ads_data.user_acquisition_channel` u
  JOIN `covering-app-ccd23.secure_dataset.order_v2` o
    ON u.user_id = o.user_id
    AND DATE(o.created_at) BETWEEN '2026-04-01' AND '2026-04-29'
    AND o.deleted_at IS NULL
  WHERE u.ad_channel = 'facebook.business'
    AND u.signup_date BETWEEN '2026-04-01' AND '2026-04-29'
  GROUP BY u.ad_campaign
)
SELECT
  m.campaign,
  m.total_cost,
  m.total_impressions,
  m.total_clicks,
  ROUND(m.total_clicks / NULLIF(m.total_impressions, 0) * 100, 2)    AS ctr_pct,
  m.total_installs,
  ROUND(m.total_cost / NULLIF(m.total_installs, 0), 0)               AS cpi,
  a.attributed_users,
  o.converted_users,
  o.total_orders,
  ROUND(o.converted_users / NULLIF(a.attributed_users, 0) * 100, 1)  AS order_cvr_pct,
  ROUND(m.total_cost / NULLIF(o.total_orders, 0), 0)                 AS cpo   -- 주문당 비용
FROM media m
LEFT JOIN airbridge a ON m.campaign = a.ad_campaign
LEFT JOIN orders   o ON m.campaign = o.ad_campaign
ORDER BY m.total_cost DESC
```

### 5-2. 소재 단위 통합 성과 (daily_cost_creative 기준)

```sql
-- 목적: 소재별 매체 성과 조회 (유저 귀속은 불가 — 캠페인 레벨까지만 가능)
SELECT
  channel,
  campaign,
  ad_group,
  ad_creative,
  SUM(cost)           AS total_cost,
  SUM(impressions)    AS total_impressions,
  SUM(clicks)         AS total_clicks,
  SUM(app_installs)   AS total_installs,
  ROUND(SUM(clicks) / NULLIF(SUM(impressions), 0) * 100, 2)          AS ctr_pct,
  ROUND(SUM(cost) / NULLIF(SUM(clicks), 0), 0)                       AS cpc,
  ROUND(SUM(cost) / NULLIF(SUM(app_installs), 0), 0)                 AS cpi,
  ROUND(SUM(cost) / NULLIF(SUM(app_installs), 0), 0)                 AS cpi
FROM `covering-app-ccd23.ads_data.daily_cost_creative`
WHERE channel = 'facebook'
  AND date BETWEEN '2026-04-01' AND '2026-04-29'
GROUP BY channel, campaign, ad_group, ad_creative
ORDER BY total_cost DESC
LIMIT 100
```

### 5-3. Airbridge 귀속 유저의 구독 전환 분석

```sql
-- 목적: 매체 유입 유저가 구독까지 전환하는 비율
WITH ab_users AS (
  SELECT
    user_id,
    ad_channel,
    ad_campaign,
    signup_date
  FROM `covering-app-ccd23.ads_data.user_acquisition_channel`
  WHERE ad_channel = 'facebook.business'
    AND signup_date BETWEEN '2026-04-01' AND '2026-04-29'
)
SELECT
  u.ad_campaign,
  COUNT(DISTINCT u.user_id)                                           AS total_users,
  COUNT(DISTINCT o.user_id)                                          AS ordered_users,
  COUNT(DISTINCT s.user_id)                                          AS subscribed_users,
  ROUND(COUNT(DISTINCT o.user_id) / NULLIF(COUNT(DISTINCT u.user_id), 0) * 100, 1) AS order_cvr_pct,
  ROUND(COUNT(DISTINCT s.user_id) / NULLIF(COUNT(DISTINCT u.user_id), 0) * 100, 1) AS sub_cvr_pct
FROM ab_users u
LEFT JOIN `covering-app-ccd23.secure_dataset.order_v2` o
  ON u.user_id = o.user_id AND o.deleted_at IS NULL
LEFT JOIN `covering-app-ccd23.secure_dataset.subscription` s
  ON u.user_id = s.user_id AND s.status = 'ACTIVE'
GROUP BY u.ad_campaign
ORDER BY total_users DESC
```

---

## 6. 자동화 워크플로우

### 정기 리포트 생성 순서

```bash
# 1. Facebook Ads API → CSV + MD (소재 레벨 매체 성과)
python facebook_ads_report_v2.py

# 2. BQ → 캠페인×소재 통합 성과 추출
python analyze_campaigns.py  # 또는 BQ 쿼리 직접 실행

# 3. 두 파일 병합 분석 (선택)
# datas/YYYYMMDD_facebook_ads_ad_level.csv  (Facebook API, 소재 단위)
# BQ daily_cost_creative 결과               (날짜별 소재 단위, ROAS 포함)
# BQ user_acquisition_channel 집계 결과     (캠페인 단위 유저 귀속)
```

### 파일 네이밍 규칙 (datas/ 저장)

| 파일 | 내용 | 주기 |
|------|------|------|
| `YYYYMMDD_HHMMSS_facebook_ads_report.md` | 캠페인별 계층 Markdown 리포트 | 필요 시 |
| `YYYYMMDD_HHMMSS_facebook_ads_ad_level.csv` | 소재 레벨 raw (521행+) | 필요 시 |
| `YYYYMMDD_HHMMSS_통합_매체성과.csv` | BQ + API 병합 결과 | 주간 |

### 분석 레벨별 사용 소스 가이드

| 분석 질문 | 사용 소스 | 비고 |
|-----------|-----------|------|
| "이 소재의 CTR/CPI는?" | Facebook API CSV 또는 `daily_cost_creative` | 동일 값 |
| "이 캠페인에서 몇 명이 가입했나?" | `user_acquisition_channel` | 캠페인 레벨 |
| "이 소재에서 몇 명이 가입했나?" | Airbridge MMP 엑셀 `Ad` 컬럼 | 수동 다운로드 필요 |
| "가입 유저가 실제로 주문했나?" | `user_acquisition_channel` JOIN `order_v2` | 캠페인 단위 |
| "캠페인별 구독 전환율은?" | `user_acquisition_channel` JOIN `subscription` | 캠페인 단위 |
| "소재별 ROAS는?" | `daily_cost_creative.roas` | BQ 전용 |

---

*작성자: Claude (커버링 데이터팀 보조)*  
*기준: Facebook Graph API v19.0, BigQuery `covering-app-ccd23.ads_data.*`*
