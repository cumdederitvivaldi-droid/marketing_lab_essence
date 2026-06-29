# 150L 대형 봉투 배송 접수 자동화 배치 플랜

> 유형: PRD
> 작성일: 2026-04-15
> 상태: 완료

## 목표

기존 Apps Script(Code.js)로 운영 중인 150L 봉투 배송 배치를 Python 배치로 전환하여 covering-labs에서 관리한다.

## 현황 분석

- 기존: Google Sheets 바인딩 Apps Script (Code.js 1700줄 단일 파일)
- 문제:
  - 토큰/봇키 하드코딩
  - 단일 파일에 모든 로직 혼재 (시트 I/O, API, 슬랙, 모니터링)
  - 코드 리뷰/버전관리 불가
  - 유지보수 어려움

## 구현 계획

### 앱 구조

- 위치: `apps/large-bag-delivery-batch/`
- 언어: Python 3.12+
- 의존성: gspread, google-auth, requests, openpyxl, python-dotenv

### 모듈 분리 (10개 파일)

| 파일 | 역할 |
|---|---|
| main.py | 진입점 — CLI 모드 분기 |
| config.py | 환경변수 + 상수 |
| phone_utils.py | 전화번호 정규화/검증 |
| delivery_planner.py | 후보 선정 (중복/형식 판정) |
| dubalhero_api.py | 두발히어로 API 호출 |
| google_sheets.py | 시트 읽기/쓰기 |
| delivery_monitor.py | 모니터 시트 기록 |
| slack_notifier.py | 슬랙 알림 + 파일 업로드 |
| schedule_watchdog.py | 자동 실행 감시 |
| excel_export.py | xlsx 생성 |

### 보안

- 모든 토큰/키 → `~/.large-bag-delivery-batch.env`로 분리
- 코드에 실제 값 하드코딩 없음

### cron 스케줄

- 10:30, 15:30 — 배송 접수
- 11:05, 16:05 — 감시

### 단계별 작업

- [x] Python 모듈 구현 (10개 파일)
- [x] 비즈니스 로직 검증 (단위 테스트)
- [x] 코드 주석 추가
- [x] 미사용 코드 정리
- [x] 보안 값 환경변수 분리
- [x] README 작성
- [x] works PRD 작성
- [ ] PR 생성 + 코드 리뷰
- [ ] 서버 .env 세팅
- [ ] Apps Script 트리거 비활성화
- [ ] Python 배치 배포 + 검증

### 변경 파일 목록

- `apps/large-bag-delivery-batch/` (신규 — 전체)
- `works/plan/2026-04-15-covering-labs-large-bag-delivery-batch.md` (신규)

## 완료 기준

- dry-run 모드에서 기존 Apps Script와 동일한 후보 선정 결과
- 테스트 시트에서 실제 접수 → H/I/J열 정상 기록
- 슬랙 알림 + 배송불가 xlsx 채널 업로드 정상 동작
- 감시 모드에서 미실행 감지 → 슬랙 경보 정상 발송
