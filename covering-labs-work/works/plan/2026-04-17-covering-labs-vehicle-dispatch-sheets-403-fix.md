# 04/17 차량등록 배치 시트 403 복구

> 유형: 플랜
> 작성일: 2026-04-17
> 상태: 완료

## 이번 작업 계약
- 이번에 끝낼 범위:
  - Google Sheets 인증 경로를 운영 현실에 맞게 보강한다.
  - Step 1 실패가 `0건 완료`처럼 숨지지 않게 수정한다.
  - 오늘 21시 배치 전에 실제 운영 권한 문제를 복구하고 검증한다.
  - 변경 내용을 PR로 올린다.
- 이번에 하지 않을 범위:
  - 차량등록 배치 전체 구조 재설계
  - 배차/발송 로직 변경
  - 다른 앱 환경변수 체계 전면 정리
- Done 판단:
  - 운영 시트에 대한 인증 실패 원인이 설명 가능하고
  - VM 기본 런타임 기준 시트 읽기가 다시 성공하며
  - 코드가 인증 경로/실패 표시에 대해 더 안전해지고
  - 테스트와 PR 근거가 남으면 완료다.
- 실제 확인 방법:
  - 로컬 테스트
  - VM metadata 토큰 기준 시트 읽기 검증
  - PR 생성 확인
- 주요 리스크:
  - 운영 시트 권한이 코드 밖 문제면 PR만으로는 즉시 복구되지 않을 수 있다.
  - Step 1 실패 처리 강화가 기존 요약 알림 흐름과 충돌할 수 있다.

## 조사 메모
- 04/17 오전 점검 로그에서 `vehicle-dispatch-monitor`가 두 번 모두 `Step 1`에서 `Google Sheets 403 PERMISSION_DENIED`로 막혔다.
- 같은 로그에서 백오피스 로그인과 다른 기본 환경값은 정상이라, 장애는 시트 인증 경로에 국한됐다.
- 실제 VM 실행 주체는 `beige_covering_app`가 아니라 SA 런타임이었다. 로그 파일 소유자와 앱 파일 소유자가 `sa_113995973298337322457`였다.
- `/home/beige_covering_app/.config/gcloud/sheets-service-account.json` 파일은 존재했지만 권한이 `600`이라 SA 런타임은 읽을 수 없었다.
- `/shared/.env`는 `1916B`였고, `google-sheets@covering-app-ccd23.iam.gserviceaccount.com` 키 JSON 전체(`2328B+`)를 담을 수 없는 크기라 `GOOGLE_SERVICE_ACCOUNT_JSON` 운영 사용 가능성은 사실상 배제됐다.
- 실제 원인은 코드 미지원 하나만이 아니라, 운영 시트 공유 대상에 VM 기본 SA `covering-labs@covering-app-ccd23.iam.gserviceaccount.com`가 빠져 있던 것이었다.
- Drive API로 권한 목록을 확인한 결과 운영 시트에는 `google-sheets@covering-app-ccd23.iam.gserviceaccount.com`만 writer로 있고 `covering-labs@covering-app-ccd23.iam.gserviceaccount.com`는 없었다.

## 구현 메모
- `config.py`
  - `/shared/.env`를 기본으로 읽되, 읽을 수 없으면 앱 로컬 `.env`까지 폴백하도록 정리했다.
  - `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_APPLICATION_CREDENTIALS`를 정식 입력값으로 추가했다.
  - `$HOME`, `~` 경로 확장과 공용 `get_google_service_account_credentials()` 헬퍼를 추가했다.
- `sheets.py`, `order_lookup.py`
  - 시트/BigQuery 모두 동일한 서비스 계정 우선순위(`JSON -> 파일 경로 -> ADC`)를 쓰도록 정리했다.
- `monitor.py`
  - 로그 디렉토리가 없어도 import 시점 테스트가 깨지지 않게 보강했다.
  - Step 1 실패 시 즉시 실패로 종료하고, 가짜 `0건 완료` 대신 실패 요약과 비정상 종료 코드를 남기게 바꿨다.
- 테스트
  - `$HOME` 경로 확장
  - `GOOGLE_SERVICE_ACCOUNT_JSON` 우선 사용
  - Step 1 실패 시 후속 단계 중단
  - 위 세 가지를 회귀 테스트로 추가했다.
- 운영 조치
  - Drive API로 운영 시트에 `covering-labs@covering-app-ccd23.iam.gserviceaccount.com` writer 권한을 추가했다.

## 검증
- 코드 검증
  - `python3 -m pytest apps/vehicle-dispatch-monitor/test_google_auth_and_blocking.py -q`
  - 결과: `3 passed`
- 회귀 검증
  - `python3 -m pytest apps/vehicle-dispatch-monitor/test_changes.py -q`
  - 결과: `77 passed`
- 문법 검증
  - `python3 -m py_compile apps/vehicle-dispatch-monitor/config.py apps/vehicle-dispatch-monitor/sheets.py apps/vehicle-dispatch-monitor/order_lookup.py apps/vehicle-dispatch-monitor/monitor.py apps/vehicle-dispatch-monitor/test_google_auth_and_blocking.py`
  - 결과: 성공
- 운영 권한 확인 1
  - `google-sheets@covering-app-ccd23.iam.gserviceaccount.com` 키로 Drive permissions 조회
  - 결과: 기존에는 `covering-labs@covering-app-ccd23.iam.gserviceaccount.com` 권한이 없었고, 추가 후 writer로 확인됐다.
- 운영 권한 확인 2
  - VM metadata token으로 `https://sheets.googleapis.com/v4/spreadsheets/.../values/'시트1'!A1:L2` 호출
  - 결과: 초기 전파 직후 403이었고, 수 초 후 재시도에서 `metadata_sheets_access=ok`로 성공했다.

## 독립 검토
- 계약 범위 일치: 예. 코드 보강, 실패 표시 개선, 운영 권한 복구, 검증 기록, PR 준비 범위를 모두 채웠다.
- 제외 범위 침범 여부: 예. 배차/발송 로직이나 다른 배치 구조는 건드리지 않았다.
- 검증 기록 충분성: 예. 테스트, 시트 권한 목록, VM metadata token 검증까지 남겼다.
- 다음 세션 복원 가능성: 예. 이 문서만 봐도 403의 원인과 코드 변경, 실서비스 조치 내역을 이어서 볼 수 있다.

## Done Gate
- 성공 기준:
  - 운영 시트에 대한 VM 기본 SA 접근이 복구된다.
  - Step 1 실패가 더 이상 `0건 완료`로 오인되지 않는다.
  - 시트/BigQuery 인증 경로가 JSON/파일/ADC 순으로 정리된다.
  - PR 링크가 남는다.
- 검증 결과:
  - VM metadata token 기준 시트 읽기 성공
  - 신규 테스트 `3 passed`
  - 기존 테스트 `77 passed`
  - PR `#32` 생성 완료: `fix: 차량등록 배치 시트 403 복구`
- 남은 리스크:
  - 실제 서버 배포 전까지는 원격 앱 코드가 아직 기존 버전이다. 다만 오늘 21시 운영 자체는 시트 권한 복구로 이미 정상 진입 가능 상태다.
  - `google-sheets` 전용 키 파일에 의존하는 수동 경로는 여전히 운영 계정/권한 상태에 따라 깨질 수 있다. 이번 PR은 그 경로를 완화하지만 키 자체 배포 문제를 완전히 제거하진 않는다.
- 다음 행동:
  - PR 리뷰/머지 후 서버 배포 반영 확인
