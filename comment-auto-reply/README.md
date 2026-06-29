# 댓글 자동 답글 (comment-reply)

메타(인스타 광고 인박스)·틱톡(Business Suite) 댓글을 수집해, 기준 스프레드시트대로
답글 **초안**을 만들고, 사람이 검토·승인하면 게시하는 도구.

## 구성
```
comment-reply/
├── 댓글관리_실행.bat              # ★ 화면 프로그램(GUI) 실행 — 버튼으로 수집·검토·게시
├── 설치.bat                       # 팀원 PC 최초 설치 (패키지/브라우저 자동 설치)
├── config.json                    # 계정·시트·API키 설정 (경로 자동탐지)
├── assets/
│   ├── 크롬_디버그_실행.bat        # 전용 크롬(로그인용) 실행기
│   ├── 점검.bat                   # 설치 자가진단 (무엇이 빠졌는지 ✅/❌)
│   ├── 1_초안생성.bat             # 수집 → AI 초안 → 검토 엑셀 열기
│   └── 2_게시.bat                 # 승인 반영 → 미리보기 → 게시(+하트)
├── scripts/
│   ├── gui.py                    # 화면 프로그램(Tkinter) — 버튼/표 UI
│   ├── cdp.py / config.py / launch_chrome.py   # 공통 헬퍼·설정·크롬 실행
│   ├── read_rules.py             # 기준 시트 → out/rules.json
│   ├── scrape_comments.py        # 댓글 수집 → out/comments.json
│   ├── generate_drafts.py        # 답글 초안 → out/drafts.json (키 있으면 AI, 없으면 템플릿)
│   ├── template_engine.py        # 키 없이 동작하는 템플릿 초안 엔진(무료 폴백)
│   ├── make_review_xlsx.py       # 검토용 엑셀 생성 → out/검토_답글.xlsx
│   ├── apply_review.py           # 엑셀 승인결과 → out/drafts_approved.json
│   ├── post_replies.py           # 승인분 게시+하트 (--commit 없으면 dry-run)
│   └── check_setup.py            # 설치 자가진단
├── references/
│   ├── selectors.md              # 라이브 셀렉터 메모 (유지보수)
│   └── rules_snapshot.json       # 답글 기준 시트 스냅샷 (gcloud 없이 사용)
├── out/    (자동 생성)            # rules/comments/drafts/xlsx, 디버그 덤프
└── state/replied.json (자동 생성) # 이미 답글 단 댓글 → 중복 방지
```

## 팀원 PC 설치 (최초 1회) — Claude Code 불필요
1. 이 `comment-reply` 폴더를 통째로 복사해 옵니다.
2. `설치.bat` 더블클릭 → Python 패키지(playwright/gspread/anthropic/openpyxl) + 크로미움 자동 설치 (끝나면 자동 점검).
3. (선택) `gcloud` 는 **없어도 됩니다** — 답글 기준은 동봉된 스냅샷(`references/rules_snapshot.json`)으로 동작.
   기준 시트를 직접 최신화하려는 담당자만 `gcloud auth login`.
4. **설정 파일 만들기**: `config.example.json` 을 복사해 같은 폴더에 `config.json` 으로 저장.
   - `config.json` 은 `.gitignore`라 GitHub에 안 올라갑니다(비밀키 보호).
   - 같은 커버링 계정이면 계정값은 그대로 두면 됩니다.
5. **Anthropic API 키 — 선택사항** (없어도 동작):
   - **키 없이**: CS 가이드 기반 *템플릿*으로 초안 생성(무료). 자주 나오는 질문은 커버, 유연성은 낮음 → 엑셀에서 수정.
   - **키 있으면**: AI가 더 자연스럽고 유연한 답글 생성. 환경변수 `ANTHROPIC_API_KEY` 또는 `config.json` 의 `anthropic_api_key`.
     - 비용 아끼려면 `config.json` 의 `anthropic_model` 을 `claude-haiku-4-5` 로(월 수천원 수준).
     - **팀 공용 키 배포**: 팀장이 키를 채운 `config.json` 을 슬랙 DM·드라이브 등 *사설 경로*로 전달(GitHub 금지).
   - 키 발급: https://console.anthropic.com/ → API Keys

