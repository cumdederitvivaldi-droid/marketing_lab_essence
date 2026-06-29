# web2form-alimtalk-batch

웹폼에 전화번호가 입력되면 FlareLane 알림톡(`web2form_coupon_01`)을 자동으로 발송하는 배치.

## 목적

Google Sheets [웹폼 응답 시트](https://docs.google.com/spreadsheets/d/1_4Wp7JFv1HAv_rYhYiE6RBVSRDpJ9teB3w1CQwOIQJo)의 C열에 전화번호가 기록되면,
5분 이내에 FlareLane 알림톡 템플릿 `web2form_coupon_01`을 발송한다.
발송 완료된 행은 G열에 `O`를 기록해 중복 발송을 방지한다.

## 실행 환경

- 실행 방식: crontab (5분마다)
- 실행 서버: covering-labs-instance (private VM, VPN 필수)
- 스케줄: `*/5 * * * *`

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/config.py` | 환경변수 로드, 시트 열 설정, 템플릿 상수 |
| `src/sheets.py` | Google Sheets 연결, 미발송 행 조회, 발송완료 기록 |
| `src/flarelane.py` | FlareLane 알림톡 API 호출 |
| `src/main.py` | 배치 진입점 (조회 → 발송 → 기록) |

## 환경변수

`/shared/.env` (공유) 또는 앱 디렉토리 `.env` (앱 전용)에 설정.

### 필수

| 변수명 | 설명 |
|---|---|
| `FLARELANE_PROJECT_ID` | FlareLane 프로젝트 ID (공유 변수, 이미 설정됨) |
| `FLARELANE_API_KEY` | FlareLane API 키 (공유 변수, 이미 설정됨) |

### 선택 (기본값 사용 가능)

| 변수명 | 기본값 | 설명 |
|---|---|---|
| `WEB2FORM_SPREADSHEET_ID` | `1_4Wp7JFv1HAv_rYhYiE6RBVSRDpJ9teB3w1CQwOIQJo` | 대상 스프레드시트 ID |
| `WEB2FORM_SHEET_GID` | `1695689664` | 대상 시트 GID |
| `WEB2FORM_PHONE_COL` | `C` | 전화번호 열 |
| `WEB2FORM_NICKNAME_COL` | `B` | 닉네임(#{nickname}) 열 |
| `WEB2FORM_SENT_COL` | `G` | 발송완료 마킹 열 |

## 알림톡 템플릿 변수

| 변수 | 값 출처 |
|---|---|
| `#{nickname}` | 시트 B열 |
| `#{coupon_code}` | 고정값 `EMERGENCY50` |
| `#{coupon_name}` | 고정값 `[긴급 지원금] 특별 지역 50% 할인` |

## 실행 방법

```bash
cd apps/private/web2form-alimtalk-batch
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 src/main.py
```

## 의존 서비스

- Google Sheets API (서비스 계정 `google.auth.default()` 자동 인증)
- FlareLane 알림톡 API (`https://api.flarelane.com/v1/projects`)

## FlareLane API 형식 확인

`src/flarelane.py`의 `payload` 딕셔너리가 FlareLane 알림톡 API 스펙과 맞는지 확인하세요.
FlareLane 콘솔 → 개발자 문서에서 `phoneNumbers` targetType 지원 여부와 `params` 필드명을 검증하고,
필요 시 `flarelane.py`의 payload만 수정하면 됩니다.

## 주의사항

- G열에 `O`가 있는 행은 발송 완료로 간주해 건너뜁니다. 다른 값(빈 칸 포함)은 미발송으로 처리됩니다.
- 전화번호는 `010XXXXXXXX`, `010-XXXX-XXXX` 형식 모두 지원합니다.
