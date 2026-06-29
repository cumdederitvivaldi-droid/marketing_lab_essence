# 이벤트 딕셔너리 커버링랩스 배포 플랜

> 유형: 플랜
> 작성일: 2026-04-28
> 상태: 완료

## 목표

기존 `covering-labs/apps/event-dictionary` 배치 HTML 생성기를 커버링랩스 private Next.js 앱 배포 단위로 옮긴다. 배포 후 기준 URL은 `https://labs.covering.app/event-dictionary`다.

## 현황 분석

- 기존 구현은 Google Sheet와 BigQuery를 읽어 단일 HTML을 생성한다.
- 기존 생성기는 현재 시트 기준 이벤트 199개, BigQuery 최근 7일 이벤트 181개, 미등록 이벤트 32개를 산출한다.
- 기존 Vercel/단일 HTML 방식의 로그인 오버레이는 커버링랩스 private VM 접근 정책과 중복된다.

## 구현 결정

- `apps/private/event-dictionary`에 `type: nextjs` 앱으로 추가한다.
- 앱 내부 로그인은 제거하고, 커버링랩스 private 접근 경계에 맡긴다.
- Google Sheet 정의, 카테고리, 클라이언트/서버 필터, 검색, 퍼널 보기, 최근 7일 발화 수, BQ only 이벤트를 유지한다.
- BigQuery 조회는 `event_name`, `COUNT(*)`만 사용하고 최근 7일, 시스템 이벤트 제외, 상위 1000개 제한을 둔다.
- 시트와 BigQuery 조회 결과는 서버 프로세스 메모리에 5분 캐시한다.
- UI는 커버링랩스 Next.js 앱 가이드에 맞춰 Tailwind CSS와 lucide-react 아이콘을 사용한다.

## 완료 기준

- `apps/private/event-dictionary/deploy.yml`이 커버링랩스 배포 스캐너에 인식되는 Next.js 앱 형식이다.
- `npm run typecheck`와 `npm run build`가 앱 디렉토리에서 성공한다.
- PR 머지 후 main 배포 파이프라인으로 private VM에 반영 가능하다.

## 검증

- 기존 생성기 데이터 연결 확인: 이벤트 199개, BQ 이벤트 181개, BQ only 32개.
- 신규 앱 검증: `npm install`, `npm run typecheck`, `npm run build`.
- 로컬 runtime 요청 확인: `next start -p 3210` 후 정의 이벤트 199개 렌더링.
- `npm audit --audit-level=moderate` 0건.
- CodeRabbit changes requested 대응: README 필수 섹션 보강, 필터 카운트 수정, 토글 `aria-pressed` 추가, 동시 캐시 미스 in-flight 공유, `next-env.d.ts`의 `.next` 참조 제거.
- CodeRabbit 2차 changes requested 대응: comment key 충돌 방지, 환경변수 registry 등록, BigQuery limit 상수 분리.

## 되돌리기

PR 머지 전에는 `apps/private/event-dictionary`와 이 플랜 문서를 제거한다. 머지 후 문제가 생기면 해당 앱 디렉토리 제거 PR을 머지해 다음 배포에서 제거한다.
