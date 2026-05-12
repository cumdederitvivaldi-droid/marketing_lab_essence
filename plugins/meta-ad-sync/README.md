# meta-ad-sync — 커버링 효율정리 신규 소재 추가 자동화

매주 메타 광고 소재를 효율정리 Excel(ver1.xlsx)에 추가하고 서식을 적용해 ver2.xlsx를 자동 생성하는 도구입니다.

---

## 사전 요구사항

| 항목 | 버전 |
|------|------|
| Python | 3.8 이상 |
| openpyxl | 자동 설치됨 |

Python이 없으면 [python.org](https://www.python.org/downloads/) 에서 설치 후 **"Add Python to PATH"** 체크.

---

## 설치 방법

```bash
# 1. 레포 클론
git clone https://github.com/hound600al/marketing-lab-26-05-09.git

# 2. 플러그인 폴더 이동
cd marketing-lab-26-05-09/plugins/meta-ad-sync

# 3. 의존성 설치
pip install -r requirements.txt
```

---

## 사용 방법 — 2가지

### 방법 A: Claude Code 스킬 (`/add-creatives`)

Claude Code가 설치된 경우, 이 레포를 플러그인으로 추가하면 `/add-creatives` 명령어를 사용할 수 있습니다.

```
/add-creatives C:\경로\커버링_효율정리_26.05.12(...)ver1.xlsx
```

Claude가 소재 정보를 물어보고, 자동으로 스크립트를 실행합니다.

---

### 방법 B: 직접 실행 (Claude 없이)

1. `config.example.py` 를 **`config.py`** 로 복사
2. `config.py` 열어서 소재 정보 입력
3. **`실행하기.bat`** 더블클릭

```python
# config.py 예시
INPUT_FILE = "C:\\Users\\이름\\바탕화면\\퍼포먼스\\커버링_효율정리_26.05.12(26.05.05-26.05.11)ver1.xlsx"
ACTION_NOTE = "신규 추가 (26.05.12)"

EXISTING_INSERTS = {
    "메타(AOS) (리타겟)": [
        (43, 16, 17, ["aos_vd_re_cr_심지어(드디어)2_mk1_26.05.07"]),
    ],
}

NEW_SECTIONS = {
    "메타(AOS) (구매)": [
        ("aos_purchase_all_vd_dcj_고효율소재모듬_mk1_26.05.07", [
            "aos_vd_all_dcj_청소부2500(신고)1_mk1_26.05.07",
        ]),
    ],
}
```

---

## 행 번호 확인 방법 (EXISTING_INSERTS)

기존 섹션에 소재를 추가할 때 행 번호 3개가 필요합니다.

| 파라미터 | 설명 | Excel에서 확인 |
|----------|------|----------------|
| `last_ad_row` | 해당 섹션 마지막 소재 행 | 섹션의 맨 마지막 소재 행 번호 |
| `total_row` | TOTAL 합계 행 | C열에 "TOTAL"이 있는 행 |
| `first_ad_row` | 해당 섹션 첫 소재 행 | TOTAL 바로 아래 행 |

```
예시 (Excel 보기):
  행 16: [TOTAL]  ← total_row = 16
  행 17:  소재A   ← first_ad_row = 17
  행 18:  소재B
  ...
  행 43:  소재Z   ← last_ad_row = 43
  행 44: ← 여기에 새 소재가 삽입됨
```

---

## 결과물

- 입력: `커버링_효율정리_YYMMDD(...)ver1.xlsx`
- 출력: `커버링_효율정리_YYMMDD(...)ver2.xlsx`
  - 신규 소재 행 추가 (VLOOKUP 수식 자동 생성)
  - TOTAL SUM 범위 자동 확장
  - 서식(폰트·채우기·테두리) 자동 적용

---

## 파일 구조

```
meta-ad-sync/
├── .claude-plugin/
│   └── plugin.json          # Claude Code 플러그인 메타데이터
├── skills/
│   └── add-creatives/
│       └── SKILL.md         # /add-creatives 스킬 정의
├── scripts/
│   └── core.py              # 핵심 로직 (추가 + 서식)
├── config.example.py        # 주간 설정 템플릿
├── 실행하기.bat              # Windows 원클릭 실행
├── requirements.txt
└── README.md
```

---

## 문의

팀 내 문의: hound600al (Notion 혹은 Slack)
