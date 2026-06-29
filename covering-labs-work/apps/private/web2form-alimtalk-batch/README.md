# web2form-alimtalk-batch

웹폼에 입력된 전화번호로 **카카오 브랜드메시지(친구톡 FT)** 를 자동 발송하는 배치.

## 발송 구조 — FlareLane 공식 Open API (friendtalk FT)

FlareLane 팀 공식 답변(2026-05-19, 2026-05-22) + API 탐색으로 확정된 구조:

- **알림톡 API**: 개인화 변수 미지원, 미등록 번호 발송 제약 → **사용 불가**
- **친구톡 API + 텍스트형(FT)**: 전화번호 기준 발송 가능 + 정적 텍스트 + 버튼 지원 → **채택**
  - FI(이미지형)은 이미지 필수값 — 콘솔 템플릿이 텍스트형일 때 FI 요청 시 "필수값 누락" 오류 발생 (FlareLane 답변 2026-05-22)
- FlareLane 콘솔이 "카카오 친구톡이 브랜드메시지로 개편" 공지 (실질적 동일 endpoint)

### 흐름

1. **신규 발송 대기 조회** — H열(FlareLane 큐잉 여부)이 비어 있는 행
2. **재발송 대상 조회** — H열이 `실패`로 마킹된 행 (1회 한정 재시도)
3. 각 행의 전화번호별로 `POST /v1/projects/{id}/friendtalk` 호출
   (payload에 `targeting: "M"` 포함 — 폼 입력자 비친구 도달용)
4. 응답 body JSON 파싱 — `data.id`, `data.selected`, `data.sent`, `data.failed` 추출
5. 결과 마킹 (순서: H → J → G, 부분 실패 시 이중 발송 방지)
   - HTTP 201 + `selected≥1` → H=`큐잉됨`, J=FlareLane 캠페인 ID, G=`O`
   - HTTP != 201 또는 `selected=0` → H=`실패` (다음 cron tick에서 재발송 픽업)
   - 재시도도 실패 → H=`실패_재시도` (종결, 추가 픽업 안 함)
6. Rate limit 보호로 호출 간 `SEND_DELAY_SEC` (기본 0.1초) 대기

