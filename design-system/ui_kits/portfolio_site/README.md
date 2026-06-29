# UI Kit · Portfolio Site

이도형 그로스 마케터의 노션 포트폴리오를 HeyDealer 톤(코발트 블루 + 잉크 블랙)으로 재해석한 1페이지 인터랙티브 웹사이트.

## 구성 (Single-page, 7 섹션)

1. **Sticky Navigation** — 워드마크 + 섹션 점프 + Contact CTA
2. **Hero** — 헤드라인 + 프로필 사진 (블루 오프셋 블록)
3. **Headline Performance** — 4 메트릭 카드 (라이트 / 다크 / 솔리드 블루 믹스)
4. **6-Step Growth Story** — 클릭하면 펼쳐지는 단계 카드 7개 (소구점 → 팀빌딩)
5. **Selected Works** — 커버링 Figma 작업물 갤러리 (4컬럼)
6. **Skills · Tools** — 3컬럼 (Media / Data / Soft) + 자격증 다크 카드
7. **How I Work** — 다크 라운드 박스 안 9 principles
8. **Contact** — 솔리드 블루 풀 카드 + CTA 버튼

## 사용 컴포넌트 / 패턴

- `nav` — sticky + backdrop-filter blur
- `m-card` — 메트릭 카드 (light / dark / blue 3 variant)
- `step-card` — 클릭 가능 (`toggleStage(n)`), 디테일 드로어
- `work-card` — 호버 시 살짝 상승 + 이미지 줌
- `skill-card` — 도트 + 자기평가 (hi/mid/lo 컬러)
- `principles` — 다크 블록 + 9-grid
- `contact` — 블루 풀 카드 + 원형 배경 장식

## 인터랙션

- 6단계 그로스 카드: 클릭 시 펼침/접힘 — 한 번에 하나만 열림
- 페이지 로드 시 STEP 03 (멀티채널) 자동 열림 — 데모용
- 카드 호버: `translateY(-2px)` + shadow 한 단계 상승

## 자산 의존성

- `../../colors_and_type.css` (디자인 토큰)
- `../../assets/profile_dohyeong.jpg`
- `../../assets/covering_*.png` (4장)

## 이 키트의 활용

- **포트폴리오 단일 페이지 사이트**로 그대로 호스팅 가능 (정적 HTML)
- 각 섹션은 모듈화되어 있어 다른 슬라이드/페이지로 떼어다 쓸 수 있음
- 헤드라인 강조 패턴 (`accent` 클래스로 블루 한 단어만), 메트릭 카드 패턴, step-card 패턴은 시스템 전체에서 재사용
