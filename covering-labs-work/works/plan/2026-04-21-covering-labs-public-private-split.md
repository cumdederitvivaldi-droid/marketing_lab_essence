# public/private 배포 분리 — covering-labs-public VM 신규 구축 플랜

> 유형: 플랜
> 작성일: 2026-04-21
> 상태: 완료

## 목표

`apps/`를 `private/`와 `public/`으로 분리하고, public 앱은 GCP `covering-labs-public` VM에 자동 배포되도록 인프라·코드베이스·문서 전반을 업데이트한다.

## 현황 분석

| 항목 | 현재 | 목표 |
|---|---|---|
| apps/ 구조 | 단일 디렉토리 | `apps/private/`, `apps/public/` 분리 |
| 배포 VM | `covering-labs-instance-20260306-050059` (1개) | private + public VM (2개) |
| 접근 방식 | VPN 전용 | private: VPN 필수, public: 전체 공개 |
| GitHub Actions | 단일 VM 배포 | private/public 분기 배포 |
| 도메인 | `labs.covering.app` (VPN 전용) | private: 기존 유지, public: `public-labs.covering.app` |

### 제약 조건

- public VM은 site-to-site VPN 미연결 → 내부 AWS 리소스·Admin API 접근 불가
- public VM은 VPN 없이 접근 가능 → 방화벽 HTTP/HTTPS `0.0.0.0/0` 공개
- 기존 앱은 전부 private (이동 후 동작 보장 필요)
- admin api(GCP Admin SDK, OS Login profile cleanup)는 public VM에서도 사용 가능 (site-to-site VPN과 무관)

## 구현 계획

### 단계별 작업

- [x] US-001: works/plan 문서 생성
- [x] US-002: apps/ 디렉토리 구조 private/public 분리
  - `git mv apps/[앱]/ apps/private/[앱]/` (기존 모든 앱)
  - `apps/public/` 빈 디렉토리 생성 + README.md
  - `apps/_template/`, `apps/AGENTS.md`, `apps/README.md`는 루트에 유지
- [x] US-003: GitHub Actions deploy.yml 업데이트
  - detect step: `apps/private/**`, `apps/public/**` 각각 감지
  - deploy-private job: `GCP_SA_KEY` + private VM
  - deploy-public job: `GCP_SA_KEY_PUBLIC` + public VM
  - undeploy도 동일하게 분기
- [x] US-004: deploy-app.sh 업데이트
  - `SERVER_DOMAIN` env var → Slack 알림 URL 동적화 (if/else로 버그 수정 포함)
- [x] US-005: GCP covering-labs-public VM 생성 및 기본 세팅
  - SA 생성 (인스턴스용, GitHub Actions용)
  - VM 생성 + 기본 세팅 스크립트
  - 방화벽 규칙 설정 (0.0.0.0/0 공개)
  - GitHub Secrets 등록 안내
- [x] US-006: 문서 업데이트
  - AGENTS.md (public VM 정보, 구조 업데이트, IP=34.64.144.174)
  - apps/AGENTS.md (디렉토리 구조, 접속 주소)
  - docs/07_인프라_관리.md
  - docs/06_서버_관리.md
  - docs/04_권한과_보안.md
  - CLAUDE.md

## 신규 인프라 상세

### Public VM 스펙

| 항목 | 값 |
|---|---|
| 인스턴스명 | `covering-labs-public` |
| Zone | `asia-northeast3-a` |
| Machine type | `e2-medium` |
| 인스턴스 SA | `covering-labs-public@covering-app-ccd23.iam.gserviceaccount.com` |
| 배포 SA | `covering-labs-public-deploy@covering-app-ccd23.iam.gserviceaccount.com` |
| 도메인 | `public-labs.covering.app` (DNS 별도 설정 필요) |
| 방화벽 | HTTP/HTTPS `0.0.0.0/0` (VPN 불필요) |
| GitHub Secret | `GCP_SA_KEY_PUBLIC` |

### Private vs Public 차이

| 항목 | Private | Public |
|---|---|---|
| VPN | 필수 | 불필요 |
| 방화벽 | VPN CIDR만 허용 | 0.0.0.0/0 공개 |
| site-to-site VPN | 연결됨 | 미연결 |
| 내부 AWS 리소스 접근 | 가능 | 불가 |
| admin API (GCP OS Login) | 가능 | 가능 |
| 서버 내부 구조 | `/shared/` 표준 구조 | 동일 |

## 완료 기준

- `apps/private/[앱이름]` PR → private VM 자동 배포
- `apps/public/[앱이름]` PR → public VM 자동 배포 (public 접근 가능)
- 기존 private 앱이 경로 변경 후 정상 배포됨
- 문서 전반에 public/private 구분 반영
