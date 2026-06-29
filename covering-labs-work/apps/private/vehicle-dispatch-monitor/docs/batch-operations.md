# 차량등록 자동 알림 배치 운영 문서

04/06 기준

---

## 1. 시스템 개요

채널톡에서 CX파트가 "차량등록" 태그를 붙인 상담을 감지 → 주문코드 추출 → BigQuery/백오피스에서 배차 정보(차량번호) 확인 → 채널톡으로 고객에게 자동 발송.

---

## 2. 배치 목록

| 배치 | 스크립트 | 스케줄 (KST) | 실행 주체 |
|------|---------|-------------|---------|
| 차량등록 감지·발송 | `monitor.py --loop` | 21:00~23:00, 10분 주기 | GCP crontab |
| 로컬 서버 heartbeat | `server_monitor.py` | 20:30~23:00, 30분 주기 | GCP crontab |
| 서버 다운 감시 (watchdog) | `server_watchdog_check.py` | 수동 only (비활성) | GitHub Actions |
| 차량배차 감지 (테스트) | `dispatch-monitor.yml` | 수동 only | GitHub Actions |

---

## 3. 배치 1 — 차량등록 감지·발송 (`monitor.py`)

### 실행 방식

```bash
# 운영 (루프, GCP crontab)
python3 monitor.py --loop

# 1회 실행 (GitHub Actions용, 현재 미사용)
python3 monitor.py

# 테스트 (발송/시트 기록 없이 감지만)
python3 monitor.py --dry-run

# 발송만 스킵, 나머지 실제 실행
python3 monitor.py --skip-send

```

### 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `ALLOWED_HOST` | 필수 | 실행 허용 호스트명 (GCP: `covering-labs-instance-20260306-050059`) |
| `CHANNELTALK_ACCESS_KEY` | 필수 | 채널톡 Open API 키 |
| `CHANNELTALK_ACCESS_SECRET` | 필수 | 채널톡 Open API 시크릿 |
| `BACKOFFICE_EMAIL` | 권장 | 백오피스 자동 로그인 이메일 (설정 시 토큰 자동 갱신) |
| `BACKOFFICE_PASSWORD` | 권장 | 백오피스 자동 로그인 비밀번호 |
| `BACKOFFICE_ACCESS_TOKEN` | 선택 | 수동 토큰 (자동 로그인 없을 때 fallback) |
| `BACKOFFICE_ORDER_API_VERSION` | 선택 | `v3`(기본) / `v2` — v3 → 404 시 v2 자동 폴백 |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | 필수 | Google Sheets ID |
| `GOOGLE_SHEETS_KEY_FILE` | 선택 | 서비스 계정 키 파일 경로 (`$HOME` / `~` 경로 사용 가능) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 권장 | 서비스 계정 키 JSON 원문. 파일이 없을 때도 바로 인증 가능 |
| `GOOGLE_APPLICATION_CREDENTIALS` | 선택 | Google 표준 서비스 계정 파일 경로 |
| `GOOGLE_SHEETS_WORKSHEET_NAME` | 선택 | 워크시트명 (기본: `시트1`) |
| `SLACK_BOT_TOKEN` | 필수 | 슬랙 봇 토큰 (커바니_방문수거) |
| `SLACK_CHANNEL` | 선택 | 기본 `#제품팀_cs_notifications` |

### 운영 시간

```python
OPERATION_START = 21:00
OPERATION_END   = 23:00
POLLING_INTERVAL_MINUTES = 10
```

### 중복 실행 방지 (3계층)

**1. PID 파일 락** (`/tmp/vehicle-dispatch-monitor.pid`)
- `main()` 진입 시 PID 파일 생성. 동일 머신 내 중복 실행 차단.
**2. 공용 시트 점유권** (Google Sheets 특정 row)
- `--loop` 모드에서만 적용. `try_acquire_runner_lease`로 `호스트:PID:타임스탬프` 토큰 기록.
- `LoopLeaseHeartbeat` 스레드가 60초마다 갱신. 다른 머신이 점유 중이면 즉시 종료.
- 종료 시 `release_runner_lease` 해제.

**3. 발송 완료 플래그** (시트 COL_SENT + 메모리 캐시)
- 시트에 'Y' 기록된 `chat_id`는 재처리 없음.
- `_sent_cache` (메모리): 시트 업데이트 지연 대비 2차 방어.
- `sent_this_batch_chats`: 현재 배치 내 동일 `chat_id` 중복 발송 방지.

### 핵심 코드

#### 중복 실행 방지 — PID 파일 락