> **⚠️ H=`큐잉됨` ≠ 카카오 도달**
> FlareLane 친구톡 API 는 비동기로, HTTP 201 응답은 "FlareLane 큐잉 OK" 만 의미한다.
> 카카오 측에서 실제 reject 되는 케이스 (예: 비친구 발송 정책, 콘텐츠 검수 fail 등)는 응답으로 알 수 없고, 공식 메시지 ID 별 결과 조회 API 도 2026-05-20 기준 미제공.
> **실 도달은 [FlareLane 콘솔 → 보낸 메시지 → 통계](https://console.flarelane.com/) 에서 확인** — "잘못된 값(전화번호 오류/메시지 내용, 설정 오류)" 분류 카운트가 실제 미도달 건수.

### 시트 컬럼 구조

| 열 | 헤더 | 용도 |
|---|---|---|
| C | 휴대폰 번호 | 발송 대상 (raw `010...`, `+8210...` 모두 지원) |
| G | 발송 여부 | API 호출 성공 → `O` (감사용, 픽업 기준 아님) |
| **H** | **FlareLane 큐잉 여부** (헤더 변경 권장 — 시트에서 직접 수정) | 큐잉 결과 → `큐잉됨` / `실패` / `실패_재시도` (픽업 기준) |
| **J** | **FlareLane 캠페인 ID** | 큐잉됨 마킹 시 자동 기록 — FlareLane 콘솔 수동 확인 또는 향후 delivery polling lookup key |

### Request 예시

```http
POST https://api.flarelane.com/v1/projects/{projectId}/friendtalk
Authorization: Bearer <FlareLane API Key>
Content-Type: application/json

{
  "targetType": "phoneNumber",
  "targetIds": ["+821012345678"],
  "senderId": "<카카오 채널 sender ID>",
  "messageType": "FT",
  "text": "본문 텍스트 (개행 \\n 허용)",
  "buttons": [
    {"name": "쿠폰 등록하기", "type": "WL", "urlMobile": "https://abr.ge/ifizjr", "urlPc": "https://abr.ge/ifizjr"}
  ],
  "isAdvertisement": true,
  "isAdultContent": false,
  "shouldSendPushAlarm": true
}
```

### 검증된 필드 (2026-05-19 자체 API 탐색)

| 필드 | 타입 | 비고 |
|---|---|---|
| `targetType` | enum | `"phoneNumber"` 또는 `"userId"` |
| `targetIds` | string[] | E.164 형식 (`+8210...`) 필수 |
| `senderId` | UUID | 카카오 채널 sender UUID (커버링: `96aa6a29-...`) |
| `messageType` | enum | `FT`/`FI`/`FW`/`FL`/`FA`/`FC` |
| `text` | string | 본문 (개행 `\n` 가능) |
| `imageUrl` | URL | 공개 HTTPS PNG/JPG |
| `buttons[]` | object[] | `{name, type:"WL", urlMobile, urlPc}` — type 값: AL/WL/BK/MD/BC/BT/DS |
| `isAdvertisement` | bool | 광고성 메시지는 `true` |
| `isAdultContent` | bool | 성인 콘텐츠 여부 |
| `shouldSendPushAlarm` | bool | 푸시 알림 발송 여부 |

## 메시지 콘텐츠 (현재 운영 메시지)

- **본문**: "고객님께서 신청하신 50% 쿠폰이 도착했어요!" + 쿠폰 정보 + 사용 안내
- **버튼**: "쿠폰 등록하기" → `https://abr.ge/ifizjr` (앱브릿지 딥링크)

콘텐츠 변경은 `src/config.py` 의 `MESSAGE_TEXT`, `BUTTON_NAME`, `BUTTON_URL` 수정 또는 환경변수 override.

## 실행 환경

- 실행 방식: crontab (5분마다)
- 실행 서버: covering-labs-instance (private VM, VPN 필수)
- 스케줄: `*/5 * * * *`

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/config.py` | 환경변수 로드, 시트 열 설정, 메시지 콘텐츠, fail-fast 검증 |
| `src/sheets.py` | Google Sheets 연결, 미발송 행 조회, 발송완료 기록 |
| `src/flarelane.py` | FlareLane 공식 API 친구톡 FT 발송 + rate limit 대기 |
| `src/main.py` | 배치 진입점 (조회 → 개별 발송 → 마킹) |

## 환경변수

`/shared/.env` (공유) 또는 앱 디렉토리 `.env` (앱 전용, deploy 시 GitHub Secret에서 자동 주입).

### 필수

| 변수명 | 설명 |
|---|---|
| `FLARELANE_PROJECT_ID` | FlareLane 프로젝트 ID |
| `FLARELANE_API_KEY` | FlareLane Open API Key (콘솔 → 설정 → API Keys, 영구) |

### 선택 (기본값 사용 가능)

| 변수명 | 기본값 | 설명 |
|---|---|---|
| `FLARELANE_API_BASE` | `https://api.flarelane.com/v1` | 공식 API 베이스 |
| `WEB2FORM_SENDER_ID` | `96aa6a29-...` | 카카오 채널 sender UUID |
| `WEB2FORM_MESSAGE_TEXT` | (현재 운영 문안) | 본문 텍스트 |
| `WEB2FORM_BUTTON_NAME` | `쿠폰 등록하기` | 버튼 텍스트 |
| `WEB2FORM_BUTTON_URL` | `https://abr.ge/ifizjr` | 버튼 링크 URL |
| `WEB2FORM_SEND_DELAY_SEC` | `0.1` | 발송 간 대기(초) — rate limit 보호 |
| `WEB2FORM_SPREADSHEET_ID` | `1_4Wp7JF...QwOIQJo` | 대상 스프레드시트 ID |
| `WEB2FORM_SHEET_GID` | `1695689664` | 대상 시트 GID |
| `WEB2FORM_PHONE_COL` | `C` | 전화번호 열 |
| `WEB2FORM_NICKNAME_COL` | `B` | 닉네임 열 (현재 메시지에선 미사용) |
| `WEB2FORM_SENT_COL` | `G` | API 호출 성공 마킹 열 (감사용) |
| `WEB2FORM_RESULT_COL` | `H` | 발송 결과 마킹 열 (픽업 기준) |
| `WEB2FORM_MESSAGE_ID_COL` | `J` | FlareLane 캠페인 ID 저장 열 — 큐잉됨 시 자동 기록 |
| `WEB2FORM_RESULT_SUCCESS` | `큐잉됨` | FlareLane 큐잉 성공 시 H열 값 (실 도달 아님) |
| `WEB2FORM_RESULT_FAILURE` | `실패` | 큐잉 실패 시 H열 값 (다음 사이클 재시도 대상) |
| `WEB2FORM_RESULT_RETRIED` | `실패_재시도` | 재시도도 실패 시 H열 값 (종결) |
| `WEB2FORM_FRIENDTALK_TARGETING` | `M` | 수신자 타겟팅 (M=전체, N=비친구만, I=친구만) — 폼 입력자 도달용 필수 |

## 실행 방법

```bash
cd apps/private/web2form-alimtalk-batch
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 src/main.py
```

### Dry-run (검증 모드)

전화번호 정규화만 검증하고 실제 발송과 시트 마킹은 스킵:

```bash
python3 src/main.py --dry-run
```

## 의존 서비스

- Google Sheets API (서비스 계정 `google.auth.default()` 자동 인증)
- FlareLane 공식 Open API (`https://api.flarelane.com/v1`)

## 1회용 마이그레이션 — 누적 row 일괄 재시도 큐잉

`targeting=M` 도입 전(2026-05-20 이전) 누적된 시트 row는 G='O'로 보이지만 실제로는 카카오 도달 0%. 새 코드 배포 직후 1회 실행하면 H열 빈 row를 모두 `실패`로 일괄 마킹하고, 다음 cron tick에서 [src/main.py](src/main.py) 의 재발송 루프가 자동 재시도합니다.

```bash
cd /shared/apps/web2form-alimtalk-batch

# 1) Dry-run으로 대상 행 수 + 샘플 확인
sudo -u sa_109369409955768144646 python3 scripts/migrate_empty_h_to_failure.py --dry-run

# 2) 실 마킹 (batch_update 1회 호출로 처리)
sudo -u sa_109369409955768144646 python3 scripts/migrate_empty_h_to_failure.py
```

이후 5분 안에 cron tick이 발동해 신규 + 재발송 동시 처리. 결과는 시트 H열에서 `성공` / `실패` / `실패_재시도` 로 자동 갱신됩니다.

## API Key 갱신 (보통 불필요 — 영구)

FlareLane API Key는 콘솔에서 발급한 영구 키. 회전 시:

1. FlareLane 콘솔 → 설정 → API Keys → 신규 발급
2. GitHub repo secret 갱신:
   ```bash
   printf '%s' '<new-key>' | gh secret set FLARELANE_API_KEY --repo covering-app/covering-labs --body -
   ```
3. `apps/private/web2form-alimtalk-batch/` 내 trivial 변경 push → Deploy Apps trigger

## 메시지 콘텐츠 갱신

본문/이미지/버튼만 바꿀 때는 코드 PR 한 번:

1. `src/config.py` 의 `MESSAGE_TEXT`/`BUTTON_URL` 수정
2. PR + 머지 → 자동 배포

## 주의사항

- **픽업 기준은 H열** (G열은 감사용). H열이 빈 행만 신규 발송 픽업 대상.
- 전화번호는 `010XXXXXXXX`, `010-XXXX-XXXX`, `+8210...` 형식 모두 지원합니다.
- API 호출 간 0.1초 대기 (rate limit 100 req/sec 보호).
- **재시도 정책**: H='실패' 행은 다음 cron tick에서 1회 자동 재발송. 또 실패하면 H='실패_재시도'로 종결 (추가 픽업 안 함). 운영 중 시트에서 '실패_재시도' 마커를 수동으로 비우면 무한 재시도 가능하므로 주의.
- **카카오 도달 정책**: 폼 입력자 대부분이 채널 비친구이므로 `targeting=M`(선택 유저 전체) 필수. 이 파라미터 누락 시 FlareLane 콘솔의 "잘못된 값(전화번호 오류/메시지 내용, 설정 오류)" 분류로 도달 0% 발생. 운영 중 비친구 발송 자격이 회수되면 `WEB2FORM_FRIENDTALK_TARGETING=I`로 즉시 전환 가능.
- **광고성 메시지 야간 발송 제한**: 정보통신망법상 21:00~익일 08:00 광고 발송 금지. FlareLane이 자동 큐잉하므로 야간 입력은 다음 날 08:00 이후 실제 전송 (cron은 5분마다 API 호출은 그대로 진행, 전송 시점만 지연).
- **H='큐잉됨' 은 카카오 도달이 아니다**: HTTP 201 응답이 와도 카카오 측에서 reject 되는 케이스(정책 위반, 콘텐츠 검수 fail 등) 가 있으며 응답으로 알 수 없다. 콘솔 "보낸 메시지 → 통계" 의 "잘못된 값" 카운트 = 실제 미도달.
- **PII 보호**: FlareLane 응답 body 에 우리가 보낸 phone (`targetIds:["+821..."]`) 이 echo 되므로, 응답 본문을 raw 로 로그·시트·DB 에 저장하지 말 것. 본 배치는 핵심 필드(`id`, `selected`, `sent`, `failed`) 만 추출해 기록한다.
