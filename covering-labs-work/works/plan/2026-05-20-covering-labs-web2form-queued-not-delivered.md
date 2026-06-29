# web2form 친구톡 — H='성공' false positive 교정 (큐잉 ≠ 도달)

> 유형: 플랜
> 작성일: 2026-05-20
> 상태: 확정

## 목표

`PR #315` 머지 후 4건 발송 시도에서 시트 H 가 모두 `성공` 으로 마킹됐으나, FlareLane 콘솔 통계는 **`잘못된 값(전화번호 오류/메시지 내용, 설정 오류)` 1건** 을 보고. 시트가 실제 발송 결과를 잘못 표현하고 있어 운영자가 도달률을 오판한다. 마킹 의미를 실제 보장 수준에 맞춰 교정한다.

## 원인 분석

### 1) FlareLane 친구톡 API 는 비동기

`POST /v1/projects/{id}/friendtalk` 응답 body 실측 (PII 마스킹):

```json
{
  "data": {
    "id": "5805c516-7054-44de-bf24-dce73e061d30",
    "targeting": "M",
    "selected": 1,
    "sent": 0,
    "failed": 0,
    "unsubscribed": 0,
    "insufficientPoints": 0,
    "capped": 0,
    "createdAt": 1779243304392
  }
}
```

- HTTP 201 + `selected=1` = **FlareLane 큐잉 OK**
- `sent`, `failed` = 응답 시점엔 항상 **0** (비동기로 추후 업데이트)
- 카카오 측 reject (비친구 정책, 콘텐츠 검수 fail, 번호 무효 등) 는 응답으로 알 수 없음

### 2) 메시지 ID 별 결과 조회 API 부재 (2026-05-20 기준)

`https://flarelane-api-docs.readme.io/llms.txt` 의 endpoint 인덱스 확인:

- `GET /v1/projects/{id}/notifications/history?userId={uid}` — userId 기반, phoneNumber 발송엔 부적합
- 친구톡 메시지 ID 별 status/result 조회 endpoint 공식 미제공

후속 polling 자동화는 FlareLane 매니저 한규호에게 webhook 또는 별도 조회 endpoint 확인 후 별도 PR.

### 3) 부수 발견 — PII 가 평문 로그에 노출

`flarelane.py` 의 `resp.text[:1500]` trim 으로 응답 body 가 그대로 로그에 들어가는데, 그 body 의 `targetIds:["+821..."]` 가 우리가 보낸 phone 원본 (E.164) 을 echo 한다. masked phone (`010****1234`) 옆에 raw phone 이 같은 라인에 노출되는 보안 이슈.

## 구현 계획

### 1) `src/flarelane.py` — JSON 파싱 + PII 안전 + 큐잉 판정

- `_send_one` 반환 시그니처 변경: `(bool, str)` → `(bool, dict)`
- `dict` 구조: `{status, id, selected, sent, failed, unsubscribed, error}`
- 응답 body 는 raw 로 보관/로그하지 않고 핵심 필드만 추출
- HTTP != 201 시 `resp.text[:200]` 만 error 단서로 보관 (PII 위험 최소화)
- **큐잉 판정**: HTTP 201 + `selected >= 1`
- `selected == 0` 케이스는 FlareLane 의 즉시 큐잉 거부 → 큐잉 실패로 본다

### 2) `src/config.py` — 상수 의미 명확화

```diff
-RESULT_SUCCESS: str = os.environ.get("WEB2FORM_RESULT_SUCCESS", "성공")
+RESULT_SUCCESS: str = os.environ.get("WEB2FORM_RESULT_SUCCESS", "큐잉됨")
```

해당 상수 블록에 "FlareLane 큐잉 = 도달 아님" WHY 주석 추가.

### 3) `src/main.py` — 새 시그니처 대응 + 로그 메시지 조정

- `_send_row` 도 `(bool, str)` → `(bool, dict)`
- 로그 메시지 "발송 성공" → "큐잉 성공", "발송 실패" → "큐잉 실패" 로 의미 명확화
- 시트 마킹 로직 자체는 그대로 (RESULT_SUCCESS 상수 값만 변경됨)

### 4) `README.md` — H 의미 변경 + 실 도달 검증 방법 안내

- 시트 컬럼 표 의 H 열 헤더를 "FlareLane 큐잉 여부" 로 권장 (사용자가 시트에서 직접 변경)
- 주의사항: H='큐잉됨' ≠ 도달, PII 보호, 실 도달은 콘솔 통계로 확인

### 5) 시트 누적 데이터 처리 (사용자 작업)

PR #315 머지 후 H='성공' 으로 마킹된 4건은 그대로 둔다. 새 발송부터 H='큐잉됨' 마킹. 누적 4건 중 어떤 행이 실제 미도달인지 사용자가 콘솔 통계로 확인 후 시트에서 수동 정정 (선택).

## 완료 기준

- [ ] flarelane.py 응답 body JSON 파싱, raw body 비저장
- [ ] config.py RESULT_SUCCESS default = "큐잉됨"
- [ ] main.py 로그 메시지 "큐잉 성공" / "큐잉 실패" 로 변경
- [ ] README 의 H 의미 + PII 보호 + 콘솔 검증 안내
- [ ] 새 cron tick 발송 로그에 raw phone (+82) 가 응답 body 부분으로 노출되지 않음 확인
- [ ] 새 발송 row 의 H 가 "큐잉됨" 으로 마킹

## 후속 (별도 PR)

- FlareLane webhook 또는 메시지 ID 별 결과 조회 API 도입 (한규호 매니저 확인 필요)
- 시트 J 열 추가로 message_id 저장 → 다음 cron tick 에서 결과 polling → H 를 `도달` / `실패` 로 업데이트
- 이 흐름이 들어가면 H 가 실제 카카오 도달까지 정확히 반영 가능

## 참고

- 직전 PR: #315 (카카오 도달 0% 해결), #317 (로그 라인 중복 수정)
- FlareLane endpoint 인덱스: `https://flarelane-api-docs.readme.io/llms.txt`
- 콘솔: `https://console.flarelane.com/` → 보낸 메시지 → 통계
