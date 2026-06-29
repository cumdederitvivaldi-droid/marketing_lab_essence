# ENG-1559 서버 모니터 이관 플랜

> 유형: PRD | 플랜
> 작성일: 2026-04-23
> 상태: 검토중

## 목표

- ENG-1559 슬랙 모니터를 로컬 맥북이 아니라 `covering-labs private VM`에서 안정적으로 발송한다.
- 실험 실제 배치 런타임과 모니터 런타임을 분리해, `발송은 되고 있는데 보고만 안 오는` 상태를 줄인다.

## 왜 지금

- `04/22 09:00`, `18:00` 두 번 모두 로컬 monitor가 `slack.com` DNS/네트워크 오류로 실패했고, 실험은 계속 집행 중인데 보고만 끊겼다.
- 실제 D7 배치는 이미 `covering-labs` 서버에서 돌아가고 있어, 모니터만 로컬 맥북에 남겨둘 이유가 사라졌다.

## 현황 분석

- 실제 D7 발송 배치는 이미 서버 `apps/private/flarelane-d7-retention` 경로에서 돌고 있다.
- 서버 배치 자산 소유자는 `sa_109369409955768144646` 이고, `04/22 09:06 KST` 까지 `batch.log` 가 누적됐다.
- `04/22` 서버 `batch.log` 기준 `479명 배정 / 369건 발송 / 실패 0`까지 확인됐다.
- 반면 슬랙 모니터는 서버 앱이 없고, 로컬 맥북 `crontab`에만 남아 있다.
- 로컬 monitor는 `04/22 09:00`, `18:00` 두 번 모두 `slack.com` DNS/네트워크 오류로 실패했다.
- 로컬 launchd batch는 별도 실패(`gcloud not found`) 상태였고, 이번 요청으로 제거 대상이다.

## 고객 근거

- 운영자는 `실험이 죽었는지`, `친구톡 live만 안 보이는지`, `BQ 기준 코호트/쿠폰/재주문은 어떻게 움직이는지`를 같은 메시지에서 봐야 한다.
- 이번 miss로 `실험 중단`과 `모니터 중단`이 분리되지 않아 운영 판단이 흔들렸다.

## 버린 대안

- 로컬 crontab 유지:
  - 같은 네트워크/DNS 문제를 다시 밟을 수 있어 버렸다.
- 기존 `flarelane-d7-retention` 배치 안에 monitor를 합치기:
  - 실험 집행과 보고 실패를 한 프로세스에 묶으면 장애 원인 분리가 어려워져 버렸다.
- 별도 server monitor batch 앱 추가:
  - 집행과 보고를 분리하면서도 같은 VM 배포 체계에 태울 수 있어 채택했다.

## 운영 기준

- owner: `wjh`
- due: `04/23`
- readout date: `04/23`
- kill criteria:
  - 서버 monitor가 첫 scheduled run에서 실패하거나,
  - Slack 본문에서 BQ 그래프가 비정상 공백으로 나오면 머지 후 운영 전환을 보류한다.
- AI 활용 계획:
  - BQ/로그 근거 수집, 서버 런타임 식별, monitor 본문 초안, PR 문서화를 AI로 처리하고 최종 운영 판단은 사람이 한다.

## 이번 작업 계약

- 이번에 끝낼 범위:
  - 로컬 `ENG-1559` launchd batch 제거
  - `covering-labs`에 `ENG-1559` monitor 전용 private batch 앱 추가
  - `09:00 / 18:00 KST` 정기 슬랙 발송 기준 반영
  - BigQuery 기준 배정 / 쿠폰 / 재주문 그래프 메시지 생성
  - 필요 시 FlareLane live readback은 optional bearer 기준으로만 시도하고, 없어도 BQ 모니터는 반드시 발송
  - branch push + PR 생성
- 이번에 하지 않을 범위:
  - 기존 `flarelane-d7-retention` 배치 구조 재작성
  - FlareLane 로그인 세션 자동 복구
  - 실험 카피, 쿠폰 정책, 여정 구조 수정
