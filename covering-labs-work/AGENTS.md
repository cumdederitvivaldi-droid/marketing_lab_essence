# AGENTS.md — 커버링 실험실 AI 가이드

> 이 문서는 AI 에이전트가 커버링 실험실 관련 질문에 답하거나, 인프라를 관리할 때 참조하는 문서입니다.

---

## 프로젝트 정보


| 항목                  | 값                                                                 |
| ------------------- | ----------------------------------------------------------------- |
| GCP 프로젝트            | `covering-app-ccd23`                                              |
| Zone                | `asia-northeast3-a`                                               |
| private 인스턴스        | `covering-labs-instance-20260306-050059`                          |
| private 외부 IP       | `34.64.177.181`                                                   |
| private 공개 도메인      | `labs.covering.app` (HTTPS, VPN 전용)                              |
| public 인스턴스         | `covering-labs-public`                                            |
| public 외부 IP        | `34.64.144.174`                                                   |
| public 공개 도메인       | `public-labs.covering.app` (HTTPS, VPN 불필요)                      |
| SSL 인증서 (private)   | Let's Encrypt, 만료 2026-07-13, 자동 갱신                              |
| SSL 인증서 (public)    | Let's Encrypt, 만료 2026-07-19, 자동 갱신                              |
| private SA          | `covering-labs@covering-app-ccd23.iam.gserviceaccount.com`        |
| public SA           | `covering-labs-public@covering-app-ccd23.iam.gserviceaccount.com` |
| Cloud Storage       | `gs://covering-labs`                                              |
| 관리자                 | `jun@covering.app`                                                |


---

## 문서 구조

```
covering-labs/
├── CLAUDE.md                    AI 세션 시작 시 자동 독서 — 문서 인덱스 + 필수 선행 독서
├── AGENTS.md                    이 파일 (AI용 — 인프라/권한/배포 시스템 전체)
├── GEMINI.md                    Gemini AI용 세션 가이드 (CLAUDE.md와 동일 내용)
├── apps/
│   ├── AGENTS.md                앱 생성 AI 가이드 (타입 선택 + 파일 구성 + 배포)
│   ├── README.md                비개발자용 간략 가이드
│   ├── _template/               앱 타입별 예시 코드
│   ├── private/                 VPN 전용 앱 (covering-labs-instance)
│   └── public/                  공개 앱 (covering-labs-public)
├── docs/
│   ├── 00_목차.md                전체 목차, 서버 개요, 빠른 시작
│   ├── 01_시작하기.md             gcloud 설치, SSH 접속, 트러블슈팅
│   ├── 02_이용_가이드.md          GitHub, 파일 전송, crontab, tmux, 자동 배포
│   ├── 03_서비스_가이드.md         Sheets, BigQuery, Cloud Storage (코드 포함)
│   ├── 04_권한과_보안.md          권한 매트릭스, 디렉토리, 스코프, 방화벽
│   ├── 05_감사와_모니터링.md       로그 조회, 대시보드, Slack 알림
│   ├── 06_서버_관리.md            자동 세팅, dev 그룹, 재부팅, 스크립트
│   ├── 07_인프라_관리.md          IAM, 스코프, BQ ACL, 인스턴스 생성, 방화벽, VPN
│   ├── 08_비개발자_가이드.md       비개발자 전용 가이드 (AI 활용, 앱 요청, 확인법)
│   ├── 09_보안_규약.md            보안 규약 (인증·민감정보·데이터 노출·웹 보안)
│   ├── 10_출고_전_파일_필터_설치.md release-file-guard 설치 및 검증 가이드
│   └── 11_비개발자_API_인프라_범위.md 비개발자 허용/차단 API·인프라 범위 정의
└── works/
    ├── AGENTS.md                작업 기록 AI 가이드 (파일 저장 규칙, 네이밍, 템플릿)
    ├── plan/                    플랜, PRD, ADR
    └── reports/                 분석 보고서, 조사 결과
```

---

## 작업 기록 문서 위치

이 저장소의 `docs/`는 실험실 인프라의 영속 운영 문서만 보관한다.