```python
def acquire_lock() -> bool:
    global _lock_fp
    _lock_fp = open(PIDFILE, "w")
    try:
        fcntl.flock(_lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_fp.write(str(os.getpid()))
        _lock_fp.flush()
        return True
    except OSError:
        _lock_fp.close()
        _lock_fp = None
        return False
```

#### 공용 시트 점유권 heartbeat (`LoopLeaseHeartbeat`)

```python
class LoopLeaseHeartbeat:
    def __init__(self, token: str, host: str):
        self.token = token
        self.host = host
        self._stop_event = threading.Event()
        self._thread = None

    def start(self):
        self._thread = threading.Thread(
            target=self._run, daemon=True
        )
        self._thread.start()

    def _run(self):
        while not self._stop_event.wait(LOOP_LEASE_HEARTBEAT_SECONDS):
            if not sheets.renew_runner_lease(
                self.token, self.host, LOOP_LEASE_RENEW_TTL_SECONDS
            ):
                logger.warning("점유권 연장 실패 — heartbeat 중단")
                return

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=1)
        sheets.release_runner_lease(self.token)
```

#### `run_loop` — 폴링 루프 뼈대

```python
def run_loop(dry_run=False):
    host = get_current_host()
    lease_token = _build_loop_lease_token(host)
    if not sheets.try_acquire_runner_lease(lease_token, host, LOOP_LEASE_INITIAL_TTL_SECONDS):
        logger.warning("다른 실행 주체가 저녁 배치를 점유 중 — loop 시작 취소")
        return
    lease_guard = LoopLeaseHeartbeat(lease_token, host)
    lease_guard.start()

    try:
        while True:
            now = datetime.now()
            if config.OPERATION_START <= now.time() <= config.OPERATION_END:
                if not evening_started and not dry_run:
                    slack_notify.send_evening_start()
                    evening_started = True
                run_once(dry_run, loop_mode=True)
                if now.time() >= config.OPERATION_END:
                    break
                sheets.collapse_past_date_rows(sheets.get_all_rows())
            elif now.time() > config.OPERATION_END:
                break
            time.sleep(config.POLLING_INTERVAL_MINUTES * 60)
    finally:
        lease_guard.stop()
```

### 단계별 실행 흐름

#### Step 1 — 채널톡 태그 감지 (`step1_detect_tagged_chats`)

1. Google Sheets 헤더 존재 확인 (`sheets.ensure_headers`)
2. 시트 전체 행 읽기
3. 채널톡에서 `"차량등록"` 태그 상담 조회 (`channeltalk.get_tagged_chats`)
4. 이미 시트에 있는 `chat_id`는 스킵 (단, `발송 필요 X` 상태는 재감지 허용)
5. 반환: `new_chats` (신규 감지된 상담 목록)

#### Step 2 — 주문코드 추출 및 시트 적재 (`step2_extract_and_save`)

`new_chats`를 순회하며:

```
추출 전략 (우선순위 순):
  1. 채널톡 봇 폼 inputs[].label + value에서 주문코드 직접 추출
  2. 봇 폼 또는 유저 프로필에서 전화번호 추출
  3. 전화번호 있으면: BQ 후보 조회 → 백오피스 전화번호 대조 → 주문코드/ID 확정
```

시트 적재 결과:

| 상황 | 시트 상태 | 비고 |
|------|---------|------|
| 주문코드 찾음 | 정상 적재 | chat_id, 주문코드, 주문ID, 전화번호 기록 |
| 주문코드 없음 + 전화번호 있음 | `추출실패` | `fail_reason=[retry:0/12]` — Step 2.5에서 재시도 |
| 둘 다 없음 | `수동처리필요` | `new_manual` 목록 추가 |

시트 쓰기는 `SheetsWriteBuffer`로 일괄 플러시.

#### Step 2.5 — 주문코드 → 주문ID 매핑 (`step2_5_resolve_order_ids`)

시트에서 `미처리` + 주문ID 없는 행 또는 `추출실패` 행 처리:

```
주문코드 → 주문ID:
  order_lookup.lookup_order_id → BigQuery에서 주문코드를 숫자 주문ID로 변환

추출실패 행 (전화번호 보유):
  _resolve_order_by_phone 재시도
  → 최대 12회 (MAX_PHONE_RETRY). 초과 시 수동처리필요 에스컬레이션 + 슬랙 알림

BQ 매핑 실패 시 폴백:
  전화번호 있으면 _resolve_order_by_phone 시도 (주문코드 오입력 커버)
  → 모두 실패 시 fail_reason=[bq_retry:X/8] 기록
  → 8회 초과 시 수동처리필요 에스컬레이션
  → 전화번호 폴백도 실패 시 카운트 +2씩 증가 (에스컬레이션 가속화)
```

