# Airbridge 광고비 소재 단위 배치 이관 플랜

> 유형: PRD | 플랜
> 작성일: 2026-04-23
> 상태: 완료

## 목표

Google Apps Script에 있던 Airbridge 광고비 적재를 covering-labs batch로 이관한다. 광고비는 소재 단위로 `ads_data.daily_cost_creative`에 들어와야 하고, 소재 단위 CAC뿐 아니라 AARPU/ROI까지 볼 수 있도록 `user_acquisition_channel`도 `ad_group`, `ad_creative`를 포함한다.

## 현황 분석

- Airbridge 원본 API는 04/22 기준 `facebook.business` 소재 데이터를 정상 반환한다.
- BigQuery는 03/24 이후 한동안 `ad_group`, `ad_creative`가 비어 들어왔다.
- 현재 일부 날짜는 임시 복구됐지만, 실행 주체를 covering-labs로 통일해야 한다.
- `ads_data`는 covering-labs 서비스 계정이 READER라서 배포 후 쓰기 권한을 표 단위로 보강해야 한다.

## 구현 계획

### 단계별 작업

- [x] `apps/private/airbridge-ads-cost-sync` batch 앱 추가
- [x] Airbridge Actuals API 수집 로직 구현
- [x] 유료 채널 실패 시 날짜 단위 덮어쓰기 중단
- [x] BigQuery 날짜 단위 트랜잭션 교체 구현
- [x] BigQuery streaming buffer 재시도 처리
- [x] `user_acquisition_channel` 소재 컬럼 확장/갱신 명령 구현
- [x] 실제 1일 sync 검증
- [x] 03/24~04/22 백필 검증
- [x] GitHub Actions 배포 시 Airbridge token을 앱 로컬 `.env`로 주입하도록 구성
- [x] GitHub Actions `AIRBRIDGE_TOKEN` secret 등록
- [x] covering-labs VM 홈 경로 배포 및 crontab 등록
- [ ] Apps Script creative trigger 중단

## 검증 결과

- 03/24 실제 sync: 203행 적재, `creative_rows=186`
- 03/24~04/22 전체 검증: 30일 모두 `creative_rows > 0`, `zero_creative_days=0`, 총 광고비 407,305,791원
- `user_acquisition_channel`: 43,245명 매핑, `ad_group_rows=31,888`, `creative_rows=14,823`
- 04/16~04/22 기준 Meta는 `creative_rows=1,032/1,032`, TikTok은 `177/222`, Google Ads는 원본상 creative가 비고 `ad_group` 중심으로 채워짐
- covering-labs VM `/home/beige_covering_app/airbridge-ads-cost-sync`에서 Airbridge API dry-run 성공: 04/22 기준 191행, paid 181행, other 10행
- 같은 VM 실행 경로에서 03/24 실제 BigQuery replace 성공: 203행 적재, `facebook.business=176`, `google.adwords=11`, `apple.searchads=4`, `tiktok=7`, `instagram=1`
- 같은 VM 실행 경로에서 03/24~04/22 coverage 재확인: 30일 모두 소재 행 존재, 04/22 `creative_rows=154`

## 배포 상태

- covering-labs 서비스 계정에 `ads_data.daily_cost_creative`, `ads_data.user_acquisition_channel` 표 단위 쓰기 권한 부여 완료
- GitHub PR: https://github.com/covering-app/covering-labs/pull/124
- 표준 `/shared/apps` 배포는 현재 SSH 사용자 권한이 `covering-dev` 그룹에 없어 직접 반영하지 못했다.
- 임시 운영 경로로 같은 covering-labs VM의 `/home/beige_covering_app/airbridge-ads-cost-sync`에 앱을 배포하고 `.venv`, 앱 로컬 `.env`, crontab을 구성했다.
- crontab 등록: `45 9 * * * cd /home/beige_covering_app/airbridge-ads-cost-sync && BQ_STREAMING_BUFFER_RETRIES=24 /home/beige_covering_app/airbridge-ads-cost-sync/.venv/bin/python src/main.py sync --date yesterday >> logs/batch.log 2>&1 # deploy:airbridge-ads-cost-sync`
- GitHub Actions `AIRBRIDGE_TOKEN` secret은 등록했지만, workflow 파일 수정은 현재 OAuth token에 `workflow` scope가 없어 PR에 포함하지 않았다.
- Apps Script creative trigger는 코드 수정 없이 CLI/API로 삭제할 수 있는 기존 엔드포인트가 없어 아직 중단하지 못했다. 이 중복 기간에는 09:30 Apps Script insertAll 직후 streaming buffer가 남아도 Labs 배치가 최대 2시간 재시도 후 최종 overwrite하도록 둔다.

## 완료 기준

- 04/22 기준 소재 행이 150행 이상 적재된다.
- 03/24~04/22 각 날짜의 `creative_rows`가 0이 아니다.
- `user_acquisition_channel`에 `ad_group`, `ad_creative`가 포함된다.
- covering-labs crontab에 `airbridge-ads-cost-sync`가 등록된다.
