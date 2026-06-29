# 배치 운영 전면 감사 보고서

> 유형: 분석
> 작성일: 2026-04-17
> 감사 범위: flarelane-d7-retention, large-bag-delivery-batch, vehicle-dispatch-monitor, new-region-weekly-monitor
> 감사 방법: GCP CLI 실증 + VM SSH 실측 + 코드 정적 분석 + 네트워크 도달성 테스트

## 요약

총 **15건의 구별되는 이슈**를 발견. 심각도별 분포:
- CRITICAL: 3건
- HIGH: 7건
- MEDIUM: 4건
- LOW: 1건

이미 PR #26 / #27 에서 해결된 항목은 이 보고서에서 제외.

---

## CRITICAL

### C-1. SSH 22 포트가 전 세계 공개 + 실시간 brute-force 공격 진행 중
- **증거**: `gcloud compute firewall-rules list` — `default-allow-ssh` 규칙이 `0.0.0.0/0`
- **증거**: VM journalctl SSH log 기록:
  ```
  Apr 16 08:19:43 Invalid user admin from 2.57.121.112
  Apr 16 08:22:22 Invalid user dahlia from 213.209.159.159
  Apr 16 08:29:31 Invalid user ftptest from 118.70.178.158
  Apr 16 08:32:34 Invalid user solana from 92.118.39.72
  ```
- **영향**: OS Login 덕에 실제 침투는 막히지만 로그 오염, CPU/네트워크 소모, 제로데이 시 노출
- **수정 제안**: IAP TCP Forwarding 으로 전환 or 소스 IP 제한 (사내 VPN/Jun 공인 IP만)
- **우선순위**: 높음 — 공격 로그가 실제로 쌓이고 있음

### C-2. `beige_covering_app` 유저가 unused crontab 헤더만 있지만 PID 파일을 소유 → 숨은 실행 주체
- **증거**: 
  - `sudo crontab -u beige_covering_app -l` 결과 = `CRON_TZ=Asia/Seoul` / `PATH=...` 두 줄만 존재, 실제 job 없음
  - 하지만 `/tmp/vehicle-dispatch-monitor.pid` 가 `beige_covering_app` 소유였음 (이전 감사에서 관찰)
  - SA crontab 의 `0 21 * * * ... monitor.py --loop` 이 등록돼 있으나 SA 로 실행 시 **Google Sheets 403 Forbidden** (Step 1 에서 즉시 fail)
- **영향**: vehicle-dispatch-monitor 의 실제 운영 주체가 불명확. SA cron 은 매일 21시 실행되지만 실패. 별도 프로세스 또는 수동 실행이 존재
- **수정 제안**: 
  1. `beige_covering_app` 계정이 어떻게 vehicle-dispatch 를 실행 중인지 실사
  2. 선택: (a) 서비스 계정에 Google Sheets 접근 권한 부여 후 SA cron 단일화, (b) `beige_covering_app` 전용 crontab 명시

### C-3. `subprocess.run(bq ...)` 3곳에 `timeout=` 누락 → BQ 지연 시 배치 무한 대기
- **증거**: 
  - `apps/flarelane-d7-retention/src/bq_helper.py:48, 81`
  - `apps/new-region-weekly-monitor/src/main.py:71`
- **영향**: BQ 쿼리가 슬로우 쿼리 또는 ACL 문제로 응답 안 하면 배치가 hang. cron 중복 실행 누적 → 리소스 고갈
- **수정 제안**: `subprocess.run(cmd, timeout=300, ...)` 추가 + TimeoutExpired catch

---

## HIGH

### H-1. `requests.post/get` 10+ 곳에 `timeout=` 누락
- **증거**:
  - `large-bag/slack_notifier.py:22, 40, 64, 84` (4곳)
  - `vehicle-dispatch/server_watchdog_check.py:38`
  - `vehicle-dispatch/server_monitor.py:86`
  - `vehicle-dispatch/order_lookup.py:133, 296, 378` (3곳)
  - `vehicle-dispatch/backoffice_auth.py:48`
- **영향**: Slack/백오피스/BQ 토큰 엔드포인트가 hang 하면 배치 무한 대기
- **수정 제안**: 모든 requests 호출에 `timeout=15` 기본 추가 (이미 일부 호출은 timeout=20 있음)

