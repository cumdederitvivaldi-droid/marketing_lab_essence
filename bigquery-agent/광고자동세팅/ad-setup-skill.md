# Meta 광고 소재 자동 세팅

## 역할
커버링 Meta 광고 소재 자동 세팅 담당자다.
팀원이 아래 양식을 붙여넣으면, 입력값 검증 → 병렬 서브 에이전트(복수 광고세트) → Python 스크립트 실행 → 결과 보고 순서로 처리한다.
모든 광고는 PAUSED로 생성된다. ACTIVE 요청은 무조건 거부한다.

---

## 🧙 대화형 마법사 (권장)

**신규 광고세트를 만들 때는 마법사를 먼저 실행하세요.**
캠페인 선택 → 복사할 광고세트 선택 → 세트명/타겟/예산 설정 → 콘텐츠 폴더 → 실행까지 단계별로 안내합니다.

```powershell
cd "C:\Users\hound\OneDrive\바탕 화면\bigquery-agent"
$env:FACEBOOK_ACCESS_TOKEN = "토큰값"
python 광고자동세팅/setup_wizard.py
```

**마법사 진행 흐름:**
```
STEP 1  캠페인 선택
  → 활성/일시정지 캠페인 목록 표시 → 번호로 선택

STEP 2  복사할 광고세트 선택
  → 선택한 캠페인의 광고세트 목록 표시 (OS/타겟/예산 정보 포함)
  → 번호로 선택 → 타겟·예산 설정이 자동으로 복사됨

STEP 3  신규 광고세트 설정
  → 새 광고세트명 입력
  → OS 확인 (복사 세트에서 자동 감지, 변경 가능)
  → 타겟 선택 (논타겟/리타겟/유사타겟, 기본값=복사 세트 타겟)
  → 예산 입력 (기본값=복사 세트 예산)

STEP 4  콘텐츠 및 광고 설정
  → 콘텐츠 폴더 경로 입력 (mp4/mov/jpg/png 자동 탐색)
  → 광고명 패턴 입력 → 파일 순서대로 번호 자동 부여
  → 제목/문구 입력 (기본값 사용 가능)

→ 요약 확인 후 y(실행) / d(dry-run) / n(취소)
```

---

## 호출 방법

```
/ad-setup
작업: 세트생성
캠페인 ID: 120231883282870514
콘텐츠 폴더: C:\Users\hound\OneDrive\바탕 화면\콘텐츠 결과물\영상\26년\신규폴더
광고세트명: aos_purchase_all_vd_신규컨셉(후킹)_mk1_26.05.15
광고명 패턴: aos_vd_all_신규컨셉(후킹)_mk1_26.05.15
OS: aos
타겟: all
예산: 30000
제목: 첫 주문 990원
문구: |
  드디어! 첫 주문 단 990원으로 시작하세요 🎉
  ...
```

```
/ad-setup
작업: 소재추가
광고세트 ID: 120231883282870514
영상 경로: C:\Users\hound\OneDrive\바탕 화면\콘텐츠 결과물\영상\26년\video.mp4
광고명: aos_vd_all_990원(드디어)3_mk1_26.05.14
제목: 첫 주문 990원
문구: |
  드디어! 첫 주문 단 990원으로 시작하세요 🎉
  ...
```

---

## 요청 양식

### A. 세트생성 — 콘텐츠 폴더로 신규 광고세트 + 소재 일괄 등록

```
작업: 세트생성
캠페인 ID: [campaign_id]                         ← 필수
콘텐츠 폴더: [로컬 폴더 전체 경로]               ← 필수 (폴더 1개 = 광고세트 1개)
광고세트명: [네이밍 컨벤션 참고]                  ← 필수
광고명 패턴: [aos_vd_all_컨셉(후킹)_mk1_YY.MM.DD] ← 필수 (파일 순서대로 1,2,3 자동 삽입)
OS: aos / ios                                     ← 생략 시 aos
타겟: all / re / lookalike                        ← 생략 시 all
예산: [KRW 정수]                                  ← 생략 시 config.json 기본값
제목: [광고 제목]                                  ← 생략 시 config.json 기본값
문구: |                                            ← 생략 시 config.json 기본값
  첫째 줄
  둘째 줄
오디언스 ID: [id1, id2]                           ← re/lookalike 타겟 시 필수
```

**광고명 자동 번호 부여 규칙**
- 패턴에 `(hook)` 형식이 있으면 → `(hook)` 뒤, `_manager_date` 앞에 번호 삽입
  - `aos_vd_all_신규(드디어)_mk1_26.05.15` → `aos_vd_all_신규(드디어)1_mk1_26.05.15`
- `(hook)` 없으면 → 끝에 `_1`, `_2` 붙임

**지원 형식**: mp4, mov (영상) / jpg, jpeg, png (이미지)
**파일 처리 순서**: 파일명 알파벳순

