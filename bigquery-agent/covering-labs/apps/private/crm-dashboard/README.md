# CRM 시나리오 대시보드

커버링 CRM 메시지 플로우와 발송 시나리오를 확인하는 Next.js 래퍼 앱이다.

## 목적

`crm-dashboard-handoff.zip`으로 전달된 정적 CRM 메시지 플로우 맵을 커버링 랩스 private 앱 경로에서 확인할 수 있게 한다.

## 실행 환경

- Node.js 20 이상
- npm
- Next.js 16

## 주요 파일

- `app/page.tsx`: covering-labs 경로에서도 원본 정적 대시보드를 iframe으로 표시한다.
- `public/dashboard/index.html`: 전달받은 CRM 메시지 플로우 맵 원본 화면이다.
- `public/dashboard/data.json`: Google Sheets 기반 CRM 메시지 데이터 스냅샷이다.

## 환경변수

별도 환경변수 없음.

## 실행 방법

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

로컬 주소는 `http://localhost:3000`이고, 배포 주소는 `https://labs.covering.app/crm-dashboard`다. 접속에는 AWS Client VPN이 필요하다.

## 의존 서비스

외부 API 호출 없이 `public/dashboard/data.json` 스냅샷 기반으로 동작한다.

## 주의사항

- 비밀값이나 고객별 원본 목록은 앱에 포함하지 않는다.
- 데이터 갱신은 `public/dashboard/data.json`을 교체하는 방식이다.
- 화면에는 내부 메시지 문구와 Google Sheets 편집 링크가 포함되므로 public VM에 배포하지 않는다.
- private VM의 nginx 라우팅 갱신이 실패하면 배포도 실패로 처리되어야 한다.
- `next@16.2.4`의 빌드 경로와 맞추기 위해 `postcss`는 lockfile 기준 8.5.12로 고정된다.