### H-2. SA 가 `product` BQ 데이터셋에 `WRITER` 권한 — AGENTS.md 의 "WRITER 금지" 정책과 모순
- **증거**: `bq show product` → `WRITER: covering-labs@...`
- **원인**: flarelane 배치가 `product.experiment_user_assignments`, `product.eng_1559_event_history` 에 `MERGE/INSERT` 함. WRITER 필요
- **영향**: AGENTS.md(라인 173) 문서가 실제 정책과 불일치 → 신규 개발자가 WRITER 부여를 금지로 오해 후 배치 개발 막힘
- **수정 제안**: AGENTS.md 에 "실험/리텐션 데이터셋(`product`)은 예외적으로 WRITER 허용. 그 외 READER only" 로 명시

### H-3. `admin-api.covering.app` 가 Private IP `10.0.32.125` 로 resolve → VPC peering 의존
- **증거**: VM 에서 `dig admin-api.covering.app` → `10.0.32.125` (사설 IP)
- **영향**: GCP VPC ↔ AWS VPC peering 또는 Cloud VPN 장애 시 vehicle-dispatch 배차 API 호출 불가 → 차량번호 발송 중단
- **수정 제안**:
  1. peering 구성 문서화 (docs/07_인프라_관리.md)
  2. 도달성 모니터링 추가 (30분마다 health ping + Slack 경보)

### H-4. `Path.home()` / `os.path.expanduser("~/...")` 가 배치 데이터/상태 파일 경로에 사용
- **위치**: 
  - `flarelane/bq_helper.py:14` — BQ_BIN 폴백
  - `flarelane/run_*.py:41, 47` — DATA_DIR
  - `vehicle-dispatch/server_monitor.py:30` — STATE_FILE
  - `vehicle-dispatch/slack_notify.py:21` — SLACK_STATE_FILE
  - `new-region/main.py:20` — BQ_BIN 폴백
- **영향**: cron 환경에서 `$HOME` 이 예상과 다르거나 SA 홈이 없으면 실패. 현재 VM 에서는 동작하지만 SA 교체/재생성 시 취약
- **수정 제안**: `$APP_DIR/data/`, `$APP_DIR/logs/` 처럼 앱 디렉토리 하위 경로 사용

### H-5. 배치 `batch.log` 로그 로테이션 없음 → 무한 증가
- **증거**: `ls /shared/apps/*/logs/batch.log` — 로테이션 설정 없음, 현재 크기 696B ~ 3KB
- **영향**: 매일 누적, 1년 후 수십 MB. 관찰성·디스크 양쪽 악화
- **수정 제안**: `/etc/logrotate.d/covering-labs-batches` 추가. 주 1회 rotate, 4주 보존

### H-6. FlareLane API 호출 시 `sleep_ms=0` 기본값 + rate limit 보호 없음
- **증거**: `run_d7_event_batch.py`, `run_addorder_signal_batch.py` 모두 `--sleep-ms` 기본 0
- **영향**: 대규모 cohort (예: 수천 명) 발송 시 FlareLane rate limit 에 걸리면 일부 실패. 현재는 `total_assigned: 0` 이라 안 걸리지만, 실험 대상이 증가하면 터짐
- **수정 제안**: 기본 `sleep_ms=100` 또는 bulk API endpoint 사용 검토

### H-7. `/shared/apps/hello-world` 493MB, `/shared/apps/_dashboard` 447MB — node_modules 로 디스크 압박
- **증거**: `du -sh /shared/apps/*`
- **영향**: `/dev/root` 29GB 중 11GB 사용 (38%). 현재 여유 있으나 배치 앱이 늘면 위협
- **수정 제안**: 
  1. `hello-world` 는 템플릿 테스트 잔재 — 제거 검토
  2. 빌드 산출물은 `node_modules` 없이 `.next/standalone` 형태 고려

---

## MEDIUM