- 접속 문제 분석, 점검 계획, 작업 회고, 임시 조사 메모, 실행 보고서는 `works/`에 저장
- 장기적으로 유지할 접속/운영/IAM/모니터링 가이드는 `docs/`에 저장

즉, "이번 작업의 기록"은 `works/`, "실험실 운영 지식"은 `covering-labs/docs/`에 둔다.

---

## Works PRD 작성 규칙

**covering-labs에서 실질적인 작업(코드/문서 수정, 인프라 변경, 앱 추가 등)을 시작하기 전에 반드시 `works/`에 문서를 생성해야 합니다.**

### 언제 작성하는가

| 작업 유형 | 문서 위치 | 파일명 예시 |
|---|---|---|
| 기능 추가, 버그 수정, 앱 배포, 문서 개선 | `works/plan/` | `2026-04-13-covering-labs-doc-fix.md` |
| 장애 분석, 서버 조사, 성능 분석 | `works/reports/` | `2026-04-13-covering-labs-batch-error.md` |

단순 질문, 현황 조회, 1줄 수정은 생략 가능.

### 파일명 규칙

```
{YYYY-MM-DD}-covering-labs-{task-slug}.md
```

예시:
- `2026-04-13-covering-labs-nestjs-template-fix.md`
- `2026-04-13-covering-labs-doc-consistency.md`
- `2026-04-13-covering-labs-batch-crontab-bug.md`

### 작성 방법

`works/AGENTS.md`의 템플릿을 따른다.

```markdown
# {작업명} 플랜

> 유형: PRD | 플랜 | 분석
> 작성일: YYYY-MM-DD
> 상태: 초안

## 목표

## 현황 분석

## 구현 계획

### 단계별 작업

## 완료 기준
```

### 파일 수정 시 PRD 업데이트

프로젝트 파일(코드, 스크립트, 문서)을 수정하면 해당 작업의 PRD/플랜 문서에 아래를 반영한다:

- 변경한 파일 목록
- 변경 이유 및 내용 요약
- 완료된 단계 체크

---

## 질문 라우팅

사용자 질문에 따라 참조할 문서:


| 질문 유형                                  | 참조 문서                            |
| -------------------------------------- | -------------------------------- |
| **앱 만들기, 배포, 타입 선택 (batch/nextjs/nestjs)** | [apps/AGENTS.md](apps/AGENTS.md) |
| 서버 접속 방법, gcloud 설치                    | [docs/01_시작하기.md](docs/01_시작하기.md)         |
| 코드 올리기, GitHub, crontab, tmux, 자동 배포  | [docs/02_이용_가이드.md](docs/02_이용_가이드.md)     |
| Sheets/BigQuery/Storage, AWS 내부 서비스 접근 | [docs/03_서비스_가이드.md](docs/03_서비스_가이드.md)   |
| 권한, 누가 뭘 할 수 있는지, 디렉토리                 | [docs/04_권한과_보안.md](docs/04_권한과_보안.md)     |
| 로그 보기, 대시보드, Slack 알림                  | [docs/05_감사와_모니터링.md](docs/05_감사와_모니터링.md) |
| 서버 관리, 재부팅, 스크립트, 설정 파일                | [docs/06_서버_관리.md](docs/06_서버_관리.md)       |
| IAM, 스코프 변경, 인스턴스 생성, 방화벽, VPN         | [docs/07_인프라_관리.md](docs/07_인프라_관리.md)     |
| 비개발자 AI 활용, 앱 요청하는 법, 배포 후 확인법       | [docs/08_비개발자_가이드.md](docs/08_비개발자_가이드.md) |
| 보안 규약 확인, 보안 위반 발견 시 조치               | [docs/09_보안_규약.md](docs/09_보안_규약.md) |
| release-file-guard 설치, 파일 필터 설정           | [docs/10_출고_전_파일_필터_설치.md](docs/10_출고_전_파일_필터_설치.md) |
| **비개발자 허용/차단 API·인프라 범위 확인**          | [docs/11_비개발자_API_인프라_범위.md](docs/11_비개발자_API_인프라_범위.md) |


