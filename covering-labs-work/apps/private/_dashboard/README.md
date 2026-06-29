# 모니터링 대시보드 (_dashboard)

Covering Labs 인프라의 앱 실행 상태와 배치 작업 현황을 실시간으로 모니터링하는 Next.js 기반 대시보드입니다.

## 목적

전체 시스템 운영자가 다음을 한 눈에 파악할 수 있습니다:
- PM2로 관리되는 모든 앱의 실시간 상태 (online/stopped/errored)
- crontab에 등록된 배치 작업의 스케줄, 활성화 상태, 마지막 실행 결과
- 각 배치의 최근 로그 및 오류 여부

이를 통해 서버 전체의 상태를 중앙에서 모니터링하고, 배치 작업을 토글(Enable/Disable)로 제어할 수 있습니다.

## 실행 환경

- **실행 방식**: PM2 (일반 웹앱, 다른 앱들과 함께 관리)
- **포트**: port-registry.json에 등록된 포트 (기본 설정 시 3005)
- **Base Path**: `/_dashboard` (reverse proxy 뒤에서 실행, 예: `http://host/_dashboard`)
- **실행 서버**: GCP 인스턴스 (Covering Labs 메인 인프라)

## 주요 파일

| 파일 | 역할 |
|---|---|
| `app/page.tsx` | 메인 대시보드 UI 컴포넌트 (React, 30초/60초 주기 갱신) |
| `app/api/status/route.ts` | PM2 프로세스 목록과 port-registry에서 앱 상태 조회 |
| `app/api/batches/route.ts` | crontab 파싱 및 배치 작업 목록 조회 (배치.log 미리보기 포함) |
| `app/api/batches/[name]/toggle/route.ts` | 특정 배치 작업 활성화/비활성화 (crontab 수정) |
| `app/api/batches/[name]/log/route.ts` | 배치 로그 파일 tail 조회 (경로 조회 방지 포함) |
| `lib/cron-toggle.ts` | crontab 라인 파싱 및 `#[DISABLED]` prefix 토글 로직 |
| `lib/crontab-io.ts` | `crontab -l` / `crontab -` 실행 및 직렬화 뮤텍스 |
| `lib/deploy-meta.ts` | `/shared/apps/{appName}/deploy.yml` 읽기 및 로그 파일 탐색 |

## 환경변수

특별히 필요한 환경변수 없음. 다음 시스템 경로에 의존합니다:

| 경로 | 설명 |
|---|---|
| `/shared/apps/` | 모든 배포된 앱의 디렉토리 (deploy.yml, logs/ 포함) |
| `/shared/port-registry.json` | 앱별 포트 매핑 (JSON: `{"appName": 3000, ...}`) |
| 사용자 crontab | `crontab -l`로 조회되는 현재 프로세스의 crontab |

## 실행 방법

### 개발 환경

```bash
cd apps/_dashboard
npm install
npm run dev
# 브라우저: http://localhost:3000/_dashboard
```

### 프로덕션 배포

표준 배포 프로세스를 따릅니다:

```bash
git checkout -b feat/$(date +%Y-%m-%d)-dashboard-update
git add apps/_dashboard/
git commit -m "feat(_dashboard): 설명"
git push origin feat/$(date +%Y-%m-%d)-dashboard-update
gh pr create --title "feat(_dashboard): 설명" --body "변경 내용"
```

PR 머지 후 GitHub Actions가 자동으로 배포합니다.

### 빌드 및 시작

```bash
npm run build
npm run start
```

## 의존 서비스

### 로컬 시스템

- **PM2**: 앱 프로세스 상태 조회 (`pm2 jlist` 명령 실행)
- **crontab**: 배치 작업 스케줄 및 토글 상태 저장 (시스템 crontab 직접 수정)
- **파일시스템** (`/shared/`): 각 앱의 설정과 로그 파일 접근

### 외부 서비스

없음 (외부 API 호출 없음)

## 주의사항

### 토글 동작의 한계

- **배치 활성화/비활성화**는 crontab의 `# deploy:{appName}` 라인 앞에 `#[DISABLED] ` prefix를 추가/제거하는 방식입니다.
- `scripts/deploy-app.sh`가 재배포할 때 **전체 crontab 라인을 다시 쓰므로** DISABLED 상태가 초기화됩니다.
  - 예: 배치를 비활성화했다가 앱을 재배포하면 다시 활성화됨 (알려진 한계)

### 동시 요청 안전성

- 동일 배치에 대한 토글 요청은 뮤텍스(`withAppLock`)로 직렬화됩니다.
- 더블클릭 등의 경합 상태(race condition)는 발생하지 않습니다.

### 로그 파일 접근

- `deploy.yml`에 지정된 `logs/` 디렉토리 내의 `.log` 파일만 열람 가능합니다.
- 경로 조회(path traversal) 공격 방지: 파일명에 `/`, `..` 포함 시 거부합니다.

### 오류 판정 로직

배치 로그의 마지막 50줄에서 다음을 검사합니다:

- ERROR, CRITICAL, FATAL 키워드 포함
- Traceback으로 시작
- `{Error,Exception}:` 패턴
- JSON 키: 값 형식은 **오류가 아닙니다** (false positive 방지)

만약 최근 10줄 이내에 완료 마커(`완료:` 또는 `"run_date"`)가 있으면 오류가 아닙니다 (정상 완료).

### 갱신 주기

- **앱 목록**: 30초마다 갱신
- **배치 목록**: 60초마다 갱신
- 페이지 포커스 시에도 계속 갱신 (중단 없음)

## 테스트

```bash
npm test
# Jest 테스트: __tests__/cron-toggle.test.ts
```

테스트는 crontab 파싱 및 토글 로직의 단위 테스트를 포함합니다.