`new_manual + new_escalated` → `slack_notify.send_manual_required_alert` (슬랙 알림)

#### Step 3 — 배차 확인 (`step3_check_dispatch`)

시트에서 `미처리` 상태 주문 순회:

**스킵 조건:**
- `익일수거` 상태
- 감지일로부터 10일 초과 (만료 처리)
- 주문코드 추출 실패 또는 주문ID 미매핑

**흐름:**

```
1. BQ에서 픽업 날짜 조회 (order_lookup.get_pickup_dates_batch)
   → 오늘보다 미래이면 "익일수거" 상태로 변경, 스킵

2. 채널톡 이력 조회 (channeltalk.has_vehicle_number_message)
   → 상담사가 이미 수동 발송했으면 "수동발송완료" 처리, 스킵

3. 백오피스 호출 (backoffice.get_dispatch_info(order_id))
   → 50건마다 60초 대기 (부하 분산)
   → 401 시 슬랙 알림 후 중단
   → cancelled/closed → "발송 필요 X"
   → vehicle_number + rider_name 있으면 dispatched 목록에 추가
```

#### Step 4 — 채널톡 발송 (`step4_send_messages`)

`dispatched` 목록 순회:

**발송 스킵 조건:**
- `vehicle_number` 없음
- `vehicle_number == "회사차량"` → 슬랙 수동 처리 알림
- `chat_id`가 `sent_chat_ids` / `sent_this_batch_chats` / `_sent_cache`에 있음
- `channeltalk.is_vehicle_already_sent` = True (채널톡 이력 수동 발송 확인)
- `--dry-run` / `--skip-send` 모드

**발송 메시지 템플릿 (기본):**

```
안녕하세요, 커버링입니다 :)
수거 차량이 배정되었습니다.

차량번호: [{vehicle_number}]

아파트 차량 등록 후, 봉투를 문 앞에 놓아주시면 새벽에 수거해드리겠습니다.
감사합니다!
```

방문자 정보 요청 고객 (`channeltalk.needs_visitor_info = True`):
- `MESSAGE_TEMPLATE_WITH_VISITOR` 사용 (`{rider_name}`, `{rider_phone}` 추가 포함)

**발송 성공 시:**
- `_sent_cache` + `sent_this_batch_chats` 추가
- `sheets.mark_sent` → 시트 'Y' 기록
- `slack_notify.send_dispatch_log` → 슬랙 로그

#### 최종 집계

```python
sheets.get_today_summary()
slack_notify.send_summary()  # dry-run이 아닌 경우
```

### 백오피스 인증 방식

```
자동 로그인 모드 (BACKOFFICE_EMAIL + BACKOFFICE_PASSWORD 둘 다 설정 시):
  get_valid_token() → 토큰 없거나 50분 경과 시 ID/PW로 재로그인 → 메모리 캐시

수동 토큰 모드 (BACKOFFICE_ACCESS_TOKEN 설정 시):
  해당 토큰 사용, 만료 시 수동 갱신 필요
```

### BigQuery 조회 모듈 (`order_lookup.py`)

주문코드 ↔ 주문ID 변환과 픽업 날짜 조회를 담당. 레거시/신규 도메인 모두 UNION ALL로 커버.

**주문코드 → 주문ID**

```python
def lookup_order_id(order_code: str) -> Optional[int]:
    """주문코드를 숫자 주문ID로 변환. 기준일(03/31) 이전/이후 두 테이블 UNION ALL."""
    query = f"""
    SELECT id FROM (
      -- 구 도메인 (03/31 이전)
      SELECT id FROM `{PROJECT}.order.order` WHERE code = @order_code
      UNION ALL
      -- 신규 도메인 (03/31 이후)
      SELECT id FROM `{PROJECT}.order_v2.order` WHERE order_number = @order_code
    ) LIMIT 1
    """
    job = _get_bq_client().query(query, job_config=...)
    rows = list(job)
    return int(rows[0]["id"]) if rows else None
```

**전화번호 → 주문 후보 (1차: 7일, 2차 폴백: 30일)**

```python
def lookup_orders_by_phone(phone: str) -> list[dict]:
    """전화번호로 활성 주문 후보 조회. 7일 이내 없으면 30일로 확장."""
    # ... phone 정규화 (010-xxxx-xxxx → 01000000000) ...
    for days in [7, 30]:
        rows = _query_by_phone(phone, days)
        if rows:
            return rows
    return []
```

**픽업 날짜 배치 조회**