---

## 권한 체계 (AI가 반드시 인지해야 하는 것)

### 3계층 권한


| 계층  | 대상                 | 할 수 있는 것                                           |
| --- | ------------------ | -------------------------------------------------- |
| 일반  | `all@covering.app` | SSH 접속, 본인 홈, crontab, Sheets/BQ 조회, Storage 읽기/쓰기 |
| 개발  | `dev@covering.app` | 위 + sudo, 로그 조회, 서버 관리                               |
| 관리  | `jun@covering.app` | 위 + IAM 변경, 스코프 변경, 인스턴스 관리                        |

### SSH 접속에 필요한 IAM 권한 (2가지 모두 필요)

| 권한 | 역할 | 부여 위치 |
| --- | --- | --- |
| `compute.instances.osLogin` | `roles/compute.osLogin` | 프로젝트 IAM → `all@covering.app` |
| `iam.serviceAccounts.actAs` | `roles/iam.serviceAccountUser` | SA 레벨 → `all@covering.app` |

인스턴스에 서비스 계정이 연결되어 있으므로 `actAs` 없이는 SSH 접속 불가. 사용자가 SSH 접속 문제를 보고하면 두 권한 모두 확인할 것.


### 절대 하면 안 되는 것


| 금지 사항                             | 이유                                  |
| --------------------------------- | ----------------------------------- |
| SA에 `storage.objectAdmin` 부여      | 메타데이터 API로 모든 사용자가 토큰 획득 → 파일 삭제 가능 |
| `all@`에 `logging.viewer` 부여       | 로그는 dev 전용                          |
| `all@`에 `compute.osAdminLogin` 부여 | sudo 권한은 dev 전용                     |
| BigQuery 데이터셋에 `WRITER` 부여        | 읽기 전용 정책                            |
| IAM에서 `roles/editor` 이상 부여        | 최소 권한 원칙                            |
| `public` 데이터셋에 SA 추가              | 의도적 제외                              |
| sudoers 직접 수정 (`visudo`)          | `/etc/sudoers.d/` 하위 파일로만           |
| `/etc/profile.d/` 스크립트 무테스트 수정    | 전체 사용자 접속 장애 위험                     |
| 방화벽에 RDP(3389) 규칙 추가              | Ubuntu 서버에 불필요, 공격 표면 증가            |


---

## 인스턴스 설정 요약

### Private VM (covering-labs-instance) 설정 요약

#### 서비스 계정 IAM 역할

`covering-labs@covering-app-ccd23.iam.gserviceaccount.com`:

- `bigquery.user`
- `compute.osLogin`
- `compute.viewer`
- `iam.serviceAccountUser`
- `storage.objectCreator`
- `storage.objectViewer`
- `logging.logWriter`
- `monitoring.metricWriter`

#### 인스턴스 스코프

- `devstorage.read_write`
- `spreadsheets`
- `drive`
- `bigquery`
- `logging.write`
- `monitoring.write`
- `service.management.readonly`
- `servicecontrol`
- `trace.append`

### Public VM (covering-labs-public) 설정 요약

#### 서비스 계정 IAM 역할

`covering-labs-public@covering-app-ccd23.iam.gserviceaccount.com`:

- `bigquery.user`
- `compute.osLogin`
- `compute.viewer`
- `iam.serviceAccountUser`
- `storage.objectCreator`
- `storage.objectViewer`
- `logging.logWriter`
- `monitoring.metricWriter`

#### 인스턴스 스코프

Private VM과 동일 (storage-rw, spreadsheets, drive, bigquery, logging, monitoring, trace)

#### 방화벽

- HTTP/HTTPS: `0.0.0.0/0` 공개 (VPN 불필요)
- SSH: `0.0.0.0/0`

#### 특이사항

- Site-to-site VPN 미연결 → 내부 AWS 리소스 접근 불가
- GCP OS Login API는 정상 동작 (admin API와 무관)

### 서버 내 스크립트/설정


