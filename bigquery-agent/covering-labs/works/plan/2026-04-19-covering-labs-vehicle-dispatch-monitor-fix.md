# vehicle-dispatch-monitor 오류 수정 플랜

> 유형: 플랜
> 작성일: 2026-04-19
> 상태: 완료


---

## 배경

매일 21:00 KST 실행되는 vehicle-dispatch-monitor 배치가 아래 오류로 실행 불가 상태였음.

```
PermissionError: [Errno 13] Permission denied: '/tmp/vehicle-dispatch-monitor.pid'
```

---

## 근본 원인 분석

GCP VM 전수조사 결과 4가지 문제 발견:

| # | 문제 | 원인 |
|---|---|---|
| 1 | PID 파일 권한 오류 | 구 SA(`sa_113...`)가 생성한 `/tmp/vehicle-dispatch-monitor.pid`를 신 SA(`sa_109...`)가 덮어쓸 수 없음 |
| 2 | cron 커맨드 불필요한 env sourcing | PR #62에서 추가된 `. /shared/.env &&`가 `.env` 없을 시 Python 미실행 유발. `config.py`가 이미 내부 처리 |
| 3 | `google-api-python-client` 미설치 | requirements.txt에 있으나 실제 미설치 → `sheets.py` import 실패 |
| 4 | `google-cloud-bigquery` requirements 누락 | `order_lookup.py`에서 사용하나 requirements.txt에 없어 재배포 시 누락 |

---

## 조치 내역

### 즉시 조치 (VM 직접)
- stale PID 파일 삭제: `sudo rm /tmp/vehicle-dispatch-monitor.pid`
- 누락 패키지 수동 설치: `pip3 install google-api-python-client google-cloud-bigquery`

### 코드 수정 (PR)
- **PR #64** (merged): `monitor.py` PIDFILE → `f"/tmp/vehicle-dispatch-monitor-{os.getuid()}.pid"` / `deploy.yml` 커맨드 복원
- **PR #65** (merged): `requirements.txt`에 `google-cloud-bigquery>=3.0.0` 추가

---

## 검증

- VM에서 `monitor.py` import 전체 통과 확인
- crontab `0 21 * * *` 정상 등록 확인 (`sa_109369409955768144646`)
- `/tmp` PID 파일 없음 확인
- `config.py` env 로딩 테스트 통과 (ALLOWED_HOST, CHANNELTALK, SLACK, BACKOFFICE 전부 SET)
