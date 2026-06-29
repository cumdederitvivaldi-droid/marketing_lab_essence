# CRM 메시지 플로우 대시보드 정정 플랜

> 유형: 플랜
> 작성일: 2026-04-28
> 상태: 진행 중

## 목표

`crm-dashboard-handoff.zip` 원본의 CRM 메시지 플로우 맵을 private 앱에서 볼 수 있는 대시보드로 정정한다. 내부 CRM 메시지와 Google Sheets 링크가 포함되므로 public 앱으로 유지하지 않는다.

## 현황 분석

- 기존 배포본은 Grafana 대시보드 접근 링크와 JSON 원본 제공이 중심이다.
- 이번 원본은 `index.html`과 `data.json`만으로 동작하는 정적 CRM 메시지 플로우 맵이다.
- 데이터에는 고객별 원본 목록이나 API 키는 보이지 않았지만, 내부 메시지 문구와 Google Sheets 편집 링크가 포함된다.

## 구현 계획

### 단계별 작업

- [x] 최초 `apps/public/crm-dashboard`를 handoff 정적 화면 기준으로 교체
- [x] 원본 화면을 Next.js 앱 안에서 열리게 구성
- [x] public 노출 판단 오류를 확인하고 `apps/private/crm-dashboard`로 이동
- [x] `apps/public/crm-dashboard/deploy.yml` 삭제로 public undeploy 워크플로우가 실행되게 구성
- [x] 공개 페이지에서 민감한 API 키나 고객별 원본 목록은 노출하지 않음
- [x] Google Sheets 기반 문자열이 HTML로 바로 들어가는 구간에 기본 이스케이프 추가
- [x] 빌드 검증
- [x] 데스크톱/모바일 브라우저 확인
- [ ] GitHub Actions private 배포와 public undeploy 확인: PR 머지 후 배포 워크플로우에서 확인

## 완료 기준

- private URL에서 CRM 메시지 플로우, 채널별 카운트, 검색/필터, 상세 모달이 확인된다.
- public URL `public-labs.covering.app/crm-dashboard`는 더 이상 열리지 않는다.
- 배포 워크플로우가 통과한다.
- 배포 후 `labs.covering.app/crm-dashboard`에서 VPN 전용으로 화면이 열린다.

## 검증 기록

- `npm run typecheck`: 통과
- `npm run build`: 통과
- `npm audit --omit=dev`: 취약점 0건
- 로컬 브라우저 데스크톱: 총 66개, 알림톡 59개, 푸시 6개, 문자 1개 표시 확인
- 로컬 브라우저 상세 모달: 수거신청 접수 카드 클릭 후 채널, 템플릿 ID, 메시지 내용 표시 확인
- 로컬 브라우저 모바일: 좁은 화면에서 글자 깨짐 대신 가로 스크롤로 확인되도록 조정