| 파일                                        | 용도                                      | 수정 가능      |
| ----------------------------------------- | --------------------------------------- | ---------- |
| `/etc/motd`                               | SSH 로그인 시 표시되는 안내 메시지 (AI 문서 참조 가이드 포함) | dev (sudo) |
| `/etc/profile.d/covering-labs-setup.sh`   | 첫 SSH 시 바로가기 + GCS 폴더 자동 생성             | dev (sudo) |
| `/etc/google-cloud-ops-agent/config.yaml` | Cloud Logging 수집 (syslog + auth)        | dev (sudo) |
| `/etc/sudoers.d/covering-labs-symlink`    | 일반 유저 바로가기 생성 허용                        | jun (위험)   |
| `/etc/sudoers.d/covering-labs-nginx`      | `covering-dev` 그룹에 `sudo nginx` reload 허용 | jun (위험)   |


### 방화벽 규칙 (HTTP/HTTPS)

#### Private VM (covering-labs-instance) 방화벽

| 포트 | 프로토콜 | 소스 |
|---|---|---|
| 80 | HTTP | `43.200.63.250/32, 10.0.0.0/16, 10.2.0.0/22` (VPN 전용) |
| 443 | HTTPS | `43.200.63.250/32, 10.0.0.0/16, 10.2.0.0/22` (VPN 전용) |

#### Public VM (covering-labs-public) 방화벽

| 포트 | 프로토콜 | 소스 |
|---|---|---|
| 80 | HTTP | `0.0.0.0/0` (전체 공개, VPN 불필요) |
| 443 | HTTPS | `0.0.0.0/0` (전체 공개, VPN 불필요) |
| 22 | SSH | `0.0.0.0/0` |

> **접근 제어:** L4(GCP 방화벽) + L7(nginx allow/deny) **이중 방어**.
> - AWS Client VPN(`covering-vpn-v2`) 연결 필수. VPN 미연결 시 **TCP 핸드셰이크조차 안 됨 (timeout)**.
> - Let's Encrypt 갱신: `dns-route53` plugin 으로 DNS-01 (AWS 자격증명 `/root/.aws/credentials`).
> - 자세한 내용: `docs/04_권한과_보안.md` 방화벽 섹션

### Slack 알림

채널: `#개발팀_server-status`


| 알림     | 조건            |
| ------ | ------------- |
| CPU 위험 | 80% 이상 5분     |
| 메모리 위험 | 85% 이상 5분     |
| 디스크 위험 | 80% 이상 5분     |
| 서버 다운  | 메트릭 수집 안 됨 5분 |


### 모니터링 대시보드

