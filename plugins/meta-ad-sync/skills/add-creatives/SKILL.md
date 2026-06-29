---
name: add-creatives
description: 커버링 효율정리 Excel 파일에 이번 주 신규 소재를 자동으로 추가하고 서식을 적용. ver1.xlsx → ver2.xlsx 자동 생성.
argument-hint: "[ver1_파일_경로 (선택)]"
---

## 신규 소재 추가 자동화 가이드

인자: `$ARGUMENTS`

---

### Step 1 — 파일 확인

인자(`$ARGUMENTS`)가 주어진 경우 해당 경로를 입력 파일로 사용한다.
없으면 현재 작업 디렉토리(또는 부모 디렉토리)에서 `커버링_효율정리_*ver1*.xlsx` 패턴 파일을 탐색한다.

```powershell
Get-ChildItem -Path "." -Filter "*ver1*.xlsx" -Recurse -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Select-Object FullName
```

파일을 찾지 못하면 사용자에게 파일 경로를 요청한다.

---

### Step 2 — 소재 정보 수집

사용자에게 아래 정보를 구조화된 형식으로 요청한다. 한 번에 모두 입력받는다.

**질문 예시:**
```
이번 주 추가할 소재 정보를 알려주세요.

[기존 섹션 추가]
시트명 | 마지막소재행 | 합계행 | 첫소재행 | 소재명(들)
예: 메타(AOS) (리타겟) | 43 | 16 | 17 | aos_vd_re_cr_소재명_mk1_26.05.07

[신규 섹션 생성]
시트명 | 세트명 | 소재명(들, 콤마 구분)
예: 메타(AOS) (구매) | aos_purchase_all_vd_dcj_세트명_mk1_26.05.07 | 소재1, 소재2

행 번호가 불확실한 경우, ver1.xlsx 파일을 열고 해당 시트에서 직접 확인하세요.
```

---

### Step 3 — config.json 생성

수집한 정보를 바탕으로 임시 config.json 파일을 생성한다.

config.json 구조:
```json
{
  "input_file": "<ver1_파일_절대경로>",
  "action_note": "신규 추가 (YY.MM.DD)",
  "existing_inserts": {
    "시트명": [
      {"last_ad_row": 43, "total_row": 16, "first_ad_row": 17, "creatives": ["소재명"]}
    ]
  },
  "new_sections": {
    "시트명": [
      {"adset_name": "세트명", "creatives": ["소재1", "소재2"]}
    ]
  }
}
```

단, `existing_inserts` 와 `new_sections` 의 값은 Python dict 형태 리스트로,
core.py 가 읽을 수 있도록 아래 형태로 변환하여 JSON 파일에 저장한다:

```json
{
  "existing_inserts": {
    "메타(AOS) (리타겟)": [[43, 16, 17, ["소재명"]]]
  },
  "new_sections": {
    "메타(AOS) (구매)": [["세트명", ["소재1", "소재2"]]]
  }
}
```

config.json 을 `%TEMP%\covering_config.json` 에 저장한다.

---

### Step 4 — 스크립트 실행

이 SKILL.md 위치를 기준으로 `../../scripts/core.py` 를 찾아 실행한다.

```powershell
$skillDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$coreScript = Join-Path $skillDir "..\..\scripts\core.py"
$configFile = "$env:TEMP\covering_config.json"
python $coreScript $configFile
```

실행이 완료되면 생성된 ver2.xlsx 경로를 확인한다.

---

### Step 5 — 결과 보고

실행 출력에서 `✅ 완료:` 행을 파싱하여 결과 파일 경로를 추출한 뒤 아래 표로 보고한다.

| 항목 | 내용 |
|------|------|
| 원본 파일 | ver1.xlsx 경로 |
| 결과 파일 | ver2.xlsx 경로 |
| 기존 섹션 추가 | N개 소재, N개 시트 |
| 신규 섹션 생성 | N개 세트, N개 시트 |

오류 발생 시: 오류 메시지를 그대로 보여주고, 가능한 원인(파일 잠금, 행 번호 오류, Python 미설치 등)을 안내한다.

---

### 자주 발생하는 오류

| 오류 | 원인 | 해결 |
|------|------|------|
| `FileNotFoundError` | ver1.xlsx 경로가 잘못됨 | 파일 경로를 절대경로로 입력 |
| `KeyError: 시트명` | 시트명이 파일과 다름 | Excel에서 시트명 탭을 직접 확인 |
| 행 번호 오류 | 잘못된 last_ad/total/first_ad | ver1.xlsx 열고 해당 섹션 행 번호 재확인 |
| 파일 열기 실패 | Excel에서 ver2.xlsx가 열려 있음 | Excel을 닫고 재실행 |