```python
def get_pickup_dates_batch(order_ids: list[int]) -> dict[int, date]:
    """여러 주문ID의 픽업 날짜를 한 번에 조회. 익일수거 감지용."""
    # 구 도메인 + 신규 도메인 UNION ALL, order_id IN (...)
    # 반환: {order_id: pickup_date}
```

---

## 4. 배치 2 — 로컬 서버 heartbeat (`server_monitor.py`)

GCP 서버가 살아있는지 확인. 20:30~23:00 KST, 30분 주기. Slack 일별 스레드에 상태 reply를 쌓고, Sheets M1에 타임스탬프 기록 → GitHub Actions watchdog이 감시.

```bash
# GCP crontab으로 자동 실행
ALLOWED_HOST=covering-labs-instance-20260306-050059 python3 server_monitor.py
```

흐름: 운영 시간 확인 → Slack 스레드 ts 확인(없으면 부모 메시지 생성) → `✅ HH:MM 서버 정상` reply → Sheets M1 타임스탬프 기록.

---

## 5. 배치 3 — 서버 다운 감시 (`server_watchdog_check.py`)

GitHub Actions에서 Sheets M1 heartbeat를 읽어, 40분 이상 갱신 없으면 Slack @멘션.

> **현재 상태:** `server-watchdog.yml` 스케줄 비활성화 (03/24). 수동 트리거 테스트용.

```python
MAX_STALE_MINUTES = 40

def run():
    heartbeat_str = sheets.get_server_heartbeat()
    if not heartbeat_str:
        return
    diff_minutes = (datetime.now(KST) - heartbeat_dt).total_seconds() / 60
    if diff_minutes > MAX_STALE_MINUTES:
        _slack_send(f":red_circle: 로컬 서버 응답 없음! @{MY_SLACK_USER_ID}\n"
                    f"마지막 heartbeat: {heartbeat_str} ({int(diff_minutes)}분 전)")
```

---

## 6. GitHub Actions

| 워크플로우 | 파일 | 트리거 | 비고 |
|-----------|------|--------|------|
| 차량번호 배차 자동 알림 | `dispatch-monitor.yml` | `workflow_dispatch` (수동) | 스케줄 비활성화. 백오피스 VPN 필요 → GitHub Actions IP 차단. 채널톡 감지 테스트 전용. `dry_run` 인풋 선택 가능. |
| 서버 다운 감시 | `server-watchdog.yml` | `workflow_dispatch` (수동) | 스케줄 비활성화 (03/24). `server_watchdog_check.py` 실행. |

**GitHub Secrets 목록**:
- `CHANNELTALK_ACCESS_KEY` / `CHANNELTALK_ACCESS_SECRET`
- `GOOGLE_SHEETS_SPREADSHEET_ID` / `GOOGLE_SERVICE_ACCOUNT_JSON`
- `SLACK_BOT_TOKEN`
- `BACKOFFICE_EMAIL` / `BACKOFFICE_PASSWORD`

---

## 7. GCP crontab 스케줄

서버: `covering-labs-instance-20260306-050059`

| 스크립트 | 스케줄 (UTC) | 비고 |
|---------|------------|------|
| `monitor.py --loop` | 매일 12:00 (KST 21:00) | 23:00 KST 자체 종료 |

- 환경변수 파일: `/shared/.env`
- 시트 인증 우선순위: `GOOGLE_SERVICE_ACCOUNT_JSON` → `GOOGLE_SHEETS_KEY_FILE` / `GOOGLE_APPLICATION_CREDENTIALS` → 기본 인증
- `ALLOWED_HOST` 불일치 시 자동 종료 (타 머신 중복 실행 방지)
- crontab은 `deploy-app.sh`가 `deploy.yml`의 `schedule`/`command`를 읽어 자동 등록 (참고: `cron/crontab.tmpl`)

---

## 8. 로컬 실행 (긴급 복구 전용)

```bash
cd vehicle-dispatch-monitor
set -a && source /shared/.env && set +a
.venv/bin/python3 monitor.py --loop
```

- `ALLOWED_HOST=covering-labs-instance-20260306-050059` 이면 맥북에서 실행해도 배치 진입 불가 (의도적 안전장치)
- 긴급 수동 실행 시 `ALLOWED_HOST`를 현재 맥북 호스트명으로 변경 후 실행
- Step 1 시트 접근이 막히면 배치는 더 이상 `0건 처리`처럼 지나가지 않고 바로 실패로 종료된다.

---

## 9. 배포 후 체크리스트

