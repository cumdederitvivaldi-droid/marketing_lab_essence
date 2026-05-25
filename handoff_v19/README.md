# 이도형 포트폴리오 v19 — Claude 디자인 핸드오프

마우스 시각 편집을 위해 정리한 v19 패키지입니다. Claude.ai에 이 폴더(또는 tar.gz)를 업로드하면 디자인 도구에서 열어 직접 시각 편집할 수 있습니다.

```
Owner       이도형 (Lee Dohyeong) · Brand Accelerator · Growth Marketer
Current     (주)커버링 · 마케팅 리드
Email       cumdederitvivaldi@gmail.com
Phone       010-7589-9117
Version     v19 (2026.05.26)
Slides      17개 / 1920×1080 / Pretendard + JetBrains Mono
```

---

## 0. 파일 구성

| 경로 | 내용 |
|---|---|
| `portfolio_v19.html` | 단일 HTML 파일 — 17 슬라이드 (1920×1080) |
| `assets/` | 슬라이드에 임베드된 자산 22종 |
| `README.md` | 이 문서 (디자인 시스템 + 편집 가이드) |

### assets/ 자산 매핑

| 파일 | 사용 슬라이드 |
|---|---|
| `profile_dohyeong.jpg` | p2 PROFILE |
| `covering_tier_ssiat.png` | p4 그로스 등급제 좌측 모바일 |
| `nb_p4_tier_table.png` | p4 그로스 등급제 우측 (등급별 혜택 표) |
| `nb_p5_arpu_1/2/3.png` | p5 ARPU 상세페이지 3장 |
| `cvr_alimtok_d16/d45.png` | p6 CVR D16·D45 발송 알림톡 |
| `nb_p6_cvr_metrics/insight.png` | p6 CVR 도입 전후 지표 + 인사이트 배너 |
| `nb_p7_content_metrics.png` | p7 콘텐츠 누적 9 지표 표 |
| `yt_990won/ilban/dowajusyeoya/hanyakjae.jpg` | p7 YouTube Shorts 4종 영상 썸네일 |
| `nb_p8_dormant_metrics.png` | p8 휴면 CRM D22·D29·D61 효과 표 |
| `nb_p9_payback_table.png` | p9 페이백 쿠폰 사용 vs 미사용 M1~M6 표 |
| `nb_p9_payback_lp1/lp2.png` | p9 페이백 캠페인 LP 2종 |
| `bridge_lp_1/2/3.png` | p10 Web2App 브릿지 LP 3종 |

---

## 1. 디자인 시스템 — "Cobalt Edge" (v14부터 정착)

### 컬러

| 토큰 | 값 | 용도 |
|---|---|---|
| `--cobalt` | `#1E29FF` | **Primary** — 헤드라인 강조 / 데이터 포인트 / 칩 |
| `--cobalt-deep` | `#0F19D8` | hover · 진한 강조 |
| `--cobalt-soft` | `#EEF1FF` | 페이지 틴트 배경 |
| `--lime` | `#D6FF3D` | **Accent** — 결과 칩 / 라임 underline / 강조선 |
| `--lime-deep` | `#B3DA1C` | hover |
| `--ink` | `#0A0F2E` | 다크 슬라이드 BG / 결과 카드 / chrome 배경 |
| `--bg` | `#F7F9FD` | 페이지 라이트 BG |
| `--text` | `#0F172A` | 본문 검정 |
| `--text2` | `#1F2837` | 보조 본문 |
| `--sub` | `#5B6675` | 캡션 |
| `--lavender` | `#C7CBE3` | 다크 위 보조 텍스트 |

**카테고리 컬러** (영역별 chip 색)
- 그로스 `#10C390` (민트)
- CRM `#EF4444` (빨강)
- 퍼포먼스 `#1E29FF` (코발트)
- 콘텐츠 `#F5B400` (선)
- 바이럴 `#DB2777` (마젠타)
- AI 활용 `#7C3AED` (보라)
- 팀 리딩 `#475569` (잉크 그레이)

### 타이포그래피

- **Pretendard Variable** (한국어·라틴 통합) — 본문·헤드라인
- **JetBrains Mono** — 숫자·라벨·eyebrow·코드

스케일:
- 디스플레이 (cover/big stat): 64~128px Black
- 헤드라인: 32~44px Bold
- 본문: 17~21px Regular/Medium
- 캡션·eyebrow: 11~13px Mono Bold UPPERCASE

### 시그니처 의식 (v7 cobalt 유산)

- **모노 eyebrow + 라임 underline** — 모든 카테고리 슬라이드
- **카테고리 칩** `<span class="cat-chip">` — 컬러 박스 + 한글+영문
- **✦ 스파클** — 다크 슬라이드 액센트
- **리본** — cover (p1) + CTA (p17)만
- **결과 카드** `.result` — 잉크 다크 BG + 라임 KPI 숫자

### 레이아웃 그리드

- 슬라이드: 1920×1080 (고정)
- 외곽 패딩: 96px (좌우) / 56~88px (상하)
- `.body2`: `grid-template-columns: 720px 1fr; gap: 40px` (좌측 본문 720 / 우측 시각자산 ~970px)
- 카테고리 칩 헤더: `<div class="cat-row">` 안에 칩 + 서브 카운터

### 핵심 컴포넌트 클래스

