# voc-monitor

커버링 Slack `#10_고객피드백` 채널을 수집해 VOC를 분류하고, PO가 바로 읽을 수 있는 일일 브리프와 주간 리포트를 보내는 private 배치 앱입니다.

## 하는 일

- Slack 고객 피드백 채널의 새 메시지를 수집합니다.
- Gemini로 카테고리, 심각도, 대표 문장을 구조화합니다.
- 매일 09:30 KST에 일일 VOC 브리프를 보냅니다.
- 월요일 09:30 KST에는 최근 7일 VOC를 카테고리별 문제 묶음으로 정제해 주간 리포트를 보냅니다.
- 각 문제에는 대표 원문 링크를 붙여 바로 고객 목소리로 돌아갈 수 있게 합니다.

## 실행 환경

- 배포 위치: `apps/private/voc-monitor`
- 실행 방식: covering-labs private VM crontab
- 실행 시간: 매일 09:30 KST
- 자동 실행 명령: `python3 src/main.py scheduled`
- 데이터 저장: `data/voc.db`
- 로그: `logs/batch.log`

## 환경변수

환경변수는 현재 셸, 앱 로컬 `.env`, covering-labs 서버의 `/shared/.env`에서 읽습니다. 값은 코드나 문서에 저장하지 않습니다.

- `SLACK_BOT_TOKEN`: 고객 피드백 채널 읽기와 리포트 발송에 필요합니다.
- `GEMINI_API_KEY`: VOC 분류와 주간 클러스터링에 필요합니다.
- `VOC_TARGET_CHANNEL`: 선택. 없으면 PO DM으로 보냅니다.

## 주요 파일

- `deploy.yml`: covering-labs private 배치 배포와 crontab 스케줄 정의
- `src/main.py`: `check`, `daily`, `weekly`, `scheduled` 실행 진입점
- `src/collector.py`: Slack 고객 피드백 메시지 수집
- `src/classifier.py`: Gemini 기반 VOC 구조화
- `src/clusterer.py`, `src/weekly_cluster.py`: 일일 테마 병합과 주간 문제 묶음 생성
- `src/notifier.py`, `src/weekly_notifier.py`: Slack 리포트 발송
- `data/voc.db`: SQLite 저장소
- `logs/batch.log`: 배치 실행 로그

## 의존 서비스

- Slack API: `SLACK_BOT_TOKEN`으로 `#10_고객피드백` 수집과 리포트 발송을 수행합니다.
- Gemini API: `GEMINI_API_KEY`로 분류, 임베딩, 주간 클러스터링을 수행합니다.
- covering-labs private VM: `/shared/.env`, 앱 디렉터리, crontab 실행 환경에 의존합니다.

## 수동 실행

```bash
python3 src/main.py check
python3 src/main.py daily
python3 src/main.py weekly
python3 src/main.py scheduled
```

## 운영 기준

- 운영 Slack 발송은 자동 스케줄 또는 명시적 수동 실행에서만 일어납니다.
- `scheduled`는 매일 일일 브리프를 실행하고, 월요일에만 주간 리포트를 추가 실행합니다.
- 배포 후 첫 확인은 GitHub Actions 배포 성공, crontab 등록, `logs/batch.log` 시작/완료 로그 순서로 봅니다.

## 주의사항

- `.env`, `data/voc.db`, `logs/batch.log`는 커밋하지 않습니다.
- `SLACK_BOT_TOKEN`과 `GEMINI_API_KEY`가 없으면 수집, 분류, 발송이 정상 동작하지 않습니다.
- `VOC_TARGET_CHANNEL`이 없으면 PO DM으로 폴백합니다.
- 스케줄은 `deploy.yml`의 `30 9 * * *` 한 곳에서 관리합니다.
