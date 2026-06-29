# meta-ads-automation

Meta Marketing API를 통해 광고세트·소재를 자동으로 생성하는 내부 도구 (Next.js 웹 UI).

## 목적

마케터가 브라우저에서 OS 선택 → 캠페인 선택 → 광고세트 설정 → 파일 업로드 순서로 진행하면,
Meta Graph API를 통해 광고세트와 광고 소재를 자동으로 생성한다.
생성되는 모든 광고는 **PAUSED** 상태이며, 활성화는 Meta 광고 관리자에서 직접 한다.

## 실행 환경

- 실행 방식: PM2 (Next.js SSR)
- 실행 서버: covering-labs-instance (private VM, VPN 필수)
- 접속: `https://labs.covering.app/meta-ads-automation`

## 주요 파일

| 파일 | 설명 |
|------|------|
| `app/page.tsx` | 메인 마법사 UI (클라이언트 컴포넌트) |
| `app/api/campaigns/route.ts` | 캠페인 목록 조회 |
| `app/api/adsets/route.ts` | 광고세트 목록 조회 |
| `app/api/saved-audiences/route.ts` | Meta Saved Audiences 조회 |
| `app/api/create/route.ts` | 광고세트+소재 생성 (SSE 스트리밍) |
| `config.json` | 계정·타겟·소재 기본 설정 |
| `tests/helpers.test.ts` | 광고세트 네이밍 검증 단위 테스트 |

## 환경변수

| 변수명 | 설명 | 필수 여부 |
|--------|------|-----------|
| `FACEBOOK_ACCESS_TOKEN` | Meta Graph API 액세스 토큰 | 권장 (없으면 UI에서 직접 입력) |
| `META_GRAPH_VERSION` | Graph API 버전 (기본값: `v21.0`) | 선택 |

## 실행 방법

```bash
# 로컬 개발
npm install
npm run dev

# 빌드
npm run build

# 테스트
npm test
```

## 의존 서비스

- Meta Graph API (`graph.facebook.com/v21.0`)
- 커버링 Meta 비즈니스 계정 (`act_225607806262602`)

## 정책

- 생성되는 모든 세트·광고는 **PAUSED** 상태다. 활성화는 Meta 광고 관리자에서 직접 진행한다.
- iOS 지면: Instagram 전용 / AOS 지면: Facebook + Instagram
- 어드벤티지 크리에이티브 전체 OFF (`degrees_of_freedom_spec`)
- CBO 캠페인일 경우 세트 예산 필드를 자동 제외한다.
- 영상 업로드 후 Meta 처리 완료(`video_status=ready`) 확인 후 소재를 생성한다.
- 액세스 토큰은 `FACEBOOK_ACCESS_TOKEN` 환경변수 또는 UI 입력값으로만 전달한다. 코드·파일에 기록하지 않는다.
