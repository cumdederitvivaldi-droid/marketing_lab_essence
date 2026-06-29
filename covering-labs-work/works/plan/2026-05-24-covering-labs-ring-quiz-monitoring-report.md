# 링퀴즈 일일 모니터링 리포트 배치 플랜

> 유형: 플랜
> 작성일: 2026-05-24
> 상태: 완료

## 목표

링퀴즈 운영 지표를 매일 커버링 랩스 Slack 채널로 발송하는 private batch 앱을 추가한다.

## 현황 분석

링퀴즈는 공개 앱 `apps/public/disposal-guide`에서 운영되지만, 정기 Slack 리포트는 커버링 랩스 배치 기준에 따라 `apps/private` batch 앱으로 실행해야 한다. 기존 전환율 지표만으로는 추천 오류 원인을 판단하기 어려워 검색어, 선택값, 추천 결과, 피드백까지 함께 봐야 한다.

## 구현 계획

### 단계별 작업

- [x] `apps/private/ring-quiz-monitoring-report` batch 앱을 추가한다.
- [x] Mixpanel BigQuery에서 최근 24시간과 최근 7일 기준 주요 지표를 조회한다.
- [x] 전환율, 추천 품질 guardrail, 검색어, 선택값, 피드백을 Slack 메시지로 구성한다.
- [x] 기본 발송 채널은 기존 실험실 리포트 채널로 두고, 앱별 env로 override 가능하게 한다.
- [x] dry-run, SQL 실행, 단위 테스트로 검증한다.

## 완료 기준

- 매일 09:00 KST에 Slack 리포트가 발송되도록 deploy.yml이 추가된다.
- 리포트에 전환율, `UNDER_80 + VISIT_PICKUP`, 검색어 top list, 선택값 분포, 피드백 지표가 포함된다.
- Slack 토큰이 없으면 발송하지 않고 명확히 실패한다.
- dry-run과 테스트가 통과한다.
