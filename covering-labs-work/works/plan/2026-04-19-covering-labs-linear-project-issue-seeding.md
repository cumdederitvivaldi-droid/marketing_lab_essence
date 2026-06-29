# covering-labs Linear 프로젝트 이슈 시드 플랜

> 유형: Plan
> 작성일: 2026-04-19
> 상태: 완료

## 목표

- `covering-labs` 저장소와 현재 운영 구조를 바탕으로 Linear 프로젝트의 남은 작업을 체계화한다.
- 필요 시 Linear 프로젝트 설명을 보강한다.
- public/private 배포 분리, 신규 public VM, 단일 레포 운영 방식을 포함한 실행 가능한 이슈를 생성한다.

## 현황 분석

- `covering-labs`는 현재 private VPN 기반 접근 제약을 가진 내부용 배포 구조를 운영 중이다.
- 저장소는 `apps/`, `infra/nginx/`, `docs/`, `scripts/` 중심으로 구성되어 있다.
- 앱 배포는 하나의 레포에서 GitHub Actions와 VM 배포 스크립트를 통해 수행된다.
- 외부 공개 배포를 위한 별도 public 인프라/배포 경로는 아직 정식 구조로 정리되지 않았다.

## 구현 계획

### 단계별 작업

- [x] 관련 운영 문서와 인프라 설정 파일을 검토한다.
- [x] Linear 프로젝트 현황, 설명, 기존 이슈를 확인한다.
- [x] public/private 분리 관점에서 필요한 에픽 수준 작업을 도출한다.
- [x] 실행 단위 이슈를 세분화해 Linear에 생성한다.
- [x] 프로젝트 설명 또는 요약이 부족하면 보강한다.
- [x] 생성 결과와 권장 우선순위를 사용자에게 공유한다.

## 변경 내용

- Linear 프로젝트 `[KR3] 비개발자 AI 개발·배포 환경 신규 구축` 설명/요약을 현재 상태 기준으로 보강
- Linear 프로젝트 설명을 `2026-04-13` 시작부터 `2026-06-07` 마무리까지의 전체 프로그램 설명으로 재작성
- Linear 프로젝트 타임라인을 `private에서 먼저 트래킹 시작 → 2026-05-15 전후 public 배포 완료 → 2026-06-07까지 운영 고도화` 기준으로 재조정
- Linear 프로젝트 설명에 `현재는 private 기준으로만 트래킹 가능하며, 정의/집계 로직 보정이 우선`이라는 상태 진단과 즉시 우선순위 추가
- 완료 이슈 7건 생성 후 `Done` 처리
- 향후 작업 이슈 10건 생성 후 `Todo` 상태로 등록
- `private 트래킹 정의/집계 일치화`, `critical/follow-up 추적 신뢰도 보강` 이슈를 추가 생성
- `ENG-2561`, `ENG-2563`를 `private 트래킹 정의가 선행 조건`이라는 기준으로 재작성
- `ENG-2572` follow-up PR 자동 라벨링 및 원인 PR/문제 코드 입력 강제 이슈 생성 후 `Done` 처리

## 생성 이슈

### Done

- `ENG-2555` single repo 기반 private 앱 배포 파이프라인 구축
- `ENG-2556` AI 사용 PR 라벨 체계 및 PR 템플릿 강제
- `ENG-2557` CodeRabbit 크리티컬 감지 및 follow-up 라벨 자동화
- `ENG-2558` 주간 AI PR 차단율 Slack 리포트 자동화
- `ENG-2559` release-file-guard 출고 전 파일 필터 도입
- `ENG-2560` labs.covering.app VPN 전용 접근 하드닝
- `ENG-2572` follow-up PR 자동 라벨링 및 원인 PR/문제 코드 입력 강제

### Todo

- `ENG-2569` private KR3 정의 확정 및 weekly-blocking-report 집계 로직 일치화
- `ENG-2570` critical 감지와 follow-up 추적 신뢰도 보강
- `ENG-2561` single repo 기반 public/private 배포 아키텍처 확정
- `ENG-2562` covering-labs-public VM 생성 및 베이스라인 세팅
- `ENG-2563` GitHub Actions와 배포 스크립트에 public/private 타깃 분기 추가
- `ENG-2564` deploy manifest에 공개 범위와 배포 대상 필드 도입
- `ENG-2565` public 도메인, nginx, TLS, 방화벽 정책 구성
- `ENG-2566` public VM용 서비스 계정·Secret·공용 디렉토리 권한 분리
- `ENG-2567` dashboard·문서·온보딩 가이드를 public/private 구조로 업데이트
- `ENG-2568` 첫 public 앱 배포 및 롤백 리허설

## 완료 기준

- 저장소 기반으로 도출한 신규 이슈가 Linear 프로젝트에 생성되어 있다.
- public/private 배포 분리와 public VM 구축이 작업 항목에 포함되어 있다.
- 프로젝트 설명이 현재 작업 범위를 반영하도록 보강되어 있다.
