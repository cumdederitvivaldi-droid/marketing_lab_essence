# 이도형 Brand Accelerator — Design System

이도형(Lee Dohyeong) — 5년차 그로스 마케터의 개인 포트폴리오 디자인 시스템입니다. 채용 면접용 슬라이드 덱, 포트폴리오 웹사이트, 인쇄물 등 모든 자기 PR 자산에서 일관된 비주얼 톤을 유지하기 위한 토큰·자산·UI 키트 모음입니다.

```
Owner       이도형 (Lee Dohyeong) · Brand Accelerator · Growth Marketer
Email       hound600al@naver.com
Phone       010-7589-9117
Location    서울 은평구
Notion      https://fuschia-rondeletia-182.notion.site/35d1baa073c980b88f2cf25ff933aad0
Current     (주)커버링 · 마케팅 리드 (2024.05 ~ 재직 중)
```

---

## 0. SOURCES — 입력 자료

이 디자인 시스템은 아래 자료를 종합하여 만들어졌습니다.

| 자료 | 위치 | 내용 |
|---|---|---|
| **공개 노션 포트폴리오** | [fuschia-rondeletia-182.notion.site/...](https://fuschia-rondeletia-182.notion.site/35d1baa073c980b88f2cf25ff933aad0?pvs=74) | 메인 포트폴리오 — Profile, Work Performance(6단계 그로스 스토리), Skills, How I Work, Contact |
| **이력서 PDF** | `uploads/resume_dohyeong.pdf` | 5년 4개월 경력, 회사별 성과 |
| **포트폴리오 템플릿 PDF** | `uploads/portfolio_template.pdf` | 초기 비주얼 참조 (네온 옐로우+블랙) — 최종 팔레트는 다음 단계로 교체 |
| **HeyDealer 비주얼 레퍼런스** | `assets/ref_heydealer_*.png` | 최종 컬러 시스템의 베이스 — 코발트 블루 + 잉크 블랙 |
| **GitHub 차트 코드** | [hound600al/marketing-lab-26-05-09](https://github.com/hound600al/marketing-lab-26-05-09) | 본인이 실제로 만든 마케팅 대시보드/차트 코드 — 차트 스킨 베이스로 활용 (`source_charts/`) |
| **커버링 Figma 작업물** | `assets/covering_*.png` | 등급제, 8kg 초과 할인, 연말 청소결산, Lucky Clover, 모바일 등급 화면 — 실제 직접 제작한 결과물 |
| **프로필 사진** | `assets/profile_dohyeong.jpg` | 2025 스튜디오 촬영 본인 사진 |

> **추천:** 이 시스템으로 새 디자인을 만드는 사람은 위 노션 포트폴리오를 먼저 한 번 훑어보세요. 톤과 디테일의 출처가 여기 있습니다. GitHub 차트 레포(`source_charts/` 폴더 안에 임포트되어 있음)에는 동일 인물이 직접 작성한 Chart.js 코드 23개가 들어있어, 데이터 시각화 슬라이드를 새로 만들 때 좋은 참조가 됩니다.

---

## 1. CONTENT FUNDAMENTALS — 콘텐츠 작법

### 톤 & 보이스
한 줄 요약: **"숫자로 말하는 자신감, 결과로 증명하는 겸손함"**

- **데이터-퍼스트 (Data First)** — 모든 주장은 정량 수치로 뒷받침됩니다. "월 매출 40배 성장", "CPI –72.8%", "LTV 18.1×"처럼 구체적 숫자가 앞장섭니다.
- **실행자 시점 (Operator Voice)** — 관념보다는 동사. "기획했다, 집행했다, 만들었다, 설득했다, 직접 운용했다." 모든 성과 옆에 본인의 행위가 붙습니다.
- **솔직한 1인칭** — "저는 ~합니다" 체. 과시 없이, 본인이 한 일과 못 한 일을 구분해서 표현합니다. (예: 스킬 자기 평가에서 AppsFlyer·Mixpanel은 "하"로 솔직히 표기)
- **결과 → 과정 → 학습** 순서 — 헤드라인은 결과로 잡고, 본문에서 어떻게 그 결과를 만들었는지 펼치고, 끝에 다음 단계로 무엇을 배웠는지 정리합니다.

### 호칭 / 인칭
- **1인칭 평서체 + 존대** — "~했습니다", "~이끌었습니다", "~만들어냈습니다"
- 회사명은 정식 명칭 그대로: (주)커버링, (주)이삼오구, (주)와이즈플래닛컴퍼니, 주식회사나인투식스
- 본인 호칭: **이도형** / 영문은 **Lee Dohyeong** (LEE DOHYEONG 대문자 표기는 시그니처 마크용도)

### 표기 규칙
| 케이스 | 표기 |
|---|---|
| 숫자 단위 | 한국어 단위 그대로 (성장지수 100, +230%, 12,312명) — 단, 큰 숫자는 mono 폰트 + tabular-nums |
| 백분율 | `–72.8%` (마이너스는 en-dash, 부호 + 숫자 + %) |
| 배수 | `40×`, `18.1×` (소문자 x가 아닌 `×` 기호) |
| 원/달러 | `₩2,169`, `4.5억`, 작은 단위 표기는 mono |
| 도구명 | 영문 원어 그대로 — Meta · Google Ads · TikTok · BigQuery · Figma |
| 슬래시 구분 | ` · ` (가운데 점, 양쪽 공백) — 영역·역할·도구 나열 시 |
| 해시태그 | `#데이터드리븐` `#실행력` `#그로스해킹` `#1인마케터→팀리드` |

### 이모지 사용 규칙
**제한적으로 사용합니다.** 노션 포트폴리오의 섹션 헤더와 그로스 6단계 스토리에서만 의도적으로 사용:

- 섹션 헤더: 🔎 Profile · 👩🏻‍💻 Work Performance · ⚒️ Skills · 🙋🏻 How I Work · 👋 Contact
- 6단계 인디케이터: 🎯 (1단계 소구점) · 🏅 (2-1 등급제) · ⚖️ (2-2 AOV) · 🎲 (3 멀티채널) · 🤝 (4 인플루언서) · 🗺️ (5 지역확장) · 👥 (6 팀빌딩)
- 강조 화살표 / 체크: ✅ (성과 결과) · → · ➡️ (다음 단계) · ⚠️ (경고/이슈)

**남용 금지:** 본문 인라인 텍스트에는 이모지를 쓰지 않습니다. 데이터 카드/차트에는 절대 쓰지 않습니다.

### 카피 예시 (실제 노션에서 가져온 구절)

**헤드라인 — 결과부터:**
> "직접 만든 콘텐츠로 대규모 누적 매출 성장(예측), 앱 서비스 월 매출 40배 성장(예측)"

**섹션 헤더 — 의문문으로 호기심 유도:**
> "팔수록 적자가 커지는 구조, 어떻게 뒤집었을까?"

**스토리 도입 — 병목부터 솔직히:**
> "병목: 마케터도, 소재도 없었다. 입사 당시 전담 마케터가 없었습니다..."

**전환점 인용 — 진짜 한 줄 인사이트:**
> "리뷰에서 발견한 한 줄이 방향을 바꿨습니다.<br>*'상한 반찬통 버릴 때 정말 유용해요'*"

**마무리 — 다음 단계로의 학습 포인트:**
> "💡 1단계 → 2단계: CPI를 낮추는 건 성공했지만, 더 큰 성장을 가속화하기 위해 광고비를 증액하려고 했지만 공헌이익률이 적자인 구조에서는 광고를 늘릴수록 적자가 깊어진다는 것을 깨닫게 됐습니다."

---

## 2. VISUAL FOUNDATIONS — 비주얼 기본 원칙

### 컬러 시스템

**팔레트 결정 근거:** HeyDealer(heydealer.com)의 코발트 블루 + 잉크 블랙 조합을 베이스로, 커버링의 실제 브랜드 액센트(민트 그린·코인 옐로우)를 데이터/CTA 강조에 사용합니다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--blue-500` | `#2D5BFF` | **Primary** — 헤드라인 강조, CTA, 데이터 포인트 |
| `--blue-600` | `#1B45E0` | hover/pressed |
| `--blue-50` | `#EEF3FF` | 페이지 틴트 배경 |
| `--ink-800` | `#131A26` | **Primary text** — 본문 어두운 텍스트 |
| `--ink-900` | `#0A0E16` | Slide dark background |
| `--ink-500` | `#5B6675` | 보조 텍스트 |
| `--ink-50` | `#F7F9FD` | 페이지 배경 (페이퍼) |
| `--mint-500` | `#10C390` | **Positive metric** — 성장률, 절감, 성공 |
| `--sun-500` | `#F5B400` | Promo accent, 990원 같은 가격 강조 |
| `--rose-500` | `#EF4444` | **Negative metric** — 손실, 이탈, 경고 |

전체 토큰: `colors_and_type.css` 참조.

### 타이포그래피

**메인 폰트: Pretendard Variable** (orioncactus/pretendard, CDN 임포트)
- 한국어·라틴 통합 모던 산세리프
- Variable 폰트로 100~900 가변 굵기 지원
- 빠른 로딩 (서브셋 동적 로딩)

**데이터·코드·라벨: JetBrains Mono** (Google Fonts)
- 타뷸러 넘버 (자릿수 정렬됨)
- 모노스페이스로 eyebrow, 페이지 번호, 단위 표기

**스케일:**
- 슬라이드 디스플레이: 120px / 88px / 64px (Black 900)
- 헤드라인: 44px / 32px (Bold 700)
- 본문: 22px / 18px / 16px (Regular 400)
- 캡션·이브로우: 12px (Mono 600, letter-spacing 0.12em, UPPERCASE)

**Letter-spacing 규칙:**
- 큰 디스플레이는 `-0.035em` (타이트하게)
- 본문은 `0`
- 이브로우/캡션은 `0.12~0.18em` (와이드)

### 간격 (Spacing)

4px 베이스 그리드. `--space-1` ~ `--space-32` 토큰 제공.

슬라이드 마진:
- 1920×1080 슬라이드 외곽 패딩: **96px ~ 112px** (요청 시 80~96)
- 컴포넌트 간 간격: 24px / 32px / 48px

### 코너 반경 (Radii)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--radius-sm` | 8px | 작은 칩, 인풋 |
| `--radius-md` | 12px | 기본 카드, 내부 박스 |
| `--radius-lg` | **16px** | **시그니처 카드 반경** |
| `--radius-xl` | 24px | 큰 영역 / hero |
| `--radius-pill` | 9999px | 칩, 버튼, 태그 |

> HeyDealer는 카드 코너를 16px 정도로 부드럽게 처리합니다. 우리도 이 값을 메인 카드 표준으로 채택했습니다.

### 그림자 (Shadows)

HeyDealer 스타일은 **그림자가 거의 없는 듯한 매우 부드러운 흐림**이 특징입니다. 강한 drop-shadow를 피하고, 라이트 카드는 다음 두 가지만 사용:

```css
--shadow-sm:    0 2px 6px rgba(15, 25, 50, 0.06);     /* 기본 카드 */
--shadow-md:    0 6px 18px rgba(15, 25, 50, 0.08);    /* 강조 카드 */
--shadow-blue:  0 8px 24px rgba(45, 91, 255, 0.22);   /* CTA 버튼 */
```

다크 슬라이드에서는 그림자 대신 **rgba 보더 / 채도 글로우**로 깊이감을 만듭니다.

### 배경 (Backgrounds)

- **단일 컬러 페이퍼/잉크 배경**이 기본 — 그래디언트는 다크 슬라이드 헤로에 한정 (`radial-gradient(circle, rgba(45,91,255,0.35) 0%, transparent 60%)` 같은 미묘한 글로우).
- 풀-블리드 이미지는 작업물 쇼케이스 슬라이드 외에는 사용하지 않습니다.
- 패턴/텍스처 없음. 깨끗한 평면.

### 애니메이션 / 인터랙션

이 시스템은 정적 슬라이드/문서가 주이지만, 인터랙티브 프로토타입에서는:

- **이징:** `cubic-bezier(.2, .8, .2, 1)` — 강한 가속 후 부드러운 정지 (시그니처)
- **지속:** 120ms (마이크로) / 200ms (기본) / 400ms (강조)
- **호버:** 카드는 `transform: translateY(-2px)` + shadow 한 단계 상승 (md→lg)
- **프레스:** 버튼은 `transform: scale(.97)`, 색상은 한 단계 진하게 (`blue-500 → blue-600`)
- **페이드 없음** — 모든 등장은 슬라이드/스케일 변환. 페이드만 쓰지 않음.

### 보더 / 라인

- 카드 보더: `1px solid var(--ink-100)` — 거의 안 보이는 헤어라인
- 강조 디바이더: `2px solid var(--ink-200)`
- 데이터 테이블 행 디바이더: `1px solid var(--ink-100)`
- 강조 좌측 보더: `3px solid var(--blue-500)` (인용·코어 메시지)

### 투명도 / 블러

- 다크 슬라이드 위 카드 보더: `rgba(255,255,255,0.12)` — 흰색 라인 살짝
- 블러는 사용하지 않습니다. 어떤 요소도 frosted-glass 처리하지 않음.

### 이미지 톤

작업물 스크린샷은 **원본 그대로** 보여줍니다. 필터/그레이스케일 처리하지 않음. 프로필 사진은 약간의 `filter: grayscale(.05)`로 미세하게 색감을 통일하기도 합니다.

전체 화면 채우는 이미지는 슬라이드 11(Selected Works) 외에는 쓰지 않습니다.

### 레이아웃 룰

- **고정 외곽 마진:** 슬라이드 96~112px, 웹 페이지 80~120px
- **컬럼 그리드:** 12-col 베이스, 슬라이드는 1920px 폭에 최대 1700px 콘텐츠
- **카드는 절대 잘리지 않게** — overflow:hidden을 의도적으로만 사용
- **고정 요소:** 페이지 번호와 footer는 모든 슬라이드 동일 위치 (`bottom: 48px`)

---

## 3. ICONOGRAPHY — 아이콘

### 기본 원칙
**이 시스템은 자체 아이콘 폰트가 없습니다.** 본인 노션 포트폴리오는 **이모지를 시그니처 아이콘으로** 사용하기 때문에 동일한 접근을 따릅니다.

### 시그니처 이모지 세트
| 이모지 | 의미 | 사용처 |
|---|---|---|
| 🔎 | Profile / 탐색 | Profile 섹션 헤더 |
| 👩🏻‍💻 | Work Performance / 실행 | Work 섹션 헤더 |
| ⚒️ | Skills · Tools | Skills 섹션 헤더 |
| 🙋🏻 | How I Work / 인사 | How I Work 섹션 헤더 |
| 👋 | Contact / 인사 | Contact 섹션 헤더 |
| 🎯 | 소구점 발굴 (1단계) | 6단계 그로스 시리즈 |
| 🏅 | 등급제 (2-1단계) | 6단계 그로스 시리즈 |
| ⚖️ | AOV 개선 (2-2단계) | 6단계 그로스 시리즈 |
| 🎲 | 멀티채널 (3단계) | 6단계 그로스 시리즈 |
| 🤝 | 인플루언서 PA (4단계) | 6단계 그로스 시리즈 |
| 🗺️ | 지역 확장 (5단계) | 6단계 그로스 시리즈 |
| 👥 | 팀 빌딩 (6단계) | 6단계 그로스 시리즈 |
| 🚀 | Featured / 강조 | 시리즈 인트로, 강조 카드 |
| ✅ | 성과 / 결과 | 결과 정리 |
| ⚠️ | 경고 / 이슈 | 데이터 확인 필요 등 |
| 💡 | 인사이트 / 학습 | 단계 간 전환 학습 포인트 |
| 📐 | 산출 / 계산식 | LTV 산출 같은 계산식 |

### Unicode 화살표

- 다음 단계 이동: `→` 또는 `➡️`
- 호버 화살표: `→`
- 강조 전환 화살표 (검정 굵게): `→`

### SVG / 라인 아이콘

코드 아이콘이 정말 필요한 경우 **Lucide** ([lucide.dev](https://lucide.dev))를 권장합니다 — HeyDealer의 깔끔한 라인 스타일과 호환됩니다. 동봉 자산은 아니며, 필요 시 CDN으로 임포트:

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```

> **본 시스템은 SVG 아이콘을 사전 동봉하지 않습니다.** 대부분의 슬라이드/페이지는 이모지로 충분히 표현되며, Lucide는 보조 옵션입니다.

### 로고 / 워드마크

본인은 아직 개인 로고를 가지고 있지 않습니다 (사용자가 명시적으로 만들지 않았음). 대신 시그니처는:

- **`이도형`** 한글 워드마크 — Pretendard Black 900, 큰 사이즈
- **`LEE DOHYEONG`** 라틴 모노 — JetBrains Mono Bold 700, letter-spacing 0.2em, UPPERCASE
- 시그니처 강조: 이름 옆에 작은 블루 사각형 인디케이터 (`24×24px` 블루 #2D5BFF)

> **다음 단계 권장:** 본인 이니셜 기반 로고 마크(DH 또는 ㅇㄷ) 만들기 — 사용자에게 디렉션을 받아 작업 가능.

---

## 4. INDEX — 파일 안내

### 루트 파일
| 경로 | 내용 |
|---|---|
| `README.md` | 이 문서 — 시스템 전체 가이드 |
| `SKILL.md` | Claude Code / Agent Skills 호환 스킬 정의 |
| `colors_and_type.css` | 모든 디자인 토큰 — CSS variables + 시맨틱 클래스 |

### `assets/` — 비주얼 자산
| 파일 | 내용 |
|---|---|
| `profile_dohyeong.jpg` | 본인 프로필 사진 (2025) |
| `covering_tier_system.png` | 단골 고객 등급제 디자인 (Figma) |
| `covering_pricing.png` | 8kg 초과 할인 페이지 (Figma) |
| `covering_mobile_tier.png` | 모바일 등급 화면 + 등급제 LP |
| `covering_promo_year_end.png` | 연말 청소결산 + 990원 프로모션 |
| `covering_promo_lucky_clover.png` | Lucky Clover 친구 초대 이벤트 |
| `ref_heydealer_hero.png` | HeyDealer 비주얼 레퍼런스 (헤로) |
| `ref_heydealer_cards.png` | HeyDealer 비주얼 레퍼런스 (카드 그리드) |

### `slides/` — 슬라이드 덱
| 파일 | 내용 |
|---|---|
| `Portfolio Deck.html` | **메인 14-슬라이드 포트폴리오 덱** (1920×1080) — 채용 면접용 |
| `deck-stage.js` | 슬라이드 셸 컴포넌트 (스케일링·네비·인쇄) |

### `preview/` — 디자인 시스템 카드
디자인 시스템 탭에 노출되는 토큰/컴포넌트 프리뷰 카드들. 700×N px.

### `source_charts/` — 사용자 본인이 만든 차트 코드 23개
GitHub `hound600al/marketing-lab-26-05-09`에서 가져온 Chart.js HTML 파일들. 새 데이터 시각화를 만들 때 패턴 참조용. **수정하지 말 것 — 출처 보존용 소스 코드입니다.**

### `ui_kits/portfolio_site/` — Notion 스타일 포트폴리오 웹사이트
본인 노션 포트폴리오를 HeyDealer 톤으로 재해석한 1페이지 클릭-스루 사이트.

### `uploads/` — 원본 업로드 파일
PDF/이미지 원본 보관. 디자인 작업에 직접 인용하지 말고, `assets/`로 복사 후 사용.

---

## 5. 시스템 사용법 빠른 시작

새 디자인(슬라이드/문서/페이지)을 만들 때:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <link rel="stylesheet" href="../colors_and_type.css">
</head>
<body>
  <!-- HeyDealer 스타일 카드 -->
  <div style="background:#fff; border-radius:16px; box-shadow: var(--shadow-sm); padding: 32px 36px;">
    <div class="t-eyebrow">FEATURED</div>
    <h2 class="t-h1">월 매출 <span class="u-blue">40배</span></h2>
    <p class="t-body">약 40배 성장(예측) · 24개월간 6단계 그로스로 달성한 성과입니다.</p>
  </div>
</body>
</html>
```

### 카드 종류 빠른 레퍼런스
- **`.card`** — 흰 배경 + soft shadow (기본)
- **`.card-flat`** — 흰 배경 + 1px 헤어라인 보더 (그림자 없음)
- **`.card-tint`** — 블루 50 배경 (강조 인용/주목)
- **`.card-blue`** — 솔리드 블루 + 흰 텍스트 (CTA / 핵심 메시지)
- **`.card-dark`** — 인크 다크 + 흰 텍스트 (다크 슬라이드 위에서)

### 메트릭 카드 패턴
```html
<div class="card">
  <div class="metric">
    <div class="lbl">월 평균 매출 성장</div>
    <div class="val">+230<span class="unit">%</span></div>
    <div class="sub">성장지수 100 → 330 (예측)</div>
  </div>
</div>
```

---

## 6. 알려진 제약 / 다음 단계

- ⚠️ **로컬 폰트 미동봉:** Pretendard CDN이 일시 차단되면 폰트 fallback이 시스템 산세리프로 떨어집니다. 안정성이 중요한 경우 `fonts/` 폴더에 .woff2 직접 추가 필요.
- ⚠️ **로고 미존재:** 개인 로고 마크가 아직 없습니다. 워드마크 + 사각형 인디케이터로 대체 중. 사용자와 합의 후 정식 로고 제작 권장.
- ⚠️ **6단계 페이지 절반만 캡처:** 노션 6단계 페이지 중 1, 2-1-1, 3, 4, 5 메인만 본 디자인 시스템에 데이터로 통합됨. 2-1-2(CRM), 2-1-3(CVR), 2-2(AOV), 5-1·5-2 세부, 6(팀빌딩)은 헤드라인만 반영됨 — 필요 시 추가 슬라이드 제작 가능.
- ⚠️ **마케팅 대시보드 UI 키트 미작성:** 본인이 만든 차트 23개를 다 흡수한 별도의 대시보드 UI 키트는 만들지 않았습니다 (포트폴리오 덱에서 핵심 4개만 재현). 필요하면 추가 작업 가능.
