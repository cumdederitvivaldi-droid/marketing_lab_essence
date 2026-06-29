# disposal-guide 디자인 토큰 실제 적용

> 유형: 플랜
> 작성일: 2026-04-29
> 상태: 완료

## 배경
앞선 작업에서 `tailwind.config.js`에 DESIGN.md 토큰(컬러·타이포·spacing·radius)을 등록하고 컴포넌트의 hex 값을 DESIGN.md 스펙으로 통일했지만, **컴포넌트는 여전히 임의값(`text-[#16191D]`, `text-[16px] font-semibold leading-[24px]` 등)을 사용**하고 있어 토큰 시맨틱이 코드에 반영되지 않은 상태.

확인 결과(2026-04-29 시점):
- 토큰 클래스 사용: 0건
- 하드코딩 hex 클래스: 63건
- 인라인 style hex: 35건
- 임의값 fontSize: 43건

## 변경 범위

### 1) 컬러 토큰화

| Before | After |
|---|---|
| `text-[#16191D]` | `text-text-default` |
| `text-[#434A56]` | `text-text-neutral` |
| `bg-[#1AA3FF]` | `bg-primary` |
| `bg-[#E5F4FF]` | `bg-primary-tint` |
| `bg-[#F8FAFB]` | `bg-surface-dim` |
| `border-[#C0C7D8]` | `border-border-default` |
| `text-[#FF3358]` | `text-status-negative` |
| 등 |  |

### 2) 타이포 토큰화

| Before | After |
|---|---|
| `text-[16px] font-semibold leading-[24px]` | `text-body1-emphasized` |
| `text-[14px] font-semibold leading-[22px]` | `text-body2-emphasized` |
| `text-[20px] font-bold leading-[28px]` | `text-title2` |
| 등 |  |

### 3) 인라인 style → className
- 동적 토글(예: `style={{ borderColor: isSelected ? '#1AA3FF' : '#E5E7EB' }}`)은 className으로 마이그레이션
- 정적 hex는 className 토큰으로 교체

### 4) IntroScreen 텍스트 라인 간격 수정
- "몇가지 질문만 대답하면" / "나에게 맞는 서비스 알려드려요!" — 두 `<p>` 사이 margin이 0이라 라인 사이가 붙어 보임
- 두 줄 사이 적절한 spacing 추가

## 검증
- `npx tsc --noEmit` 0건
- `npx jest` 68/68 통과
- 로컬 dev 서버에서 시각 확인 (사용자 QA)

## 주의
- chip height(56px) 유지 — 사용자 명시 요청
- 결과 페이지의 PRESETS 객체나 데이터 구조 변경 없음 (시각 토큰만)