## 사용법 (A) — 화면 프로그램 (가장 쉬움, 추천)
폴더의 **`댓글관리_실행.bat`** 더블클릭 → 창이 뜹니다.
1. **[전용 크롬 열기]** → 뜨는 크롬에서 Meta/TikTok/Google 로그인 (최초 1회)
2. **[① 댓글 수집 + 초안 생성]** → 댓글이 표에 뜨고 답글 초안이 자동 채워짐
3. 표에서 초안 확인 — 행 **더블클릭**으로 수정, **게시 칸 클릭**으로 체크/해제 (노랑=확인필요)
4. **[② 게시 (답글 + 하트)]** → 체크된 댓글에 답글 + 하트 게시

## 답글 기준 설정 (별도 창)
**`답글기준_설정.bat`** (또는 메인 프로그램의 **[⚙ 답글 기준 설정]** 버튼):
- **API 키 / 모델** (haiku=저렴, opus=최고품질) — config.json
- **답글 톤·지침** — AI 답글에 반영 (예: "존댓말만, 이모지 1개, 환불은 채널톡 안내")
- **유형별 기본 답글** — 무료(키 없는) 템플릿 모드에 반영 (칭찬·질문·컴플레인 등 문구 직접 수정)
- 저장 위치: 톤·템플릿=`reply_settings.json`(공유 가능), 키=`config.json`(비공개)

## 사용법 (B) — 엑셀/배치 (대안)
1. `assets/크롬_디버그_실행.bat` → 로그인
2. `assets/1_초안생성.bat` → 검토 엑셀 자동 열림 → 게시할 행 '승인'칸에 O, 저장
3. `assets/2_게시.bat` → 미리보기 후 실게시
> Claude Code가 있으면 `/comment-reply` 로 대화형 처리도 가능(선택).

## 안전장치 / 한계
- 같은 댓글에 두 번 답글 안 달림(`state/replied.json`).
- 답글 사이 8~25초 랜덤 지연, 1회 최대 10건(`--limit`).
- **부정/항의/모호 댓글은 자동 게시 금지**(`needs_human`).
- ⚠ 브라우저 자동화는 Meta/TikTok 약관상 제한 → 계정 정지 리스크. 소량으로 시작.
- ⚠ Meta/TikTok UI 변경 시 `references/selectors.md` 보고 셀렉터 보정 필요.

## 셀렉터가 안 맞을 때
```
python scripts/scrape_comments.py --snapshot
```
→ `out/debug_meta.html` / `out/debug_tiktok.html` 를 열어 실제 DOM 확인 후
scrape_comments.py / post_replies.py 의 `SEL_*` 상수를 보정.

## 무인 스케줄링 (매일 9시·7시 초안 자동 준비)
게시는 검토가 필요하므로 **초안 준비까지만 무인**으로 돌립니다. 9시/7시에 수집→초안→검토엑셀이 자동 준비되고, 사람은 도착해서 엑셀만 검토→`2_게시.bat`.
- 등록: `assets/스케줄_등록.bat` (Windows 작업 스케줄러에 09:00/19:00 등록, 절전이면 깨워서 실행)
- 해제: `assets/스케줄_해제.bat`
- 무인 작업: `assets/auto_draft.bat` (크롬 자동 실행→수집→초안→`out/검토_답글.xlsx`. 로그: `out/_auto_draft.log`)
- ⚠ **한계**: PC가 켜져 있거나 절전 상태여야 동작(절전은 깨움). **완전히 꺼져 있으면 실행 안 됨.**
  PC를 끄는 환경에서 진짜 24h 무인이 필요하면 → 클라우드/상시서버에 로그인 크롬 상주(별도 작업).
- 게시는 절대 자동화하지 않습니다(오답·계정정지 방지). 초안만 준비됩니다.