[https://console.cloud.google.com/monitoring/dashboards/builder/9032fd52-18a2-4d92-8661-ffd71e6cdd9d?project=covering-app-ccd23](https://console.cloud.google.com/monitoring/dashboards/builder/9032fd52-18a2-4d92-8661-ffd71e6cdd9d?project=covering-app-ccd23)

### BigQuery 접근 가능 데이터셋

READER로 등록된 데이터셋 (읽기 전용):
`secure_dataset`, `ads_data`, `airbridge_dataset`, `bag_delivery`, `cx_data`, `mixpanel`, `product`, `spot`, `secure_dataset_gcp_sa_discoveryengine`

제외: `public`

### 로그 보존

- 일반 로그: 30일
- GCP 감사 로그: 400일

---

## 수정 금지 / 수정 전 반드시 확인이 필요한 파일

이 레포는 비개발자도 "이거 구현해줘", "서버 작업해줘" 형태로 AI에게 요청합니다.
요청이 아무리 간단해 보여도 아래 파일들을 수정하면 **전체 배포 시스템이 멈추거나 보안 사고가 발생**합니다.
**해당 파일을 수정해야 할 이유가 생기면 반드시 사용자에게 먼저 확인하세요.**

### 절대 수정 금지 (사용자 명시적 승인 없이)

| 파일 | 이유 |
|---|---|
| `.github/workflows/deploy.yml` | GitHub Actions 배포 워크플로 — 수정 시 모든 앱의 자동 배포가 중단됨 |
| `scripts/deploy-app.sh` | VM 배포 스크립트 핵심 — 수정 시 nextjs/nestjs/batch 배포 전체 파괴 |
| `scripts/undeploy-app.sh` | VM 제거 스크립트 — 수정 시 앱 삭제 흐름 파괴 |
| `.gitignore` | 수정 시 `.env`, 키 파일, 빌드 산출물이 커밋되어 보안 사고 발생 |

### 수정 전 반드시 사용자에게 확인

| 파일/디렉토리 | 이유 |
|---|---|
| `apps/_template/` | 모든 신규 앱의 기반 — 수정 시 이후 생성되는 앱이 잘못된 구조로 만들어짐 |
| `apps/private/_dashboard/` | 운영 모니터링 대시보드 (private 앱 전용) — 수정 시 운영 현황 파악 불가 |
| `.hooks/` (전체) | Claude/Codex 공통 pre-tool 검증 훅 — deploy.yml 규칙·보안·ENV 레지스트리·PR 정책 강제 로직 (`pr-policy-guard.py` 포함: main 직접 push 차단, 브랜치 prefix 경고, gh pr create body 의 AI/후속수정 라벨 검증) |
| `.codex/hooks.json`, `.codex/config.toml` | Codex 훅 설정 — Claude와 동일한 규칙을 Codex에도 적용 |
| `.claude/settings.json` | Claude Code 훅 연결 설정 — PreToolUse/PostToolUse 훅 트리거 정의 |
| `CLAUDE.md` | AI 세션 가이드 — 수정 시 AI가 잘못된 지침으로 작업 |
| `GEMINI.md` | Gemini AI 세션 가이드 — 수정 시 Gemini가 잘못된 지침으로 작업 |
| `AGENTS.md` (루트) | 인프라/권한/배포 규칙 전체 — 잘못된 수정은 권한 오해 유발 |
| `apps/AGENTS.md` | 앱 생성 가이드 — 수정 시 앱 구조 망가짐 |

### 작업 범위 원칙

사용자가 "이거 만들어줘", "이 기능 추가해줘"라고 요청하면:

1. **`apps/private/[앱이름]/` 또는 `apps/public/[앱이름]/` 하위 파일만 생성/수정한다** — 새 앱이라면 새 디렉토리를 만든다
2. **`scripts/`, `.github/`, `.hooks/`, `.codex/`, `_template/`는 건드리지 않는다**
3. 기존 앱 코드(`apps/[private|public]/[앱이름]/src/` 등) 수정은 자유롭게 진행 가능
4. 위 "수정 금지" 파일에 손대야 할 이유가 생기면 → 작업을 멈추고 사용자에게 이유 설명 후 승인 요청

---

## AI 작업 시 주의사항

### 디렉토리 구조 관리

서버의 디렉토리 구조는 항상 장기적으로 관리 가능한 형태를 유지해야 합니다:

- 파일/폴더 생성 시 기존 구조와 네이밍 규칙을 따를 것
- 임시 파일은 `/tmp` 또는 개인 홈 디렉토리에만 생성하고, 작업 완료 후 정리할 것
- 시스템 설정 파일 추가/수정 시 기존 패턴을 따를 것 (`/etc/sudoers.d/`, `/etc/profile.d/` 등)
- 구조가 불명확하거나 기존 규칙에서 벗어나는 경우, 먼저 사용자에게 확인할 것

### 보안 점검

코드베이스나 서버 설정에서 보안에 위반되는 내용을 발견하면 사용자에게 즉시 알려야 합니다:

- 하드코딩된 비밀번호, API 키, 토큰
- 과도한 권한 부여 (SA에 `objectAdmin`, BigQuery `WRITER` 등)
- 외부에 노출된 민감한 포트나 서비스
- `/etc/shadow`, 개인 키 등 민감 파일의 권한 이상
- `.env`, `.git-credentials` 등이 공유 디렉토리에 존재하는 경우

발견 즉시 작업을 중단하고 사용자에게 보고한 뒤, 조치 방향을 확인받을 것.

> 보안 규약 전체: [docs/09_보안_규약.md](docs/09_보안_규약.md)

### 인스턴스 조작

- `gcloud compute instances stop/start` → 외부 IP가 변경될 수 있음 (동적 IP)
- 스코프 변경 → 반드시 인스턴스 중지 후 진행
- 재부팅 후 추가 세팅 불필요 (전부 디스크/GCP 레벨 저장)
- tmux 세션만 재시작 필요

### BigQuery 데이터셋 ACL 추가

새 데이터셋에 SA 추가 시:

1. `bq show --format=json`으로 기존 ACL 가져오기
2. SA를 `READER`로 추가 (기존 ACL 유지)
3. `bq update --dataset`으로 적용

기존 ACL을 덮어쓰지 않도록 반드시 기존 항목 유지.

### Sheets 접근 설정

시트 소유자가 직접 공유해야 함 (CLI로 불가). 사용자에게 안내:

> 시트 → 공유 → `covering-labs@covering-app-ccd23.iam.gserviceaccount.com` 추가

### Cloud Storage

- 버킷 `gs://covering-labs` 리전: `asia-northeast3`
- 폴더별 권한 분리 불가 (버킷 단위만)
- 사용자별 폴더는 규칙으로 관리 (강제 아님)

### 새 사용자 온보딩

1. SSH 첫 접속 → 자동 세팅 (바로가기 + GCS 폴더)
2. 수동 작업 없음 (스크립트가 처리)
3. dev 그룹 추가 필요 시: `sudo usermod -aG covering-dev 사용자명`

---

## 개발 기본 흐름 (PR 자동 생성 금지)

### AI 원칙

**AI는 작업이 끝난 직후 자동으로 `git push` / `gh pr create` 를 실행하지 않는다.**
코드/문서 변경이 끝나면 **로컬 커밋까지만 하고 반드시 멈춘다**. 그 뒤 사용자 확인을 기다린다.

### 기본 개발 흐름

```text
1. 브랜치 생성 (feat|fix|docs/YYYY-MM-DD-{slug})
2. 코드 구현 + 로컬에서 실행·테스트·빌드로 검증
3. git commit (변경사항 커밋)
4. ⛔ STOP — 사용자에게 결과 보고
5. 사용자가 명시적 배포 키워드를 말했을 때 push + PR 생성
```

### 명시적 배포 키워드 (이 키워드 없이는 push / PR 생성 금지)

- `배포 준비해줘` / `배포해줘` / `배포해`
- `PR 올려줘` / `PR 올려` / `PR 만들어줘`
- `push 해줘` / `푸시해줘`
- `올려줘` (문맥상 배포 의미가 분명할 때)

### 금지 상황

- 사용자가 `만들어줘` / `고쳐줘` / `구현해` / `작성해` 등 **구현만** 요청한 경우 → 커밋까지만 하고 멈춤.
- Ralph/executor 같은 자동화 루프가 "작업 완료" 단계로 `gh pr create` 를 실행하는 것도 금지.
- 완료 보고 후 사용자가 명시 지시할 때만 PR 생성 (이때는 PR 템플릿 규칙을 철저히 따라야 함).

### PR 생성 시 지켜야 할 규칙 (사용자 지시 후)

- PR body 는 `.github/PULL_REQUEST_TEMPLATE.md` 를 기반으로 작성.
- `- [x] ai-generated` / `- [x] ai-assisted` / `- [x] no-ai` 중 정확히 1개.
- `- [x] normal-change` / `- [x] post-release-fix` / `- [x] hotfix` 중 정확히 1개.
- `--assignee @me` 를 붙여 작성자 스스로 Assignee 지정 (또는 GitHub Actions 가 자동 할당).

---

## 배포 워크플로우 (PR 필수)

비개발자 포함 모든 작업자는 **main에 직접 push 금지**입니다.
사용자가 명시적 배포 키워드(위 목록 참조) 를 말했을 때 AI 는 아래 절차를 수행합니다.

### 브랜치 네이밍 규칙

```
feat/YYYY-MM-DD-{slug}   # 신규 기능, 신규 앱
fix/YYYY-MM-DD-{slug}    # 버그 수정
docs/YYYY-MM-DD-{slug}   # 문서 수정만
```

예시:
- `feat/2026-04-14-sales-dashboard`
- `fix/2026-04-14-slack-message-format`
- `docs/2026-04-14-update-guide`

### PR 기반 배포 절차

```bash
# 1. 브랜치 생성
git checkout -b feat/YYYY-MM-DD-{slug}

# 2. 변경사항 커밋
git add apps/[앱이름]/
git commit -m "feat: 설명"

# 3. 브랜치 push
git push origin feat/YYYY-MM-DD-{slug}

# 4. PR 생성 (GitHub CLI)
gh pr create \
  --title "제목" \
  --body "변경 내용 요약"
```

### PR 이후 자동 흐름

```
PR 생성 / 업데이트
    ↓
CodeRabbit 자동 코드 리뷰
    ↓
코멘트 있음 → resolve 전까지 머지 차단
코멘트 없음 → 사용자 승인 후 머지 + 브랜치 삭제 + 자동 배포
```

### 관련 파일

| 파일 | 역할 |
|---|---|
| `.codex/config.toml` | Codex CLI 훅 설정 (release-file-guard 등) |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR 생성 시 자동 채워지는 체크리스트 |

---

## 앱 배포 시스템 (GitHub Actions)

### 구조

```
covering-labs/
├── .github/workflows/deploy.yml   # push 감지 → 자동 배포
├── apps/
│   ├── README.md                  # 비개발자용 가이드
│   ├── _template/                 # 앱 타입별 템플릿
│   └── [앱이름]/
│       ├── deploy.yml             # 필수: name, type, (schedule, command)
│       └── ...코드...
└── scripts/
    ├── deploy-app.sh              # VM에서 실행되는 배포 스크립트
    └── undeploy-app.sh            # 앱 제거 스크립트
```

### 배포 흐름

```
apps/[앱이름]/** 변경 후 push
    ↓
GitHub Actions (.github/workflows/deploy.yml)
    ↓  SA 키로 GCP 인증 + gcloud compute scp
VM /shared/apps/[앱이름]/ 에 파일 복사
    ↓
/shared/scripts/deploy-app.sh 실행
    ↓
Slack #개발팀_커버링랩스 알림 (접속 주소 포함)
```

### 제거 흐름

```
apps/[앱이름]/ 폴더 삭제 후 push
    ↓
GitHub Actions (deploy.yml 삭제 감지)
    ↓
/shared/scripts/undeploy-app.sh 실행
    ↓
PM2 중지/삭제 + nginx conf 삭제 + 포트 반환 + 앱 파일 삭제
    ↓
Slack #개발팀_커버링랩스 알림
```

### VM 배포 디렉토리

| 경로 | 용도 | 접근 |
|---|---|---|
| `/shared/apps/` | 배포된 앱 코드 | GitHub Actions (SA) 전용 |
| `/shared/nginx-confs/` | 앱별 nginx 설정 자동 생성 | GitHub Actions (SA) 전용 |
| `/shared/scripts/` | 배포 스크립트 | GitHub Actions (SA) 전용 |
| `/shared/port-registry.json` | 앱-포트 매핑 (자동 관리) | GitHub Actions (SA) 전용 |
| `/shared/.env` | 배포 환경변수 (`SLACK_BOT_TOKEN` 등) | 읽기 전용 (수정은 jun@ 가 SA 계정으로) |

### deploy.yml 타입별 필드

**batch:**
```yaml
name: 앱이름
description: "앱에 대한 한 줄 설명"
type: batch
schedule: "0 9 * * 1-5"
command: "python3 src/main.py"
```

**nextjs / nestjs:**
```yaml
name: 앱이름
description: "앱에 대한 한 줄 설명"
type: nextjs   # 또는 nestjs
```

### 포트 자동 배정

- `nextjs` / `nestjs` 는 3001번부터 순차 배정
- 배정 결과는 `/shared/port-registry.json` 에 기록
- nginx가 `https://labs.covering.app/[앱이름]` 으로 라우팅 (VPN 필수)
- IP 직접 접근(`http://34.64.177.181/[앱이름]`)은 nginx default server에서 VPN 전용 차단 — 앱으로 라우팅 안 됨. 반드시 도메인 사용.

> **AWS Client VPN 연결 필수.** GCP 방화벽(L4) + nginx(L7) 양쪽에서 VPN NAT (`43.200.63.250/32`) + AWS VPC (`10.0.0.0/16`) + 사내망 (`10.2.0.0/22`) 만 허용하는 이중 방어. Let's Encrypt 는 DNS-01 (Route 53) 로 갱신.

### GitHub Secrets (required)

| Secret 이름 | 내용 |
|---|---|
| `GCP_SA_KEY` | `covering-labs-deploy@covering-app-ccd23.iam.gserviceaccount.com` SA JSON 키 전체 내용 (private VM 배포용) |
| `GCP_SA_KEY_PUBLIC` | `covering-labs-public-deploy@covering-app-ccd23.iam.gserviceaccount.com` SA JSON 키 전체 내용 (public VM 배포용) |
| `SLACK_BOT_TOKEN` | Slack Bot Token — `chat.postMessage` API로 `#개발팀_커버링랩스` (`C0AUK6902BE`) 채널에 발송 |

### 워크플로 주의사항

- `gcloud compute scp` / `gcloud compute ssh`에서 `--ssh-flag` 옵션을 사용하지 마세요. 최신 gcloud 버전에서 지원되지 않습니다.
- OS Login 환경에서 gcloud가 SSH 키를 자동 관리하므로 `StrictHostKeyChecking=no`는 불필요합니다.

### 배포 계정

GitHub Actions은 SA `covering-labs-deploy@covering-app-ccd23.iam.gserviceaccount.com`으로 각 VM에 접속합니다.
OS Login 유저명은 VM마다 다릅니다:

| VM | OS Login 유저 | /shared/ 소유자 |
|---|---|---|
| private (`covering-labs-instance`) | `sa_109369409955768144646` | `sa_109369409955768144646:covering-dev` |
| public (`covering-labs-public`) | `sa_102262643810051855747` | `sa_102262643810051855747:covering-dev` |

이 유저는 `/shared/` 의 소유자(`2775` 권한, setgid + group-writable)이므로 쓰기 가능합니다. `covering-dev` 그룹도 setgid 덕에 쓰기 가능합니다.

> ⚠️ `/shared/` 권한 수동 수정 시 반드시 해당 VM의 올바른 SA 유저로 chown할 것.

### Slack 알림 설정

CI/CD·KR·운영 알림은 아래 두 채널로 분리되어 있습니다.

| 채널 | 대상 알림 | 발송 주체 | 주입 경로 |
|---|---|---|---|
| `#개발팀_커버링랩스` (`C0AUK6902BE`) | 앱 배포/제거 완료, ai-pr-guardrail 실패, critical-detect 실패, weekly-blocking-report 집계/실패 | GitHub Actions + `deploy-app.sh`/`undeploy-app.sh` | GitHub Secrets `SLACK_BOT_TOKEN` (Slack Web API `chat.postMessage`) |
| `#개발팀_server-status` | 서버 리소스 위험 (CPU/메모리/디스크 5분+, 서버 다운) | **GCP Cloud Monitoring 알림 정책** (별개 시스템) | GCP 콘솔 → Monitoring → Alerting |

```bash
# GitHub Secrets에 등록 (Slack Bot Token — chat.postMessage API 사용)
gh secret set SLACK_BOT_TOKEN --body "xoxb-..."
```

> `#개발팀_server-status` 의 webhook 은 GCP Cloud Monitoring 이 관리하므로 이 저장소 (Secrets / `.env`) 와 무관합니다. 알림 정책: https://console.cloud.google.com/monitoring/alerting?project=covering-app-ccd23
