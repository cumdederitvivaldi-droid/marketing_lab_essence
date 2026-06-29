# 커버링 VOC 리포트 배치 커버링랩스 편입

> 유형: 플랜
> 작성일: 2026-05-03
> 상태: 완료

## 목표

커버링 VOC 리포트를 별도 `voc-monitor` 저장소 운영이 아니라 `covering-labs` private batch 앱으로 편입한다.

## 현황

- 기존 `voc-monitor`는 Slack `#10_고객피드백` 수집, Gemini 분류, 일일 브리프, 주간 리포트 구조가 이미 있다.
- 커버링랩스의 정식 배치 앱은 `apps/private/` 하위에 두고 `deploy.yml`로 crontab 배포한다.
- VOC 리포트는 내부 고객 피드백과 Slack 원문 링크를 다루므로 public 앱이 아니라 private batch가 맞다.

## 구현 계획

- `apps/private/voc-monitor`를 새 batch 앱으로 추가한다.
- 기존 Python 파이프라인을 옮기되, 민감값은 `/shared/.env`에서 읽게 한다.
- 매일 09:30 KST 실행하고, 월요일에는 주간 VOC 리포트를 추가 실행한다.
- 로그는 `logs/batch.log`, SQLite는 `data/voc.db`에 둔다.

## 완료 기준

- `python3 -m py_compile`이 통과한다.
- 로컬 `check` 모드가 DB와 로그 경로를 생성하고 네트워크 호출 없이 끝난다.
- 브랜치와 PR이 생성되어 `covering-labs` 자동 배포 경로에 올라간다.
- 배포 후 GitHub Actions와 crontab 등록 상태를 확인한다.

## 변경 파일

- `apps/private/voc-monitor/deploy.yml`: private batch 배포 정의 추가
- `apps/private/voc-monitor/README.md`: 실행 목적, 환경변수, 수동 실행 기준 추가
- `apps/private/voc-monitor/src/*`: 기존 VOC 파이프라인 편입
- `apps/private/voc-monitor/src/config.py`: `/shared/.env` 로드, 앱 내부 DB/로그 경로 적용
- `apps/private/voc-monitor/src/main.py`: `scheduled`, `check` 모드 추가
- `apps/private/voc-monitor/src/weekly_cluster.py`: 예외 로깅 누락 수정

## 검증

- `python3 -m py_compile apps/private/voc-monitor/src/*.py` 통과
- `python3 apps/private/voc-monitor/src/main.py check` 통과
- 민감값 패턴 검색에서 하드코딩된 Slack/Gemini/API 토큰 없음

## 남은 배포 확인

- PR 머지 후 GitHub Actions `Deploy Apps` 성공 확인
- private VM의 crontab에 `voc-monitor`가 매일 09:30 KST로 등록됐는지 확인
- 첫 실행 후 `logs/batch.log`에서 시작/완료 로그 확인
