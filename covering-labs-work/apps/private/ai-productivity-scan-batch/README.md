# ai-productivity-scan-batch

`AI생산성` Slack 채널을 읽어서 바로 적용하지 않고, `wjh 승인 대기` 상태의 후보 목록만 쌓는 일일 배치입니다.

## 하는 일

- `AI생산성` 채널 새 메시지와 스레드 답글을 읽습니다.
- 자동화, 훅, 스킬, 대시보드, Figma, 품질게이트 같은 운영 후보만 추립니다.
- 공식 모델/툴 changelog를 함께 읽어 새 업데이트를 승인 대기 후보로 올립니다.
- 결과를 `approval_required=true`, `approval_owner=wjh`, `approval_status=pending` 상태로 저장합니다.
- 각 후보에 `quality score`, `keep/review/discard` 추천, gate 판단을 붙입니다.
- 사람이 읽기 쉬운 요약 파일과 기계가 읽기 쉬운 JSON 파일을 함께 만듭니다.

## 결과 파일

- `data/latest-report.md`: 최근 스캔 요약
- `data/experiment-registry.json`: 승인 대기 레지스트리
- `data/experiment-registry.md`: 사람이 읽는 레지스트리
- `data/latest-scan.json`: 최근 스캔 원본 요약
- `data/news-monitor.json`: 공식 뉴스 소스 상태와 최신 항목
- `data/news-monitor.md`: 사람이 읽는 뉴스 모니터 요약
- `data/quality-scorecard.json`: quality score와 gate 요약
- `data/quality-scorecard.md`: 사람이 읽는 quality scorecard
- `data/pd-bigquery-snapshot.md`: problem discovery용 운영 숫자 snapshot
- `data/pd-grafana-snapshot.md`: problem discovery용 경보형 snapshot
- `data/pd-web-signal-snapshot.md`: problem discovery용 모델/툴 웹 신호 snapshot
- `data/scan-state.json`: 마지막으로 읽은 시점

## 환경 변수

- `SLACK_BOT_TOKEN`: Slack 봇 토큰
- `AI_PRODUCTIVITY_CHANNEL_ID`: 기본 `C0AD9A131JR`
- `AI_PRODUCTIVITY_CHANNEL_NAME`: 기본 `#pj_ai로생산성높이기`
- `AI_PRODUCTIVITY_APPROVER`: 기본 `wjh`

## 수동 실행

```bash
python3 src/main.py --full --days-back 3
python3 src/main.py
python3 src/main.py --skip-news
python3 src/main.py --full --days-back 1 --enforce-score-gate
```

## 운영 원칙

- 이 배치는 아이디어를 자동 적용하지 않습니다.
- 모든 후보는 `wjh` 승인 전까지 `pending`으로만 남습니다.
- 기본 실행은 추천과 기록만 하고, `--enforce-score-gate`일 때만 block 후보가 있으면 non-zero 종료합니다.
- 로컬 세션 시작 훅이 아니라 `covering-labs` 배치가 정식 운영 경로입니다.
- Slack 토큰이 없어도 공식 뉴스 모니터링은 독립적으로 실행됩니다.
