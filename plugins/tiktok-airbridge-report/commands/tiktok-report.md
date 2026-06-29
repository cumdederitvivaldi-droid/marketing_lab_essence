---
description: TikTok 광고 매체 + Airbridge MMP 데이터로 주간 효율 리포트 xlsx를 자동 생성
allowed-tools:
  - "Bash"
  - "PowerShell"
  - "Read"
  - "Write"
  - "Edit"
  - "Agent"
  - "AskUserQuestion"
  - "mcp__tiktok-ads__*"
  - "mcp__airbridge__*"
---

# TikTok 광고 효율 리포트 자동 생성

기간: $ARGUMENTS

## 사전 요구
- TikTok Ads MCP 등록 + OAuth 완료 (`https://tiktok-ads.mcp.pipeboard.co/`)
- Airbridge MCP 등록 + OAuth 완료 (`https://mcp.airbridge.io/mcp`)
- Python 3.10+ 설치 + `openpyxl` (`pip install openpyxl`)
- 다음 두 환경변수가 사용자 환경에 설정되어 있어야 함:
  - `TIKTOK_ADVERTISER_ID` (TikTok 광고주 ID, 예: `7424109851091140625`)
  - `AIRBRIDGE_APP_NAME` (Airbridge 앱 subdomain, 예: `coveringprod`)
- 선택: `TIKTOK_REPORT_DATA_DIR` (JSONL 저장 위치, 기본 `~/.tiktok-airbridge-report/data`)
- 선택: `TIKTOK_REPORT_OUT_DIR` (xlsx 출력 위치, 기본 `~/Downloads/{YYYY-MM(종료일 기준)}/tiktok-reports`)

환경변수 없으면 첫 단계에서 AskUserQuestion으로 받고, 사용자에게 PowerShell `[Environment]::SetEnvironmentVariable(...)`로 영구 등록 방법 안내.

## 플러그인 스크립트 경로 동적 발견
플러그인이 캐시 경로에 설치되므로 다음 PowerShell로 스크립트 위치 찾기:
```powershell
$PluginRoot = (Get-ChildItem "$env:USERPROFILE\.claude\plugins" -Recurse -Filter "build_template_xlsx.py" -ErrorAction SilentlyContinue | Select-Object -First 1).DirectoryName
```
이후 `python "$PluginRoot\build_template_xlsx.py" ...` 형태로 호출.

## 실행 단계

### 1. 기간 파싱
`$ARGUMENTS`가 `YYYY-MM-DD YYYY-MM-DD` 형식이면 START/END로 사용. 비어있거나 모호하면 AskUserQuestion. "지난주" 등 자연어는 오늘 기준 가장 최근 월~일로 변환.

### 2. 데이터 수집 (subagent로 위임 권장 — 병렬 가능)

데이터 디렉토리(`$TIKTOK_REPORT_DATA_DIR` 또는 기본값)에 다음 7개 JSONL 저장:

**A. TikTok ad-level insights → `_tiktok_data.jsonl`**
- `mcp__tiktok-ads__get_tiktok_insights` (advertiser_id=$TIKTOK_ADVERTISER_ID, data_level=AUCTION_AD, dimensions=["ad_id"], metrics=["spend","impressions","clicks","app_install","registration","total_registration","complete_payment","conversion"], page_size=200)
- 전 페이지(보통 4페이지) 모두 받고 `spend > 0 OR impressions > 0` 인 것만 보존
- `get_tiktok_ads(advertiser_id, filtering={"ad_ids":[...]})` 로 ad_id→campaign/adgroup/ad_name 매핑
- 정렬: spend desc
- 포맷: `{"ad_id","campaign_name","adgroup_name","ad_name","spend","impressions","clicks","app_install","registration","total_registration","complete_payment","conversion"}`

**B. TikTok adgroup/campaign 메타 + insights → 4개 jsonl**
- `_tiktok_campaigns_meta.jsonl` ← `get_tiktok_campaigns(page_size=1000)`: campaign_id, campaign_name, status, objective_type, budget_mode, budget
- `_tiktok_adgroups_meta.jsonl` ← `get_tiktok_adgroups(page_size=1000)`: adgroup_id, campaign_id, adgroup_name, status, budget_mode, budget, optimization_event
- `_tiktok_campaigns_insights.jsonl` ← `get_tiktok_insights(AUCTION_CAMPAIGN, dimensions=["campaign_id"])`
- `_tiktok_adgroups_insights.jsonl` ← `get_tiktok_insights(AUCTION_ADGROUP, dimensions=["adgroup_id"])`

**C. 친숙한 광고 이름 → `_ad_friendly_names.jsonl`**
- A 결과의 ad_id 목록을 `get_tiktok_ads`로 batch 조회 → ad_name/video_id 추출
- 의미없는 이름(`Ad name...`, `_001`, `Copy...`)이면 `<adgroup_name>_<ad_id 끝자리 4자>`로 대체
- 포맷: `{"ad_id","ad_name","friendly_name","video_id","video_name"}`

**D. Airbridge ad creative-level → `_airbridge_data.jsonl`**
- `mcp__airbridge__get_actuals_report` (app_name=$AIRBRIDGE_APP_NAME, from_date=START, to_date=END, group_bys=["channel","campaign","ad_group","ad_creative_id","ad_creative"], metrics=["app_installs","app_install_users","cost_channel","app_sign_up","app_order_complete_users"], filters=[{"filterType":"IN","dimension":"channel","values":["tiktok"]}], option={"eventTimestampSource":"touchpoint_date"}, size=1000)
- 포맷: `{"ad_creative_id","campaign","ad_group","ad_creative","cost","installs","install_users","signup","purchase"}`

### 3. 이전 주 진행액션 메모 추출 (선택)
이전 결과 xlsx가 있으면:
```powershell
python "$PluginRoot\extract_memos_from_template.py" --src <prev xlsx 경로>
```
없으면 생략 (메모 비어있는 상태로 생성됨).

### 4. 보정 계수 갱신 (선택)
원본 효율정리 xlsx가 손에 있으면:
```powershell
python "$PluginRoot\extract_correction.py" --src <원본 효율정리 xlsx>
```
없으면 생략 (이전 값 또는 기본값 1.0 사용).

### 5. xlsx 빌드
```powershell
python "$PluginRoot\build_template_xlsx.py" --start <START> --end <END>
```

### 6. 결과 안내
- 출력 경로 보고
- TikTok spend 합계 vs Airbridge cost 합계 일치 여부 검증
- 광고세트 N개 / 광고 N개 / 자동 채움된 메모 X개

## 보고 (200자 이내)
파일 경로 + 광고세트/광고 수 + 총 광고비 + 메모 적용 건수.