---

### B. 소재 추가 — 기존 광고세트에 새 영상 추가

```
작업: 소재추가
광고세트 ID: [adset_id]               ← 필수. 복수 추가 시 쉼표로 구분
영상 경로: [로컬 파일 전체 경로.mp4]  ← 필수 (--video_id로 대체 가능)
영상 ID: (이미 업로드된 경우 video_id, 경로 대신 사용)
광고명: [네이밍 컨벤션 참고]          ← 필수
제목: [광고 제목]                      ← 생략 시 광고세트 기존 광고에서 자동 복사
문구: |                                ← 생략 시 자동 복사
  첫째 줄
  둘째 줄 (여러 줄 가능)
```

### C. 소재 업데이트 — 기존 광고의 소재 교체

```
작업: 소재업데이트
광고 ID: [ad_id]                       ← 필수
영상 ID: [video_id]                    ← 필수 (이미 업로드된 영상)
제목: [새 제목]                         ← 필수
문구: |                                ← 필수
  첫째 줄
  둘째 줄
Instagram ID: (생략 시 FB 페이지를 스폰서로 사용)
```

---

## 광고명 네이밍 컨벤션

```
형식:  {os}_{format}_{targeting}_{concept}({hook}){ver}_{manager}_{YY.MM.DD}
예시:  aos_vd_all_990원(드디어)3_mk1_26.05.14

os        : aos / ios
format    : vd (영상) / im (이미지)
targeting : all (논타겟) / re (리타겟) / lookalike_X% (유사타겟)
concept   : 소재 컨셉명 (예: 990원, 청소부2500, 쓰레기봉투)
hook      : 괄호 안 후킹 유형 (예: 드디어, 가구, 가격, 지역)
ver       : 버전 숫자 (1, 2, 3 ...)
manager   : hn1 / cr1 / mk1 / nk1 / sj1 / dh1
date      : YY.MM.DD (오늘 날짜)
```

---

## 실행 절차

### Step 1 — 파싱 및 유효성 검사

입력값에서 아래 항목을 추출한다:
- `작업`: 소재추가 / 소재업데이트
- `광고세트 ID` / `광고 ID`
- `영상 경로` 또는 `영상 ID`
- `광고명`, `제목`, `문구`

**광고명 형식 검사**: `{os}_{format}_{targeting}_{concept}({hook}){ver}_{manager}_{date}` 패턴 준수 여부 확인.
형식이 맞지 않으면 올바른 예시와 함께 경고하고 계속 진행한다.

**FACEBOOK_ACCESS_TOKEN 확인**:
```powershell
echo $env:FACEBOOK_ACCESS_TOKEN
```
토큰이 없으면 사용자에게 "! $env:FACEBOOK_ACCESS_TOKEN = '토큰값'" 입력을 요청한다.

### Step 2 — 병렬 서브 에이전트 실행 (복수 광고세트)

**광고세트가 2개 이상인 경우**, 영상을 먼저 1회만 업로드한 뒤 각 광고세트에 병렬 배포한다:

```
[순서]
① 영상 업로드 1회 → video_id 취득
② 각 광고세트별 서브 에이전트를 동시에 실행 (Agent tool, 복수 호출)
   각 서브 에이전트: --video_id [id] 사용 (재업로드 없음)
```

각 서브 에이전트에 전달할 프롬프트:
```
광고세트 [ADSET_ID]에 다음 소재를 추가해줘.
실행 명령:
  cd "C:\Users\hound\OneDrive\바탕 화면\bigquery-agent"
  $env:FACEBOOK_ACCESS_TOKEN = "[TOKEN]"
  python 광고자동세팅/add_to_adset.py `
    --adset_id [ADSET_ID] `
    --video_id [VIDEO_ID] `
    --ad_name "[AD_NAME]" `
    --title "[TITLE]" `
    --message "[MESSAGE]"
결과 (광고 ID, 소재 ID)를 반환해줘.
```

**광고세트가 1개인 경우**: 서브 에이전트 없이 직접 실행.

### Step 3 — 스크립트 실행

#### 세트생성 (폴더 → 신규 광고세트 + 소재 일괄 등록)
```powershell
cd "C:\Users\hound\OneDrive\바탕 화면\bigquery-agent"

python 광고자동세팅/create_adset_from_folder.py `
  --campaign_id [campaign_id] `
  --folder "[folder_path]" `
  --adset_name "[adset_name]" `
  --ad_name "[ad_name_pattern]" `
  --os [aos|ios] `
  --targeting [all|re|lookalike] `
  --budget [budget_krw] `
  --title "[title]" `
  --message "[message]"
  # 리타겟/유사타겟 시 추가:
  # --audience_ids [id1] [id2]
```

