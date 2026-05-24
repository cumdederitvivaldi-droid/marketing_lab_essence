# tiktok-airbridge-report

TikTok 광고 매체 + Airbridge MMP 데이터를 광고세트 단위로 묶은 **수식 기반 주간 효율 리포트 xlsx**로 자동 생성하는 Claude Code 플러그인.

`/tiktok-report 2026-05-19 2026-05-25` 한 줄 → 데이터 수집부터 xlsx 저장까지 자동.

## 결과 xlsx 구조

| 시트 | 역할 |
|---|---|
| **TikTok 효율** | 메인 view. 광고세트별 그룹화 (📁 헤더 → 💬 이전 주 진행액션 메모 → 광고 row들 VLOOKUP → TOTAL SUM → 빈 row → 다음 그룹). 26 컬럼 (광고비/노출/클릭/매체값/CPM/CPC/CTR/3개 CVR/CPI/매체 CPA 2개/MMP값 3개/MMP CPA 2개/**보정 구매 CPA**/일예산/**변경될 예산**). 구매 CPA 컬럼은 광고세트별 그라데이션. |
| **설정** | 보정 계수 입력 (B2/B3/B4). `보정 구매 CPA = W × B$2 / (B$3 / B$4)` 함수 사용. |
| **TikTok RAW** | TikTok 광고매체 raw export. 매주 row 3↓ 교체하면 view 자동 재계산. |
| **Airbridge RAW** | Airbridge Actuals raw (Channel=tiktok 필터). 매주 row 3↓ 교체. |

## 🚀 자동 설치 (Windows 한 줄)

새 PowerShell 창에서:

```powershell
irm https://raw.githubusercontent.com/hound600al/marketing-lab-26-05-09/main/plugins/tiktok-airbridge-report/install.ps1 | iex
```

스크립트가 자동으로:
1. 사전 요구사항 검사 (git/node/python/claude)
2. `openpyxl` pip install
3. TikTok Ads + Airbridge MCP 등록
4. marketplace 등록 + 플러그인 설치
5. `TIKTOK_ADVERTISER_ID` / `AIRBRIDGE_APP_NAME` 환경변수 (사용자 입력 받음)
6. 마지막 안내 — Claude Code 재시작 + `/mcp` OAuth + `/tiktok-report` 사용

**사전 요구사항** (스크립트가 검사):
- [Git for Windows](https://git-scm.com/download/win)
- [Node.js 18+](https://nodejs.org)
- [Python 3.10+](https://www.python.org/downloads/)
- Claude Code: `npm install -g @anthropic-ai/claude-code`

---

## 수동 설치 (단계별)

### 1. 사전 준비
- **Python 3.10+** + `pip install openpyxl`
- **Claude Code** 설치 (`npm install -g @anthropic-ai/claude-code`)
- **TikTok Ads MCP** 등록: `claude mcp add --transport http tiktok-ads https://tiktok-ads.mcp.pipeboard.co/`
- **Airbridge MCP** 등록: `claude mcp add --transport http airbridge https://mcp.airbridge.io/mcp`
- Claude Code에서 `/mcp` → 두 MCP 각각 OAuth 인증

### 2. 플러그인 marketplace 등록 + 설치

PowerShell 또는 cmd:
```powershell
claude plugin marketplace add hound600al/marketing-lab-26-05-09
claude plugin install tiktok-airbridge-report@marketing-lab-26-05-09
```

또는 Claude Code 채팅에서:
```
/plugin marketplace add hound600al/marketing-lab-26-05-09
/plugin install tiktok-airbridge-report@marketing-lab-26-05-09
```

### 3. 환경변수 설정 (PowerShell, 1회만)

```powershell
[Environment]::SetEnvironmentVariable("TIKTOK_ADVERTISER_ID", "<당신 TikTok 광고주 ID>", "User")
[Environment]::SetEnvironmentVariable("AIRBRIDGE_APP_NAME", "<당신 Airbridge 앱 subdomain>", "User")
# 선택
[Environment]::SetEnvironmentVariable("TIKTOK_REPORT_OUT_DIR", "C:\path\to\output", "User")
```

- TikTok 광고주 ID: `ads.tiktok.com` URL의 `aadvid=` 파라미터
- Airbridge 앱 subdomain: `app.airbridge.io/app/<이값>/...`
- 새 PowerShell 창부터 반영

## 사용

### 슬래시 명령 (권장)

```
/tiktok-report 2026-05-19 2026-05-25
```

Claude가 알아서:
1. TikTok / Airbridge MCP 호출로 데이터 수집
2. 이전 주 결과 xlsx에서 진행액션 메모 추출 (있으면)
3. xlsx 빌드 → 결과 경로 안내

### 직접 빌드 (이미 JSONL 데이터를 갖고 있을 때)

```powershell
$PluginRoot = (Get-ChildItem "$env:USERPROFILE\.claude\plugins" -Recurse -Filter "build_template_xlsx.py" -ErrorAction SilentlyContinue | Select-Object -First 1).DirectoryName
python "$PluginRoot\build_template_xlsx.py" --start 2026-05-19 --end 2026-05-25
```

### 수동 갱신 (Excel만 쓸 때)

생성된 xlsx 파일을 열고:
1. `TikTok RAW` 시트 row 3↓ 데이터를 새 주차로 교체
2. `Airbridge RAW` 시트 row 3↓ 교체
3. `설정` 시트의 보정 계수 (B2/B3/B4) 갱신
4. `TikTok 효율` 시트가 자동 재계산됨

## 핵심 매핑

`TikTok 효율` 시트 모든 셀이 VLOOKUP / SUM / 계산식:
- A열: `=VLOOKUP($C, 'TikTok RAW'!$A:$L, 4, 0)` (광고 이름)
- B열: `=VLOOKUP($C, 'TikTok RAW'!$A:$L, 2, 0)` (캠페인)
- D~I열: 매체 raw VLOOKUP
- J~R열: CPM/CPC/CTR/CVR/CPI/CPA 계산
- S~U열: MMP raw VLOOKUP from Airbridge RAW
- V~W열: MMP CPA 계산
- X열: `=W × 설정!$B$2 / (설정!$B$3 / 설정!$B$4)` (보정 구매 CPA)
- TOTAL row: `=SUM(D{start}:D{end})` 등

광고 ID(C열)만 직접 입력값. 두 RAW 시트의 ID와 매칭.

## 디렉토리 구조

```
tiktok-airbridge-report/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   └── tiktok-report.md      ← 슬래시 명령 정의
├── scripts/
│   ├── build_template_xlsx.py        ← 메인 빌더 (CLI)
│   ├── extract_memos_from_template.py  ← 이전 주 메모 추출
│   └── extract_correction.py          ← 보정 계수 추출
├── README.md
└── requirements.txt
```

## 환경변수 정리

| 변수 | 필수 | 설명 |
|---|---|---|
| `TIKTOK_ADVERTISER_ID` | ✓ | TikTok 광고주 ID |
| `AIRBRIDGE_APP_NAME` | ✓ | Airbridge 앱 subdomain |
| `TIKTOK_REPORT_DATA_DIR` | | JSONL 저장 위치 (기본 `~/.tiktok-airbridge-report/data`) |
| `TIKTOK_REPORT_OUT_DIR` | | xlsx 출력 위치 (기본 `~/Downloads/{YYYY-MM(end)}/tiktok-reports`) |
| `TIKTOK_REPORT_FILE_PREFIX` | | 파일명 접두어 (기본 `TikTok_효율리포트`) |

## 라이선스 / 문의

MIT. Issue: https://github.com/hound600al/marketing-lab-26-05-09/issues