```bash
# 1. 단위 테스트
.venv/bin/python3 -m pytest test_changes.py -v

# 2. dry-run (발송 없이 감지 흐름 전체 확인)
.venv/bin/python3 monitor.py --dry-run

# 3. 슬랙 #제품팀_cs_notifications 배치 요약 알림 수신 확인
```

---

## 10. 긴급 복구

GCP VM에 SSH 접속 후 직접 실행:

```bash
cd ~/vehicle-dispatch-monitor
set -a && source /shared/.env && set +a
.venv/bin/python3 monitor.py --dry-run
```

---

## 11. 코드 구조 및 이관 주의사항

### 모듈 역할 분리

| 파일 | 역할 |
|------|------|
| `monitor.py` | 전체 흐름 제어 (감지→조회→발송). 아래 모듈 전체 조합 |
| `channeltalk.py` | 채널톡 태그 감지 + 메시지 발송 |
| `sheets.py` | 감시 목록 시트 관리 |
| `backoffice.py` | 백오피스 배차 정보 조회. security + backoffice_auth 경유 |
| `order_lookup.py` | BigQuery 주문코드→ID 변환 + 픽업일 조회 |
| `slack_notify.py` | 슬랙 알림 발송 + 상태 파일 관리 |
| `security.py` | 백오피스 API 접근 제어 (GET 전용 + 경로 허용 목록) |
| `backoffice_auth.py` | 백오피스 토큰 자동 갱신 |
| `config.py` | 전체 환경변수 + 설정값 |
| `server_monitor.py` | 서버 heartbeat |
| `server_watchdog_check.py` | heartbeat 감시 + 멘션 |

---

### Google Sheets 열 구조

| 열 | 내용 | 비고 |
|----|------|------|
| A (주문코드) | 영숫자 8자리 (예: FRTV6ECX) | 채널톡 봇 폼에서 추출 |
| B (주문ID) | 숫자 주문ID (예: 1283492) | BigQuery 매핑 결과 |
| C (상담ID) | 채널톡 chat_id | 발송 대상 식별 키 |
| D (감지시간) | 태그 감지 일시 | — |
| E (배차상태) | 미처리 / 수거예정 / 발송완료 / 수동처리필요 / 배차없음 등 | — |
| F (차량번호) | 배차된 차량번호 | — |
| G (라이더) | 라이더 이름 | — |
| H (배차확인시간) | 백오피스에서 배차 확인한 일시 | — |
| I (발송완료) | Y / 빈칸 | Y이면 재발송 차단 |
| J (전화번호) | 폴백 시 추출된 번호 | 수동 확인용 |
| K (실패원인) | 추출실패 사유 + 재시도 횟수 | 수동처리필요 행에만 |
| M2:P2 | 분산 점유권 토큰 | token / host / 시작시각 / 만료시각. 복수 머신 중복 실행 차단 |

---

### 백오피스 API 경로 허용 목록

신규 경로를 호출해야 할 때는 `security.py`의 `ALLOWED_ENDPOINT_PATTERNS`에 정규식 패턴 추가 필수.
추가 없이 호출하면 즉시 차단 예외 발생.

```python
ALLOWED_ENDPOINT_PATTERNS = [
    r"^/v2/order/\d+$",
    r"^/v3/order/\d+$",
    # 새 경로 추가 시 여기에
]
```

---

### 슬랙 상태 파일

`~/.vehicle_dispatch_slack.json`에 일별 알림 발송 키 저장. 같은 날 동일 알림 중복 발송 차단.
배포 후 알림이 오지 않으면 이 파일의 당일 항목 삭제 후 재시도.

---

### 로그 파일

| 파일 | 내용 |
|------|------|
| `logs/batch.log` | 배치 전체 로그 (stdout + Python logger 통합) |

---

### 자동 배포 동작

GitHub Actions (`deploy.yml`) → `gcloud compute scp`로 파일 복사 → `deploy-app.sh vehicle-dispatch-monitor` 실행 → crontab 자동 등록.
수동 배포 시: VM에서 `bash /shared/scripts/deploy-app.sh vehicle-dispatch-monitor` 실행.

---

### 웹훅 전환 계획 (ENG-1705)

현재: 10분마다 백오피스 직접 조회(폴링).
예정: 배차 완료 시 백오피스가 웹훅 발송 → 즉시 처리.
수신 주소와 처리 코드는 이미 구현 완료 (`/docs/WEBHOOK-SPEC.md`). 백오피스 측 발송 구현 대기 중.

---

### 프로세스 관리

GCP VM에서 crontab으로 운영. 배포 시 `deploy-app.sh`가 `deploy.yml`의 `schedule`/`command` 값을 읽어 crontab을 자동 등록한다.