#### 소재 추가 (기존 세트에 영상 추가)
```powershell
cd "C:\Users\hound\OneDrive\바탕 화면\bigquery-agent"

# 영상 파일이 있는 경우
python 광고자동세팅/add_to_adset.py `
  --adset_id [adset_id] `
  --video "[video_path]" `
  --ad_name "[ad_name]" `
  --title "[title]" `
  --message "[message]"

# 이미 업로드된 영상 ID가 있는 경우 (업로드 스킵)
python 광고자동세팅/add_to_adset.py `
  --adset_id [adset_id] `
  --video_id [video_id] `
  --ad_name "[ad_name]" `
  --title "[title]" `
  --message "[message]"
```

#### 소재 업데이트
```powershell
cd "C:\Users\hound\OneDrive\바탕 화면\bigquery-agent"

python 광고자동세팅/update_creative.py `
  --ad_id [ad_id] `
  --video_id [video_id] `
  --title "[title]" `
  --message "[message]"
  # --ig_user_id [id]   # Instagram 계정 지정 시 추가 (생략 시 FB 페이지로 자동 설정)
```

### Step 4 — 결과 보고

실행 완료 후 아래 형식으로 결과를 출력한다:

```
## ✅ 광고 소재 세팅 완료

| 항목         | 값                        |
|--------------|---------------------------|
| 광고세트 ID  | [adset_id]                |
| 광고 ID      | [ad_id]                   |
| 소재 ID      | [creative_id]             |
| 영상 ID      | [video_id]                |
| 광고명       | [ad_name]                 |
| 제목         | [title]                   |
| 상태         | PAUSED                    |

⚠️ 활성화는 Meta 광고 관리자(ads.manager.com)에서 직접 진행하세요.
결과 파일: 광고자동세팅/added_[ad_id].json
```

---

## 빠른 요청 예시

### 예시 0 — 폴더로 신규 광고세트 생성 (가장 기본)
```
작업: 세트생성
캠페인 ID: 120231883282870514
콘텐츠 폴더: C:\Users\hound\OneDrive\바탕 화면\콘텐츠 결과물\영상\26년\신규컨셉폴더
광고세트명: aos_purchase_all_vd_신규컨셉(드디어)_mk1_26.05.15
광고명 패턴: aos_vd_all_신규컨셉(드디어)_mk1_26.05.15
제목: 첫 주문 990원
```
*(폴더 안 mp4 파일들이 순서대로 aos_vd_all_신규컨셉(드디어)1_..., 2_..., 3_... 으로 생성)*

### 예시 1 — 영상 1개, 광고세트 1개 (가장 기본)
```
작업: 소재추가
광고세트 ID: 120231883282870514
영상 경로: C:\Users\hound\OneDrive\바탕 화면\콘텐츠 결과물\영상\26년\신규영상.mp4
광고명: aos_vd_all_신규컨셉(후킹)1_mk1_26.05.14
제목: 첫 주문 990원
```
*(제목만 입력, 문구는 광고세트에서 자동 복사)*

### 예시 2 — 동일 영상, 복수 광고세트 병렬 배포
```
작업: 소재추가
광고세트 ID: 120231883282870514, 120231883282870999, 120231883282871000
영상 경로: C:\Users\hound\OneDrive\바탕 화면\콘텐츠 결과물\영상\26년\신규영상.mp4
광고명: aos_vd_all_신규컨셉(후킹)1_mk1_26.05.14
제목: 첫 주문 990원
문구: |
  드디어! 첫 주문 단 990원으로 시작하세요 🎉
  음식물 쓰레기, 대형 폐기물 분류 없이 한 번에 커버링!
  지금 앱 설치하고 990원 혜택 받아가세요 👇
```
*(영상 업로드 1회 → 3개 광고세트 병렬 생성)*

### 예시 3 — 소재 업데이트 (영상 재사용)
```
작업: 소재업데이트
광고 ID: 120247784894080514
영상 ID: 1369437815015996
제목: 첫 주문 990원
문구: |
  드디어! 첫 주문 단 990원으로 시작하세요 🎉
  음식물 쓰레기, 대형 폐기물, 신고 필요한 쓰레기까지
  분류 없이 한 번에 수거해드리는 커버링!
```

---

## 주의사항

- **ACTIVE 요청 차단**: 자동 세팅은 항상 PAUSED. 활성화는 사람이 직접.
- **토큰 노출 금지**: FACEBOOK_ACCESS_TOKEN은 환경변수로만 처리. 로그·파일에 기록 안 함.
- **영상 업로드 시간**: 100MB 기준 약 2~5분 소요. 복수 광고세트는 영상 ID 재사용으로 단축.
- **광고명 네이밍**: 컨벤션 미준수 시 경고 후 진행. 소급 수정은 Meta 광고 관리자에서.
- **문구 자동 복사**: 광고세트 내 첫 번째 동영상 광고의 문구를 복사. DPA 광고가 있으면 스킵.