### M-1. SA crontab 에 `CRON_TZ=Asia/Seoul` 미설정 → VM 시스템 타임존에 의존
- **증거**: `sudo crontab -u sa_... -l` 결과에 CRON_TZ 라인 없음
- **현재 동작**: VM 시스템 TZ = KST 이라 우연히 정상 작동
- **영향**: VM 이관/복구 시 UTC 로 돌아가면 모든 배치 9시간 어긋남
- **수정 제안**: `scripts/deploy-app.sh` 의 crontab 등록 시 `CRON_TZ=Asia/Seoul` 라인을 먼저 삽입. (단, `deploy-app.sh` 수정은 사용자 승인 필요)

### M-2. 4개 `except Exception:` 블록 silent 또는 메시지 부족
- **위치**: 
  - `vehicle-dispatch/monitor.py:934` — `today_summary` 실패 시 `pass`로 완전 silent (그나마 비치명적)
  - `large-bag/dubalhero_api.py:84`, `google_sheets.py:48, 100` — 로깅은 있으나 `except Exception:` 너무 광범위
- **영향**: 알 수 없는 예외가 걸려도 원인 추적 불가
- **수정 제안**: 구체적 예외로 좁히거나 `logger.exception()` 로 스택 남기기

### M-3. syslog/journald retention 짧아 cron 과거 실행 이력 추적 불가
- **증거**: `journalctl --since yesterday` 에서 어제 09:05 flarelane 실행 기록 없음
- **영향**: 배치 장애 분석 시 1일 이상 전 cron 이력 조회 불가
- **수정 제안**: `/etc/systemd/journald.conf` 의 `SystemMaxUse=500M`, `MaxRetentionSec=2week` 설정

### M-4. `vehicle-dispatch` `acquire_lock` 가 `open(PIDFILE, "w")` 를 사용 — 비원자적
- **위치**: `monitor.py:71`
- **영향**: 기존 파일 truncate 하므로 동시 실행 중 lock 잃을 수 있음. `flock` 은 있으나 write mode 는 파일 생성 시 race
- **수정 제안**: `open(PIDFILE, "a")` 로 변경 or `os.open(PIDFILE, O_CREAT|O_RDWR)` 패턴

---

## LOW

### L-1. cron 환경에서 `apt-daily.timer`, `apt-daily-upgrade.timer` 가 매일 실행
- **영향**: 패키지 자동 업그레이드 — 배치 실행 중 Python 런타임이 업데이트되면 이상 동작 가능
- **수정 제안**: `unattended-upgrades` 에서 `python3` 패키지 제외 or 배치 시간대 회피

---

## 이미 해결됨 (참고)

아래는 PR #26, #27 에서 해결되었으므로 이 감사 보고서에서는 제외:
- new-region-weekly-monitor `.env` 경로 버그
- flarelane `run_d7_event_batch.py` import 재구성 + SQL TIME 불일치
- vehicle-dispatch-monitor 여러 naive datetime 을 KST 명시로 수정
- 대시보드의 JSON 키를 에러로 오인식하는 정규식 수정
- 각종 unused imports 정리

---

## 우선 조치 권장 순서

1. **C-3** subprocess timeout 추가 (간단, 영향 큼)
2. **H-1** requests timeout 추가 (간단, 영향 큼)
3. **C-2** vehicle-dispatch 실제 운영 주체 규명 (인터뷰 필요)
4. **C-1** SSH 22 포트 소스 제한 (IAM 정책 변경 필요)
5. **H-2** AGENTS.md BQ WRITER 예외 문서화 (문서 수정만)
6. **H-4** `Path.home()` → `$APP_DIR` 이전 (리팩터)
7. **H-5** logrotate 설정 (운영 스크립트 추가)
8. 나머지 HIGH/MEDIUM 은 우선순위 따라 티켓 생성

## 검증 명령

```bash
# BQ ACL 재확인
bq show --format=prettyjson covering-app-ccd23:product | jq .access

# 방화벽 규칙 재확인
gcloud compute firewall-rules describe default-allow-ssh --project=covering-app-ccd23

# VM journal 재확인
gcloud compute ssh covering-labs-instance-20260306-050059 --zone=asia-northeast3-a -- "sudo journalctl --since '1 hour ago' | grep -i ssh | head -20"

# 배치 로그 크기 추이 확인
gcloud compute ssh covering-labs-instance-20260306-050059 --zone=asia-northeast3-a -- "sudo du -sh /shared/apps/*/logs/"
```