| 클래스 | 역할 |
|---|---|
| `.slide` | 1920×1080 슬라이드 컨테이너 |
| `.slide.dark` / `.slide.cobalt` | 다크 잉크 / 코발트 풀스크린 |
| `.hd-tight` | 슬라이드 상단 헤더 (eyebrow + page-title) |
| `.body2` | 좌우 2-컬럼 본문 그리드 |
| `.col-l` / `.col-r` | 좌측 본문 / 우측 시각자산 |
| `.cat-row` + `.cat-chip` + `.cat-meta` | 카테고리 식별 라벨 |
| `.p-title` / `.p-desc` | 본문 헤드라인 / 디스크립션 |
| `.sec-label` / `.sec ul li` | 본문 소단락 라벨 + 목록 |
| `.result` + `.kpi-num` + `.kpi-label` | 결과 KPI 카드 (잉크 BG) |
| `.chart-card` + `.chart-title` | 차트·표 카드 |
| `.cmp-table` | 도입 전 vs 도입 후 비교 표 |
| `.phone-frame` + `.scr` | 모바일 캡처 액자 |
| `.yt-card` | YouTube 영상 카드 |
| `.skill-block` | p3 7개 역량 블록 |
| `.kicker` | 다크 슬라이드 mono eyebrow |
| `.ribbon` / `.sparkle` | cover/CTA 액센트 |

---

## 2. 슬라이드 17개 구성

| # | 슬라이드 ID | 내용 | 배경 |
|---|---|---|---|
| 1 | `#p1` | HERO — 풀 퍼널 그로스 40배 | 코발트 다크 + 리본 + 스파클 |
| 2 | `#p2` | PROFILE — 5Y 4M 4사 + Stack/Edu/Awards | 잉크 다크 (좌측 사진 + 우측 패널) |
| 3 | `#p3` | CAPABILITY — 7 역량 블록 + 매출 18.9억 차트 | 라이트 |
| 4 | `#p4` | 그로스 ① 등급제 → M1 +41%p · LTV ×18.1 | 라이트 |
| 5 | `#p5` | 그로스 ② ARPU → 객단가 +17.6% | 라이트 |
| 6 | `#p6` | 그로스 ③ CVR → D45 +231% | 라이트 |
| 7 | `#p7` | 콘텐츠 — 페인포인트 공략 / 영상 4종 / 누적 9 지표 | 라이트 |
| 8 | `#p8` | CRM ① 휴면 → 12.3억 회수 | 라이트 |
| 9 | `#p9` | CRM ② 페이백 → M1 +52%p · M6 +28%p | 라이트 |
| 10 | `#p10` | 퍼포먼스 ① Web2App → 매출 +187% | 라이트 |
| 11 | `#p11` | 퍼포먼스 ② T-ROAS → CVR 30.7% | 라이트 |
| 12 | `#p12` | 바이럴 ① 단순 협업 → 오가닉 +59% | 라이트 |
| 13 | `#p13` | 바이럴 ② PA 사이클 → CPA -66% | 라이트 |
| 14 | `#p14` | AI 활용 — Claude CLI 자동화 인프라 | 라이트 |
| 15 | `#p15` | 팀 리딩 — 1인 → 5인 팀 빌딩 | 라이트 |
| 16 | `#p16` | 지난 이력 (이삼오구 27억 + 나인투식스 + 와이즈플래닛) | 라이트 |
| 17 | `#p17` | OUTRO + CONTACT — "0 to 1을 귀사에서도" | 코발트 다크 |

---

## 3. 마우스 시각 편집 안내

### Claude 디자인에서 작업하기
1. 이 폴더(또는 tar.gz)를 Claude.ai 디자인 환경에 업로드
2. `portfolio_v19.html`을 열기
3. 시각 편집기에서 슬라이드 요소를 마우스로 드래그·리사이즈
4. 변경 결과를 export 또는 동일 형식으로 다시 저장

### 편집 모드 (브라우저 F12 옵션)
HTML 자체에 `?edit=1` 쿼리 활성 helper 포함:
- URL 끝에 `?edit=1` 붙이면 모든 핵심 요소에 라임 점선 outline + 클릭 시 selector + 현재 CSS 자동 추출

### 자주 조정하는 속성

| 속성 | 위치 | 권장 범위 |
|---|---|---|
| `body2 grid-template-columns` | CSS 277행 (`720px 1fr`) | 좌측 640~820px |
| `phone-frame aspect-ratio` | CSS 269행 (`9/16`) | 9/16 ~ 9/14 |
| 우측 LP 그리드 `height` | p9 col-r `520px` 등 | 400~700px |
| `padding`·`gap` | 각 슬라이드 inline | 8~32px |
| `font-size` 본문 | `.sec li` 22px / `.p-desc` 19px | 17~24px |

---

## 4. 변경사항을 코드로 되돌리기

Claude 디자인에서 시각 편집 후, 변경된 부분을 텍스트로 정리해 Claude Code(개발 환경)로 전달하면 그대로 반영됩니다:

```
v20 요청 사항:
- p4 .col-r grid-template-columns: 280px 1fr → 220px 1fr
- p9 LP height: 520px → 640px
- p7 영상 그리드 height: 720px → 760px
```

---

## 5. 사용 폰트 / CDN

- Pretendard Variable: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css`
- JetBrains Mono: `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap`

폰트 로딩 실패 시 시스템 산세리프로 fallback.

## 6. 라이브 미리보기 URL (참고)

GitHub Pages를 통한 라이브 미리보기:
- 일반: `https://raw.githack.com/hound600al/marketing-lab-26-05-09/feat/portfolio-v13/이도형_포트폴리오_v19.html`
- 편집 모드: `?edit=1` 추가
