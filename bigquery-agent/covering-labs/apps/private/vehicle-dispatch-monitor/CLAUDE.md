# 차량번호 배차 자동 알림 시스템

## 파이프라인
```
Step 1: 채널톡 "차량등록" 태그 감지 (opened + snoozed)
Step 2: 봇 폼에서 주문코드 추출 (폴백: 전화번호 → BigQuery → 백오피스)
Step 2.5: BigQuery 주문코드 → 주문ID 매핑
Step 3: 백오피스 배차 완료 시 웹훅 수신 ← 개발팀 구현 대기 (ENG-1705)
Step 4: 채널톡 고객에게 차량번호 자동 발송
```

## GitHub Actions
- dispatch-monitor.yml: 수동 테스트 전용 (스케줄 비활성화, 실제 운영은 GCP VM crontab/PM2)
- webhook-trigger.yml: repository_dispatch → 배차 완료 처리
- Secrets: CHANNELTALK_ACCESS_KEY/SECRET, GOOGLE_SHEETS_SPREADSHEET_ID, SLACK_BOT_TOKEN, BACKOFFICE_EMAIL/PASSWORD, GOOGLE_SERVICE_ACCOUNT_JSON

## Vercel
- URL: https://vehicle-dispatch-monitor.vercel.app/api/webhook
- 웹훅 스펙: /docs/WEBHOOK-SPEC.md 참조

## 현재 상태
- 웹훅 수신 엔드포인트 구현 완료
- 개발팀 백오피스 웹훅 발송 구현 대기 (ENG-1705)
- 메시지 템플릿 CX 컨펌 필요

## 배포 후 체크리스트
- [ ] 테스트 통과: `.venv/bin/python3 -m pytest test_changes.py -v`
- [ ] dry-run 정상: `.venv/bin/python3 monitor.py --dry-run`
- [ ] 슬랙 배치 요약 알림 수신 확인

## 실행 환경
앱은 GCP VM에서 crontab / PM2로 운영됩니다.
환경변수는 기본 `/shared/.env` 를 읽고, 필요하면 앱 디렉토리 `.env` 도 폴백으로 읽습니다.
Google Sheets 인증은 `GOOGLE_SERVICE_ACCOUNT_JSON`을 우선 사용하고, 없으면 `GOOGLE_SHEETS_KEY_FILE` / `GOOGLE_APPLICATION_CREDENTIALS` 경로를 순서대로 시도합니다.