- 완료 기준:
  - 로컬 launchd batch가 제거되어 더 이상 local 경로에 기대지 않는다.
  - 서버 배포 가능한 monitor 앱이 새 PR로 올라간다.
  - dry-run으로 슬랙 본문이 읽히고, 운영자가 `친구톡 live 미조회` 여부와 BQ 그래프를 한 번에 볼 수 있다.
- 실제 확인 방법:
  - local launchd 제거 확인
  - `python3 -m py_compile`
  - `python3 src/main.py --dry-run`
  - GitHub PR 생성
- 주요 리스크:
  - 서버에는 브라우저 세션이 없어서 FlareLane live readback은 env bearer 없이는 비활성 상태로 남는다.
  - `covering-labs main`은 `apps/private|public` 구조라, 기존 local `apps/eng1559` 자산을 그대로 올리면 안 된다.

## 구현 계획

### 단계별 작업

1. local batch 제거와 실제 서버 런타임 근거를 문서화한다.
2. `apps/private/flarelane-d7-retention-monitor/` 신규 batch 앱을 만든다.
3. BigQuery 집계 + Slack 발송 + retry 로직을 넣는다.
4. dry-run으로 메시지 형태를 검증한다.
5. branch push 후 PR을 연다.

## 변경 파일

- `apps/private/flarelane-d7-retention-monitor/src/main.py`
  - BQ 집계, optional FlareLane live readback, Slack retry 발송을 구현했다.
- `apps/private/flarelane-d7-retention-monitor/deploy.yml`
  - 매일 `09:00`, `18:00 KST` server batch 스케줄을 선언했다.
- `apps/private/flarelane-d7-retention-monitor/README.md`
  - 운영 목적, env, dry-run 사용법을 정리했다.
- `apps/private/flarelane-d7-retention-monitor/requirements.txt`
  - Slack/FlareLane HTTP 호출용 `requests` 의존성을 명시했다.

## 구현 결과

- 로컬 launchd `com.covering.eng1559.reminder-batch` 는 제거했고 더 이상 local batch 런타임에 기대지 않는다.
- 실제 실험 배치는 `covering-labs` VM `/shared/apps/flarelane-d7-retention` 에서 계속 돌고 있음을 재확인했다.
- 서버 monitor 앱은 FlareLane live bearer가 없어도 BQ 그래프를 항상 보내는 구조로 분리했다.
- PR: `https://github.com/covering-app/covering-labs/pull/108`

## 단계 완료

- [x] local batch 제거와 실제 서버 런타임 근거 문서화
- [x] `apps/private/flarelane-d7-retention-monitor/` 신규 batch 앱 생성
- [x] BigQuery 집계 + Slack retry 로직 구현
- [x] dry-run 본문 검증
- [x] branch push + PR 생성

## 검증 결과

- `python3 -m py_compile apps/private/flarelane-d7-retention-monitor/src/main.py`
  - 성공
- `python3 apps/private/flarelane-d7-retention-monitor/src/main.py --dry-run`
  - 성공
  - `04/23 00:31 KST` 기준 본문 생성 확인
  - 배정 누적 `3889명`
  - `04/22` 신규 코호트 `479명`
  - 쿠폰 누적 `B 49 / C 36`
  - FlareLane live bearer 미설정 시 `[주의] FlareLane live 미조회` 문구 노출 확인
- PR 생성
  - `feat: add ENG-1559 server monitor batch`
  - `https://github.com/covering-app/covering-labs/pull/108`

## 후속 수정 메모

- merge/deploy 후 서버 직접 dry-run을 해보니 `beige_covering_app` 계정에서 Python `Path.read_text('/shared/.env')` 가 `PermissionError` 로 실패했다.
- 같은 환경에서 bash `source /shared/.env` 는 성공하므로, monitor 앱은 Python direct read 실패 시 bash source fallback으로 env를 로드하도록 후속 수정했다.

## 완료 기준

- 실험 실제 배치 위치와 모니터 위치가 분리되어 설명 가능하다.
- 새 monitor 앱이 `covering-labs main` 배포 체계에 맞게 생성된다.
- PR 링크만 보면 다음 사람이 바로 머지/배포 판단을 할 수 있다.
