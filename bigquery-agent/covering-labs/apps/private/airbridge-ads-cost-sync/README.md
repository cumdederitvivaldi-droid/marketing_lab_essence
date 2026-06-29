# Airbridge 광고비 소재 단위 배치

Airbridge Actuals API에서 광고비를 가져와 `covering-app-ccd23.ads_data.daily_cost_creative`에 날짜별로 적재한다.

## 목적

Google Apps Script에 있던 Airbridge 광고비 적재를 covering-labs batch로 옮기고, 광고 소재 단위 CAC/AARPU/ROI 분석에 필요한 비용과 가입자 매핑 데이터를 유지한다.

## 실행 환경

- Python 3
- BigQuery Application Default Credentials 또는 VM 서비스 계정
- Airbridge Actuals API token

## 주요 파일

- `src/main.py`: CLI 진입점, Airbridge 수집, BigQuery 적재, 매핑 갱신 로직
- `deploy.yml`: covering-labs batch 스케줄과 실행 명령
- `requirements.txt`: Python 의존성
- `tests/test_main.py`: 파싱, 날짜, 재시도 판정 단위 테스트

## 실행 방법

```bash
python3 src/main.py sync --date yesterday --approve-bq-write
python3 src/main.py sync --date 2026-04-22 --dry-run
python3 src/main.py backfill --start 2026-03-24 --end 2026-04-22 --approve-bq-write
python3 src/main.py refresh-mapping
python3 src/main.py coverage --start 2026-03-24 --end 2026-04-22
```

## 환경변수

- `AIRBRIDGE_TOKEN`: Airbridge API Bearer token
- `AIRBRIDGE_APP`: 기본값 `coveringprod`
- `GCP_PROJECT`: 기본값 `covering-app-ccd23`
- `BQ_STREAMING_BUFFER_RETRIES`: 기본값 `12`
- `BQ_STREAMING_BUFFER_SLEEP_SECONDS`: 기본값 `300`
- `MIN_SIGNUP_DATE`: `refresh-mapping` 대상 가입일 하한, 기본값 `2026-02-10`

## 의존 서비스

- Airbridge Actuals API
- BigQuery `covering-app-ccd23.ads_data.daily_cost_creative`
- BigQuery `covering-app-ccd23.ads_data.user_acquisition_channel`
- BigQuery `covering-app-ccd23.airbridge_dataset.app_events`
- BigQuery `covering-app-ccd23.secure_dataset.user`

## 운영 기준

- 유료 채널 중 하나라도 수집 실패하면 해당 날짜는 BigQuery를 덮어쓰지 않는다.
- 비용 테이블을 쓰는 `sync`, `backfill`은 `--approve-bq-write`가 있어야 실행된다. `--dry-run`은 승인 플래그 없이 수집만 확인한다.
- Airbridge 대역폭 제한은 재시도한다.
- 비용 테이블은 날짜 단위로 교체한다.
- 기존 Apps Script처럼 streaming insert 직후 같은 날짜를 덮어쓰면 BigQuery가 삭제를 막을 수 있어, buffer가 비워질 때까지 재시도한다.
- `user_acquisition_channel`은 기존 캠페인 귀속에 `ad_group`, `ad_creative`를 추가해 소재 단위 AARPU/ROI 분석이 가능하게 한다.
