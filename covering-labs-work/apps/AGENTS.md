# apps/AGENTS.md — 앱 배포 AI 가이드

> 이 문서는 AI 에이전트가 `apps/` 디렉토리에 새 앱을 구성하거나 기존 앱을 수정할 때 참조합니다.
> 사용자가 작업 의도를 설명하면, 이 문서를 기반으로 앱 타입을 결정하고 디렉토리와 파일을 직접 생성하세요.

---

## private vs public 앱 구분

| 구분 | 디렉토리 | 배포 VM | 접속 방식 | 허용 타입 | 적합한 앱 |
|---|---|---|---|---|---|
| **private** | `apps/private/[앱이름]/` | covering-labs-instance (VPN 전용) | AWS Client VPN 필수 | `nextjs`, `nestjs`, `batch` (전부) | 내부 도구, 민감 데이터 처리, 사내 API 연동, 모든 배치 작업 |
| **public** | `apps/public/[앱이름]/` | covering-labs-public (공개) | VPN 불필요, 외부 접근 가능 | `nextjs`, `nestjs` **only** | 고객용 웹 서비스, 공개 API 서버, 공개 대시보드 |

> **🔴 batch 앱은 반드시 `apps/private/`에 배치하세요.** public VM은 외부 노출 전용이며, 배치 작업(crontab)은 운영 보안상 private VM에서만 실행합니다.
> 아래 2단계 강제 장치:
> 1. **로컬 훅**: Claude/Codex 가 `apps/public/[앱]/deploy.yml` 에 `type: batch` 또는 `schedule:` 을 쓰면 `deploy-yml-guard.py` 가 Edit/Write 을 차단합니다.
> 2. **CI 훅**: 훅을 우회하더라도 GitHub Actions `deploy-public` 잡이 배포 시 타입을 재검증하여 거부합니다.

> **기존 앱은 전부 `apps/private/`에 위치합니다.**
> public 앱은 site-to-site VPN 미연결 — 내부 AWS 리소스/Admin API 접근 불가.

---

## 앱 타입 결정 가이드

사용자의 말을 듣고 아래 기준으로 타입을 결정합니다.

### 타입 선택 표

| 사용자가 원하는 것 | 타입 | 예시 키워드 |
|---|---|---|
| **화면이 있는 웹 서비스** (대시보드, 관리자 페이지, 포털) | `nextjs` | "페이지 만들어줘", "대시보드", "UI", "프론트" |
| **API 서버** (REST API, 백엔드, 데이터 처리 서버) | `nestjs` | "API 만들어줘", "서버", "백엔드", "엔드포인트" |
| **정기 실행 스크립트** (자동화, 알림, 데이터 수집) | `batch` | "매일", "자동으로", "스케줄", "배치", "cron" |

### 판단이 애매할 때

- "Sheets에서 데이터 읽어서 처리" → 화면 없으면 `batch`, 화면 있으면 `nextjs`
- "알림 보내는 서버" → 외부 요청을 받으면 `nestjs`, 정해진 시간에 실행하면 `batch`
- "내부 도구" → 화면 필요하면 `nextjs`, API만 필요하면 `nestjs`

---

## 앱 구성 절차 (AI 에이전트 실행 단계)

사용자가 앱 생성을 요청하면 아래 순서로 진행합니다.

### 0단계 — 최신 코드 동기화 (필수)

> **⚠️ 새 앱 개발 또는 기존 앱 수정 전, 반드시 먼저 실행하세요.**

```bash
git pull origin main
```

- 로컬 코드가 최신 상태인지 확인 후 작업을 시작합니다.
- pull 없이 작업하면 이미 존재하는 앱/파일과 충돌하거나 중복 작업이 발생합니다.
- 브랜치 작업 중이라면: `git fetch origin && git rebase origin/main`

### 1단계 — 앱 이름 결정

- 영문 소문자 + 하이픈만 사용 (`my-app`, `sales-report`)
- 폴더 이름 = URL 경로 = 앱 식별자 (한 번 정하면 변경 불가)
- 이미 있는 폴더인지 확인: `ls apps/`

### 2단계 — 디렉토리 생성

**batch:**
```bash
mkdir -p apps/private/[앱이름]/src   # 내부 전용 — batch는 private 전용
mkdir -p apps/private/[앱이름]/logs
```

**nextjs:**
```bash
mkdir -p apps/private/[앱이름]/app   # 내부 전용
# 또는
mkdir -p apps/public/[앱이름]/app    # 외부 공개
```

**nestjs:**
```bash
mkdir -p apps/private/[앱이름]/src   # 내부 전용
# 또는
mkdir -p apps/public/[앱이름]/src    # 외부 공개
```

### 3단계 — 파일 생성

타입별 필수 파일은 아래 "타입별 파일 구성" 섹션을 참조하세요.

### 4단계 — 브랜치 push 및 PR 생성

```bash
git add apps/private/[앱이름]/   # private 앱인 경우
# 또는
git add apps/public/[앱이름]/    # public 앱인 경우
git commit -m "feat: [앱이름] 추가"

# main에 직접 push 금지 — 브랜치를 생성하고 PR을 열어야 합니다
git checkout -b feat/$(date +%Y-%m-%d)-[앱이름]
git push origin feat/$(date +%Y-%m-%d)-[앱이름]
gh pr create --title "feat: [앱이름] 추가" --body "변경 내용 설명"
```

PR 생성 후 CodeRabbit 코드 리뷰 → 승인 시 자동 머지 + GitHub Actions 자동 배포.

---

## 타입별 파일 구성

### batch (정기 실행 스크립트)

```
apps/[앱이름]/
├── deploy.yml        ← 필수
├── requirements.txt  ← 선택 (pip 패키지)
├── logs/             ← 자동 생성됨
└── src/
    └── main.py
```

**deploy.yml:**
```yaml
name: [앱이름]
description: "[앱에 대한 한 줄 설명]"
type: batch
schedule: "0 9 * * 1-5"
command: "python3 src/main.py"
```

**src/main.py (기본 템플릿):**

> ⚠️ **로깅 3대 필수 규칙**
>
> 1. **`batch.log` 단일 파일 필수**: Python `logging.FileHandler`를 `logs/batch.log`에 연결하세요.
>    crontab도 `>> logs/batch.log 2>&1`로 리다이렉션되므로, 대시보드 로그 뷰어에 하나로 표시됩니다.
>    **별도 로그 파일 추가 금지** — 대시보드에서 파일이 여러 개로 쪼개져 보입니다.
>
> 2. **시작 / 종료 로그 필수**: 배치 실행 시 반드시 시작과 종료를 로그로 남기세요.
>    대시보드 오류 감지기가 `INFO ... 완료 :` 패턴을 성공 마커로 사용합니다.
>
> 3. **중요 결과값 로그 필수**: 처리 건수, 오류 건수, 주요 수치 등 배치의 핵심 결과를 로그로 남기세요.
>    이상 탐지와 사후 디버깅에 직접 사용됩니다.

```python
import logging
import os
import time

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, "batch.log")),
    ],
)
# StreamHandler 추가 금지 — crontab 이 stdout/stderr 를 batch.log 로 redirect 하므로
# StreamHandler 를 더하면 같은 라인이 두 번 기록된다.
logger = logging.getLogger(__name__)


def main():
    started_at = time.time()
    logger.info("시작")

    # 작업 내용
    processed = 0
    errors = 0

    # 중요 결과값은 반드시 로그로 남긴다
    logger.info(f"처리 완료: {processed}건 / 오류: {errors}건")

    elapsed = time.time() - started_at
    logger.info(f"완료 : {elapsed:.1f}초")  # ← "완료 :" 패턴은 대시보드 성공 마커


if __name__ == "__main__":
    main()
```

**GCP 서비스 사용 시 (Sheets, BigQuery, Storage):**
```python
import google.auth

creds, _ = google.auth.default(scopes=[
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/bigquery",
])
```
> 서버에서는 키 파일 없이 `google.auth.default()`로 자동 인증됩니다.

**cron 스케줄 예시:**

| 표현 | 의미 |
|---|---|
| `0 9 * * 1-5` | 평일 오전 9시 |
| `0 8 * * *` | 매일 오전 8시 |
| `*/30 * * * *` | 30분마다 |
| `0 6 * * 1` | 매주 월요일 오전 6시 |

---

### nextjs (웹 UI / 대시보드)

**디자인 원칙:**
- **Tailwind CSS**: 스타일은 반드시 Tailwind CSS를 사용하세요.
- **전문적인 대시보드**: Lucide-react 아이콘을 활용하고, 깨끗하고 전문적인 화이트/그레이 톤의 대시보드 UI를 지향하세요.
- **인터랙션**: 버튼 클릭 시 로딩 상태 표시 등 비개발자가 봐도 "작동 중임"을 알 수 있는 피드백을 추가하세요.

```
apps/[앱이름]/
├── deploy.yml
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
└── app/
    ├── globals.css
    ├── layout.tsx
    └── page.tsx
```

**deploy.yml:**
```yaml
name: [앱이름]
description: "[앱에 대한 한 줄 설명]"
type: nextjs
```

**package.json:**
```json
{
  "name": "[앱이름]",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "lucide-react": "^0.400.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "typescript": "^5",
    "tailwindcss": "^3",
    "postcss": "^8",
    "autoprefixer": "^10"
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**app/layout.tsx:**
```tsx
import type { ReactNode } from "react";

export const metadata = { title: "[앱이름]" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

**app/page.tsx:**
```tsx
export default function Home() {
  return (
    <main>
      <h1>[앱이름]</h1>
    </main>
  );
}
```

> `basePath`는 배포 스크립트가 자동으로 `next.config.js`를 생성합니다. 직접 만들지 마세요.

#### 로컬 TypeScript 오류 해결 (`JSX.IntrinsicElements` 등)

로컬에 `node_modules`가 없으면 에디터(VSCode 등)에서 다음 오류가 표시됩니다:

```
JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.ts(7026)
Cannot find module 'react' or its corresponding type declarations.
```

이 오류는 **`@types/react`가 설치되지 않아** 발생합니다. VM 빌드에는 영향 없지만, 로컬에서 오류 없이 개발하려면:

```bash
# 앱 디렉토리에서 실행
cd apps/[앱이름]
npm install
```

`node_modules/`는 `.gitignore`에 등록되어 있어 커밋되지 않습니다.

---

### nestjs (API 서버 / 백엔드)

```
apps/[앱이름]/
├── deploy.yml
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── app.controller.ts
    └── app.service.ts
```

**deploy.yml:**
```yaml
name: [앱이름]
description: "[앱에 대한 한 줄 설명]"
type: nestjs
```

**package.json:**
```json
{
  "name": "[앱이름]",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "reflect-metadata": "^0.1.13",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@nestjs/schematics": "^10.0.0",
    "@types/node": "^20.3.1",
    "typescript": "^5.1.3"
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

**tsconfig.build.json:**
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

**nest-cli.json:**
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

**src/main.ts:**
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`서버 실행 중: http://localhost:${port}`);
}
bootstrap();
```

**src/app.module.ts:**
```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

**src/app.controller.ts:**
```typescript
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
```

**src/app.service.ts:**
```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
```

#### 로컬 TypeScript 오류 해결

NestJS도 Next.js와 동일하게 로컬에 `node_modules`가 없으면 `Cannot find module '@nestjs/common'` 등의 오류가 표시됩니다. 해결:

```bash
cd apps/[앱이름]
npm install
```

`node_modules/`는 `.gitignore`에 등록되어 있어 커밋되지 않습니다.

---

## 환경변수 처리

앱에서 API 키, DB URL 등 민감한 값이 필요할 때:

### 방법 1 — `/shared/.env` 에 추가 (권장, 모든 앱 공유)

```bash
# VM에서 jun@로 실행
sudo -u sa_109369409955768144646 nano /shared/.env
```

```bash
# /shared/.env 예시
MY_API_KEY=sk-...
DB_URL=postgresql://...
```

배포 스크립트(`deploy-app.sh`)가 실행 시 `/shared/.env`를 자동으로 source합니다.

앱 코드에서 사용:
```python
# batch (Python)
import os
api_key = os.environ.get("MY_API_KEY")
```
```typescript
// nextjs / nestjs
const apiKey = process.env.MY_API_KEY;
```

### 방법 2 — 앱 디렉토리 내 `.env` 파일 (앱별 독립)

```bash
# VM에서 직접 생성
sudo -u sa_109369409955768144646 nano /shared/apps/[앱이름]/.env
```

> `.env` 파일은 `.gitignore`에 등록되어 있어 레포에 커밋되지 않습니다. VM에서 직접 관리하세요.

### 방법 3 — `/shared/.env` + `_load_env_file()` 패턴 (batch 앱 표준)

모든 배치 앱이 사용하는 표준 방식입니다. `config.py` 모듈 import 시 자동으로 `/shared/.env`를 로드합니다.

```python
# config.py — crontab 실행 환경 대응
import os
from pathlib import Path


def _load_env_file() -> None:
    """crontab 실행 환경에서 /shared/.env를 자동 로드한다.
    이미 설정된 환경변수는 덮어쓰지 않는다(setdefault).
    """
    env_path = Path(os.environ.get("ENV_FILE", "/shared/.env"))
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()

SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")
```

> SA 유저 crontab 실행 환경에서도 `/shared/.env`는 읽기 가능합니다 (`covering-dev` 그룹 권한). `python-dotenv` 의존성 불필요.

---

### 환경변수 추가 규칙 — 중복 방지 필수

> **⚠️ 새 환경변수를 코드에 추가하기 전에 반드시 아래 레지스트리를 먼저 확인하세요.**

| 규칙 | 설명 |
|---|---|
| **레지스트리 먼저** | 코드 작성 전 아래 테이블에 변수명을 등록하고, 그 다음 코드에서 사용 |
| **재사용 우선** | 동일하거나 유사한 용도의 변수가 이미 있으면 새 이름을 만들지 말고 재사용 |
| **이름 표준화** | `SLACK_BOT_TOKEN`이 있는데 `SLACK_TOKEN`, `BOT_TOKEN`을 새로 만들지 않음 |
| **값 중복 금지** | 같은 값을 다른 이름의 변수로 2개 만들면 안 됨 (관리 포인트 2배, 불일치 위험) |

**절차:**
1. 아래 레지스트리에서 동일/유사 용도 변수 있는지 확인
2. 없으면 레지스트리 테이블에 먼저 추가
3. `/shared/.env`에 값 추가 (VM에서 직접)
4. 코드에서 사용

> 훅(`env-var-registry-check.py`)이 레지스트리에 없는 변수명을 코드에 쓰면 자동으로 경고합니다.
> 경고가 뜨면 개발자에게 요청하고, PR 설명에 추가한 환경변수 내용을 명시하세요.

---

### 현재 서버에 설정된 환경변수 레지스트리

새 앱 개발 시 아래 변수를 재사용할 수 있습니다. **실제 값은 VM에서 직접 확인**하세요.

> 카테고리별 개요는 [`docs/12_환경변수_가이드.md`](../docs/12_환경변수_가이드.md) 참조.

#### `/shared/.env` (배포 스크립트 자동 로드 — 모든 앱 공유)

batch 앱은 `config.py`에 `_load_env_file()` 패턴을 추가하면 crontab 실행 시 자동 로드됩니다.

**공통 변수** — 여러 앱이 공유하는 API 키·봇 토큰 (값이 동일, 한 번만 관리)

> 아래 변수는 이미 VM에 설정되어 있습니다. 새 앱에서 사용 시 별도 값 추가 없이 코드에서 바로 참조하세요.
> 자세한 사용법은 아래 **[서비스별 공통 환경변수 재사용 가이드]** 섹션을 참고하세요.

| 변수명 | 용도 | 사용 앱 |
|---|---|---|
| `SLACK_BOT_TOKEN` | covani-pickup 봇 토큰 (채널 메시지·DM·파일 업로드) | 전체 15개+ 앱 공유 |
| `FLARELANE_PROJECT_ID` | FlareLane 프로젝트 ID | flarelane-d7-retention, covering-invite-batch, covering-invite-v2, d7-crm-monitoring 등 |
| `FLARELANE_API_KEY` | FlareLane API 키 (이벤트 트래킹용) | flarelane-d7-retention, covering-invite-batch, covering-invite-v2, d7-crm-monitoring 등 |
| `GCP_PROJECT` | GCP 프로젝트 ID (`covering-app-ccd23`) | BigQuery·GCS 사용하는 모든 batch 앱 + covering-invite-v2 |
| `AIRBRIDGE_TOKEN` | Airbridge API 인증 토큰 (광고비 리포트·링크 트래킹) | airbridge-ads-cost-sync, covering-invite, covering-invite-v2 |
| `AIRBRIDGE_APP` | Airbridge 앱 식별자 (기본값: `coveringprod`) | airbridge-ads-cost-sync |

**앱별 변수** — 앱마다 값이 다르거나 해당 앱 전용

| 변수명 | 용도 | 사용 앱 |
|---|---|---|
| `ALLOWED_HOST` | GCP VM 호스트명 — 타머신 중복 실행 방지 | vehicle-dispatch-monitor |
| `CHANNELTALK_ACCESS_KEY` | 채널톡 Open API 키 | vehicle-dispatch-monitor |
| `CHANNELTALK_ACCESS_SECRET` | 채널톡 Open API 시크릿 | vehicle-dispatch-monitor |
| `CHANNELTALK_TARGET_TAG` | 감지할 채널톡 태그명 (기본값: `차량등록`) | vehicle-dispatch-monitor |
| `BACKOFFICE_EMAIL` | 백오피스 자동 로그인 이메일 | vehicle-dispatch-monitor |
| `BACKOFFICE_PASSWORD` | 백오피스 자동 로그인 비밀번호 | vehicle-dispatch-monitor |
| `BACKOFFICE_ACCESS_TOKEN` | 백오피스 수동 토큰 (자동 로그인 대신 사용 시) | vehicle-dispatch-monitor |
| `BACKOFFICE_ORDER_API_VERSION` | 주문 조회 API 버전 (기본값: `v3`) | vehicle-dispatch-monitor |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | 차량배차 감시 목록 시트 ID | vehicle-dispatch-monitor |
| `GOOGLE_SHEETS_KEY_FILE` | Google Sheets 서비스 계정 키 파일 경로 | vehicle-dispatch-monitor |
| `GOOGLE_SHEETS_WORKSHEET_NAME` | 시트 이름 (기본값: `시트1`) | vehicle-dispatch-monitor |
| `SLACK_CHANNEL` | 차량배차 알림 채널 (기본값: `#제품팀_cs_notifications`) | vehicle-dispatch-monitor |
| `DHERO_API_URL` | 두발히어로 API Base URL (구: `DHERO_BASE_URL` — 2026-05-13 이름 통일) | large-bag-delivery-batch |
| `DHERO_TOKEN` | 두발히어로 Bearer 토큰 | large-bag-delivery-batch |
| `DHERO_SPOT_CODE` | 두발히어로 스팟 코드 | large-bag-delivery-batch |
| `DHERO_SPREADSHEET_ID` | 150L 봉투 배송 Google Sheets ID | large-bag-delivery-batch |
| `DHERO_SHEET_GID` | 배송 시트 GID | large-bag-delivery-batch |
| `SLACK_CHANNEL_ID` | 150L 배송 결과 알림 채널 ID | large-bag-delivery-batch |
| `SLACK_DM_USER_IDS` | DM 수신 유저 ID 목록 (콤마 구분) | large-bag-delivery-batch |
| `SLACK_UNSUPPORTED_MENTION_USER_ID` | 배송불가 알림 멘션 대상 유저 ID | large-bag-delivery-batch |
| `WEB2FORM_SPREADSHEET_ID` | 웹폼 응답 Google Sheets ID (기본값: 운영 시트) | web2form-alimtalk-batch |
| `WEB2FORM_SHEET_GID` | 웹폼 응답 시트 GID (기본값: `1695689664`) | web2form-alimtalk-batch |
| `WEB2FORM_PHONE_COL` | 전화번호 열 알파벳 (기본값: `C`) | web2form-alimtalk-batch |
| `WEB2FORM_NICKNAME_COL` | 닉네임 열 알파벳 (기본값: `B`) | web2form-alimtalk-batch |
| `WEB2FORM_SENT_COL` | 발송완료 마킹 열 알파벳 (기본값: `G`) | web2form-alimtalk-batch |
| `FLARELANE_GOVERNANCE_SLACK_TOKEN` | FlareLane 거버넌스 알림용 Slack 봇 토큰 (`커바니_동생`) | flarelane-governance-sync |
| `FLARELANE_GOVERNANCE_SLACK_CHANNEL` | FlareLane 거버넌스 알림 채널 ID 또는 채널명 (기본값: `#제품팀_프로덕트랩스`) | flarelane-governance-sync |
| `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` | 카카오 JS SDK 초기화 (공유 기능) | covering-invite, covering-invite-v2 |
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | Mixpanel 이벤트 트래킹 초기화 | covering-invite |
| `AIRBRIDGE_TOKEN` | Airbridge 트래킹 링크 API 인증 (서버사이드) | covering-invite, covering-invite-v2 |
| `INVITE_SLACK_CHANNEL_ID` | 친구초대 배치 결과 알림 채널 ID (기본값: `C0ARXKB2Y9L`) | covering-invite-batch |
| `EVENT_DICTIONARY_SHEET_ID` | 이벤트 딕셔너리 Google Sheet ID override (기본값: 검증된 운영 원장) | event-dictionary |
| `EVENT_DICTIONARY_SHEET_GID` | 이벤트 딕셔너리 worksheet numeric gid override (기본값: `1531837284`) | event-dictionary |
| `EVENT_DICTIONARY_BQ_PROJECT` | 이벤트 발화 수 조회 BigQuery project override (기본값: `covering-app-ccd23`) | event-dictionary |
| `EVENT_DICTIONARY_BQ_TABLE` | 이벤트 발화 수 조회 BigQuery table override (기본값: `covering-app-ccd23.mixpanel.mp_master_event`) | event-dictionary |
| `GOOGLE_APPLICATION_CREDENTIALS` | Google Sheets 읽기용 서비스 계정 JSON 경로. 값 자체는 커밋 금지 | event-dictionary |
| `GOOGLE_APPLICATION_CREDENTIALS_BQ` | BigQuery 조회용 서비스 계정 JSON 경로. 값 자체는 커밋 금지 | event-dictionary |
| `AIRBRIDGE_APP` | Airbridge 앱 식별자 (기본값: `coveringprod`) — GCP_PROJECT처럼 공통 변수이나 앱별 override 가능 | airbridge-ads-cost-sync |
| `BQ_LOCATION` | BigQuery 쿼리 실행 리전 | ai-productivity-scan-batch, airbridge-ads-cost-sync |
| `BQ_STREAMING_BUFFER_RETRIES` | BQ 스트리밍 삽입 재시도 횟수 | ai-productivity-scan-batch, airbridge-ads-cost-sync |
| `BQ_STREAMING_BUFFER_SLEEP_SECONDS` | BQ 스트리밍 재시도 대기 시간(초) | ai-productivity-scan-batch, airbridge-ads-cost-sync |
| `MIN_SIGNUP_DATE` | 유저 가입일 최소 필터 기준 | ai-productivity-scan-batch, airbridge-ads-cost-sync |
| `GEMINI_API_KEY` | Google Gemini AI API 키 | ai-productivity-scan-batch, voc-monitor |
| `AI_PRODUCTIVITY_APPROVER` | AI 생산성 스캔 결과 승인자 Slack ID | ai-productivity-scan-batch |
| `AI_PRODUCTIVITY_CHANNEL_ID` | AI 생산성 스캔 결과 알림 채널 ID | ai-productivity-scan-batch |
| `AI_PRODUCTIVITY_CHANNEL_NAME` | AI 생산성 스캔 결과 알림 채널명 | ai-productivity-scan-batch |
| `AUTH_VERIFICATION_MONITOR_LOOKBACK_DAYS` | 인증 검증 모니터 조회 기간(일) | auth-verification-monitor |
| `AUTH_VERIFICATION_MONITOR_SLACK_CHANNEL` | 인증 검증 모니터 알림 채널 | auth-verification-monitor |
| `BQ_BIN` | BigQuery CLI 바이너리 경로 | auth-verification-monitor, flarelane-d7-retention-monitor, new-region-weekly-monitor |
| `D7CRM_BQ_DATASET` | D7 CRM 모니터링 BigQuery 데이터셋 | d7-crm-monitoring |
| `D7CRM_PROMO_START` | D7 프로모션 시작일 | d7-crm-monitoring |
| `D7CRM_PROMO_END` | D7 프로모션 종료일 | d7-crm-monitoring |
| `FLARELANE_BEARER` | FlareLane API Bearer 토큰 | flarelane-live-monitoring |
| `FLARELANE_CONSOLE_BEARER` | FlareLane 콘솔 Bearer 토큰 | flarelane-live-monitoring |
| `FLARELANE_LIVE_BEARER` | FlareLane 라이브 Bearer 토큰 | flarelane-live-monitoring |
| `FLARELANE_MONITOR_SLACK_CHANNEL` | FlareLane 라이브 모니터링 알림 채널 | flarelane-live-monitoring |
| `PRODUCT_LABS_SLACK_CHANNEL` | 제품팀 프로덕트랩스 Slack 채널 ID | flarelane-live-monitoring |
| `ENG1559_FLARELANE_CONSOLE_BEARER` | FlareLane 콘솔 Bearer (ENG-1559 전용) | flarelane-d7-retention-monitor |
| `ENG1559_MONITOR_SLACK_CHANNEL` | ENG-1559 모니터링 알림 채널 | flarelane-d7-retention-monitor |
| `GROWTH_ROI_MONITOR_SLACK_CHANNEL` | Growth ROI 모니터 알림 채널 | growth-roi-slack-monitor |
| `GROWTH_ROI_MONITOR_STATE_FILE` | Growth ROI 모니터 상태 파일 경로 | growth-roi-slack-monitor |
| `NEW_REGION_DASHBOARD_URL` | 신규 지역 대시보드 URL | new-region-weekly-monitor |
| `NEW_REGION_THREAD_STATE_FILE` | 신규 지역 모니터 스레드 상태 파일 경로 | new-region-weekly-monitor |
| `NEW_REGION_WEEKLY_MONITOR_THREAD_TS` | Slack 스레드 타임스탬프 | new-region-weekly-monitor |
| `AARRR_REPORT_SLACK_CHANNEL` | AARRR 리포트 알림 Slack 채널 | aarrr-data-slack-report |
| `AARRR_REPORT_STATE_FILE` | AARRR 리포트 상태 파일 경로 | aarrr-data-slack-report |
| `VOC_TARGET_CHANNEL` | VOC 수집 대상 Slack 채널 ID | voc-monitor |
| `YAGAN_SUGEO_SLACK_CHANNEL` | 야간 수거 알림 Slack 채널 (5개 앱 공유) | yagan-large-bag-daily-report, yagan-large-bag-report, yagan-rider-alert, yagan-rider-gap-alert, yagan-sugeo-report |
| `SEONBYEOL_SLACK_CHANNEL` | 야간 선별 리포트 알림 채널 (`#운영팀_선별`) | yagan-seonbyeol-report |
| `FACEBOOK_ACCESS_TOKEN` | Meta Graph API 액세스 토큰 | meta-ads-automation |
| `META_GRAPH_VERSION` | Meta Graph API 버전 (기본값: `v21.0`) | meta-ads-automation |

**covering-talk 전용 변수** — Vercel 에서 마이그레이션된 통합 상담 플랫폼 (방문수거·런치·채널톡·대시보드)

> ⚠️ 일부 변수명(`SLACK_BOT_TOKEN`, `DHERO_TOKEN`, `DHERO_SPOT_CODE`)은 다른 앱과 이름이 같지만 **값이 다른 봇·다른 spot** 일 수 있다. `/shared/.env` 는 모든 앱이 공유하므로 분리 필요 시 `/shared/apps/covering-talk/.env` 에 분리 주입.
> ℹ️ 아래 공통 API 키들은 **public VM `/shared/.env`에 추가되어 covering-talk과 공유**됩니다: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `VOYAGE_AI_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY`, `NICEPAY_*`, `CHANNELTALK_ACCESS_KEY/SECRET`, `HT_*`, `HAPPYTALK_API_HOST`, `KAKAO_REST_API_KEY`, `BOLTA_*`, `SWEETTRACKER_*`, `DHERO_API_URL/DEV_API_URL`, `COVERING_SUPABASE_URL/KEY`.

| 변수명 | 용도 | 사용 앱 |
|---|---|---|
| `JWT_SECRET` | 세션 토큰 서명용 (강력한 랜덤 32자+, 변경 시 모든 사용자 재로그인) | covering-talk |
| `CRON_SECRET` | `/api/cron/*` 호출 인증용 — 외부 cron runner 의 `x-cron-secret` 헤더와 일치해야 통과 (middleware.ts 검증). public VM 외부 노출 보호. | covering-talk |
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저 측 자체 Supabase URL | covering-talk |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저 측 익명 키 | covering-talk |
| `SUPABASE_URL` | 서버 측 Supabase URL | covering-talk |
| `SUPABASE_ANON_KEY` | 서버 측 익명 키 | covering-talk |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 측 service role (RLS 우회) | covering-talk |
| `COVERING_SUPABASE_URL` | 외부 covering DB URL (방문수거 sendToCovering 단방향 동기화) | covering-talk |
| `COVERING_SUPABASE_KEY` | 외부 covering DB service role 키 | covering-talk |
| `ANTHROPIC_API_KEY` | Claude API (Sonnet 메인 + Haiku 톤·분류·커바니) | covering-talk |
| `OPENAI_API_KEY` | ChatGPT (응급용 — `app_settings.ai_provider="openai"` 시 활성) | covering-talk |
| `VOYAGE_AI_API_KEY` | 임베딩 (voyage-2 한국어, 채널톡 RAG) | covering-talk |
| `HAPPYTALK_API_HOST` | 해피톡 API 호스트 (방문수거) | covering-talk |
| `HT_CLIENT_ID` | 해피톡 방문수거 클라이언트 ID | covering-talk |
| `HT_CLIENT_SECRET` | 해피톡 방문수거 클라이언트 시크릿 | covering-talk |
| `SENDER_KEY` | 해피톡 방문수거 카카오 채널 sender key | covering-talk |
| `LUNCH_HAPPYTALK_API_HOST` | 해피톡 API 호스트 (런치) | covering-talk |
| `LUNCH_HT_CLIENT_ID` | 해피톡 런치 클라이언트 ID (방문과 동일 값) | covering-talk |
| `LUNCH_HT_CLIENT_SECRET` | 해피톡 런치 클라이언트 시크릿 (방문과 동일 값) | covering-talk |
| `LUNCH_SENDER_KEY` | 해피톡 런치 전용 sender key (방문과 다른 값, 2026-04-17 운영 전환) | covering-talk |
| `CHANNELTALK_APP_ID` | 채널톡 Native Functions 앱 ID | covering-talk |
| `CHANNELTALK_APP_SECRET` | 채널톡 앱 시크릿 | covering-talk |
| `CHANNELTALK_ACCESS_KEY` | 채널톡 Open API 액세스 키 | covering-talk |
| `CHANNELTALK_ACCESS_SECRET` | 채널톡 Open API 시크릿 | covering-talk |
| `CHANNELTALK_DESK_COOKIE` | 채널톡 Desk API (메시지 삭제용) — **30일 로테이션 필수** | covering-talk |
| `KAKAO_REST_API_KEY` | 카카오 Local API 주소 정규화 | covering-talk |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | Kakao Map JS SDK (대시보드 지역 지도 — 클라이언트 노출, NEXT_PUBLIC_*) | covering-talk |
| `NICEPAY_MID` | NicePay 가맹점 MID (방문/런치 공유) | covering-talk |
| `NICEPAY_MERCHANT_KEY` | NicePay 머천트 키 | covering-talk |
| `NICEPAY_USR_ID` | NicePay USER ID | covering-talk |
| `GOOGLE_CLIENT_ID` | Google OAuth 로그인 클라이언트 ID | covering-talk |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 로그인 시크릿 | covering-talk |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Sheets API service account 이메일 | covering-talk |
| `GOOGLE_PRIVATE_KEY` | Sheets API service account private key (multiline) | covering-talk |
| `GOOGLE_SHEET_ID` | 단건_수거 + 단건_정산 시트 ID (방문/런치 공유) | covering-talk |
| `GOOGLE_SHEET_GID` | 특정 탭 GID (선택) | covering-talk |
| `BOLTA_API_KEY` | Bolta 전자세금계산서 API 키 (런치 전용) | covering-talk |
| `BOLTA_CUSTOMER_KEY` | Bolta 고객 키 (우리=공급자) | covering-talk |
| `BOLTA_SUPPLIER_BIZ_NUMBER` | Bolta 공급자 사업자번호 | covering-talk |
| `BOLTA_SUPPLIER_NAME` | Bolta 공급자명 | covering-talk |
| `BOLTA_SUPPLIER_REP_NAME` | Bolta 공급자 대표자명 | covering-talk |
| `BOLTA_SUPPLIER_EMAIL` | Bolta 공급자 이메일 | covering-talk |
| `DHERO_API_URL` | 두발히어로 API URL (방문 전용 배송, 다른 앱과 다른 spot) | covering-talk |
| `DHERO_TOKEN` | 두발히어로 Bearer 토큰 (covering-talk 전용 spot 토큰) | covering-talk |
| `DHERO_SPOT_CODE` | 두발히어로 spot 코드 (다른 앱과 다른 spot) | covering-talk |
| `DHERO_DEV_API_URL` | 두발히어로 dev 환경 URL (선택) | covering-talk |
| `DHERO_DEV_TOKEN` | 두발히어로 dev 토큰 (선택) | covering-talk |
| `SLACK_BOT_TOKEN` | Slack 봇 토큰 (covering-talk 전용 봇, **다른 앱과 다른 값** 가능) | covering-talk |
| `SLACK_PICKUP_CHANNEL_ID` | 방문 익일 브리핑 채널 ID (fallback `C0AENH7JW2Y`) | covering-talk |
| `SWEETTRACKER_PROFILE_KEY` | 스윗트래커 비즈메시지 프로필 키 (실험실 — 김원빈/강성진만) | covering-talk |
| `SWEETTRACKER_USERID` | 스윗트래커 USER ID | covering-talk |

> 키 카탈로그 단일 진실의 원천: `apps/public/covering-talk/.env.example`. 그룹별 상세는 `apps/public/covering-talk/docs/ops/environment.md`.

**public VM `/shared/.env` 공통 변수** — covering-spot·covering-talk이 공유하는 API 키 (2026-05-13 추가)

> 아래 변수는 public VM의 `/shared/.env`에 추가되어 있습니다. covering-spot과 covering-talk 모두 재사용 가능합니다.
> `NEXT_PUBLIC_KAKAO_MAP_KEY`는 빌드 시점에 번들에 삽입되므로 재배포 없이는 브라우저에 반영되지 않습니다.

| 변수명 | 용도 | 사용 앱 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API 인증 | covering-spot, covering-talk |
| `OPENAI_API_KEY` | OpenAI API 인증 | covering-spot, covering-talk |
| `VOYAGE_AI_API_KEY` | Voyage AI 임베딩 API | covering-spot, covering-talk |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID (`@covering.app` 전용) | covering-spot, covering-talk |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 클라이언트 시크릿 | covering-spot, covering-talk |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Sheets 서비스 계정 이메일 | covering-spot, covering-talk |
| `GOOGLE_PRIVATE_KEY` | Google Sheets 서비스 계정 private key (PEM, `\n` 이스케이프) | covering-spot, covering-talk |
| `COVERING_SUPABASE_URL` | Covering 외부 DB URL (단방향 동기화용) | covering-spot, covering-talk |
| `COVERING_SUPABASE_KEY` | Covering 외부 DB service role 키 | covering-spot, covering-talk |
| `NICEPAY_MID` | NicePay 가맹점 MID | covering-spot, covering-talk |
| `NICEPAY_USR_ID` | NicePay USER ID | covering-spot, covering-talk |
| `NICEPAY_MERCHANT_KEY` | NicePay 머천트 키 | covering-spot, covering-talk |
| `CHANNELTALK_ACCESS_KEY` | 채널톡 Open API 액세스 키 | covering-spot, covering-talk |
| `CHANNELTALK_ACCESS_SECRET` | 채널톡 Open API 시크릿 | covering-spot, covering-talk |
| `HT_CLIENT_ID` | 해피톡 클라이언트 ID (방문수거) | covering-spot, covering-talk |
| `HT_CLIENT_SECRET` | 해피톡 클라이언트 시크릿 (방문수거) | covering-spot, covering-talk |
| `HAPPYTALK_API_HOST` | 해피톡 API 호스트 (방문수거) | covering-spot, covering-talk |
| `LUNCH_HT_CLIENT_ID` | 해피톡 런치 클라이언트 ID | covering-spot, covering-talk |
| `LUNCH_HT_CLIENT_SECRET` | 해피톡 런치 클라이언트 시크릿 | covering-spot, covering-talk |
| `LUNCH_HAPPYTALK_API_HOST` | 해피톡 런치 API 호스트 | covering-spot, covering-talk |
| `KAKAO_REST_API_KEY` | 카카오 REST API 키 (주소 정규화) | covering-spot, covering-talk |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오 지도 JS API 키 (빌드 시점 번들 삽입) | covering-spot, covering-talk |
| `BOLTA_API_KEY` | Bolta 전자세금계산서 API 키 | covering-spot, covering-talk |
| `BOLTA_CUSTOMER_KEY` | Bolta 고객 키 | covering-spot, covering-talk |
| `BOLTA_SUPPLIER_BIZ_NUMBER` | Bolta 공급자 사업자번호 | covering-spot, covering-talk |
| `BOLTA_SUPPLIER_NAME` | Bolta 공급자명 | covering-spot, covering-talk |
| `BOLTA_SUPPLIER_REP_NAME` | Bolta 공급자 대표자명 | covering-spot, covering-talk |
| `BOLTA_SUPPLIER_EMAIL` | Bolta 공급자 이메일 | covering-spot, covering-talk |
| `SWEETTRACKER_PROFILE_KEY` | 스윗트래커 비즈메시지 프로필 키 | covering-spot, covering-talk |
| `SWEETTRACKER_USERID` | 스윗트래커 USER ID | covering-spot, covering-talk |
| `DHERO_API_URL` | 두발히어로 운영 API URL (토큰·스팟코드는 앱별 `.env.local` 관리) | covering-spot, covering-talk |
| `DHERO_DEV_API_URL` | 두발히어로 개발 API URL | covering-spot, covering-talk |

**covering-talk 전용 변수** — `/shared/apps/covering-talk/.env.local`에서 관리

> covering-talk은 자체 Supabase 인스턴스와 채널톡 앱을 사용합니다. 아래 변수는 covering-spot과 값이 다릅니다.

| 변수명 | 용도 | 비고 |
|---|---|---|
| `NODE_ENV` | 런타임 환경 | `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저 측 Supabase URL (covering-talk 전용 인스턴스) | `nnxaqmeavmcvyqhehuvn` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저 측 Supabase 익명 키 | — |
| `SUPABASE_URL` | 서버 측 Supabase URL | 위와 동일 값 |
| `SUPABASE_ANON_KEY` | 서버 측 Supabase 익명 키 | — |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 측 service role (RLS 우회) | — |
| `JWT_SECRET` | 세션 토큰 서명용 키 (32자+) | — |
| `CHANNELTALK_APP_ID` | 채널톡 Native Functions 앱 ID (covering-talk 전용) | — |
| `CHANNELTALK_APP_SECRET` | 채널톡 앱 시크릿 | — |
| `CHANNELTALK_DESK_COOKIE` | 채널톡 Desk API 쿠키 — **30일 로테이션 필수** | — |
| `GOOGLE_SHEET_ID` | covering-talk 전용 시트 ID | — |
| `GOOGLE_SHEET_GID` | 특정 탭 GID | — |
| `DHERO_TOKEN` | 두발히어로 Bearer 토큰 (covering-talk 전용 spot) | — |
| `DHERO_SPOT_CODE` | 두발히어로 spot 코드 (`10558`) | — |
| `DHERO_DEV_TOKEN` | 두발히어로 개발 토큰 (선택) | — |
| `SENDER_KEY` | 해피톡 방문수거 카카오 채널 sender key | — |
| `LUNCH_SENDER_KEY` | 해피톡 런치 전용 sender key | — |
| `USE_V3_PHASES` | V3 단계 활성화 플래그 | `true` |
| `NEXT_PUBLIC_PROMO_TRIP_FEE_CAP` | 프로모션 건당 요금 상한 (브라우저 측) | — |
| `PROMO_TRIP_FEE_CAP` | 프로모션 건당 요금 상한 (서버 측) | — |

---

## 서비스별 공통 환경변수 재사용 가이드

새 앱에서 아래 서비스를 사용할 때, **이미 VM `/shared/.env`에 값이 설정된 변수를 별도 추가 없이 바로 사용할 수 있습니다.**

> **확인 방법**: `sudo cat /shared/.env` (private VM에서 jun@ 계정으로)
> **원칙**: 레지스트리에 있는 변수는 값을 다시 추가하지 말고 그대로 재사용하세요.

---

### Slack 메시지 전송 (`SLACK_BOT_TOKEN`)

이미 설정됨 — 새 앱에서 추가 없이 사용 가능.

```python
# batch (Python) — config.py에 추가
SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")
```

```typescript
// nextjs / nestjs
const slackToken = process.env.SLACK_BOT_TOKEN;
```

> 봇 토큰은 공유. **채널 ID는 앱마다 다르므로 앱별 변수로 등록** (예: `MY_APP_SLACK_CHANNEL`).

---

### FlareLane 푸시 알림 (`FLARELANE_PROJECT_ID`, `FLARELANE_API_KEY`)

이미 설정됨 — 재사용 가능.

```python
FLARELANE_PROJECT_ID = os.environ.get("FLARELANE_PROJECT_ID", "")
FLARELANE_API_KEY = os.environ.get("FLARELANE_API_KEY", "")
```

---

### GCP / BigQuery (`GCP_PROJECT`)

이미 설정됨 (`covering-app-ccd23`) — VM 서비스 계정으로 자동 인증되므로 키 파일 불필요.

```python
GCP_PROJECT = os.environ.get("GCP_PROJECT", "covering-app-ccd23")
# bigquery.Client(project=GCP_PROJECT) 로 바로 사용
```

```python
# google.auth.default() 로 자동 인증 — 키 파일 설정 없이 동작
import google.auth
creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/bigquery"])
```

---

### Airbridge 광고 트래킹 (`AIRBRIDGE_TOKEN`, `AIRBRIDGE_APP`)

이미 설정됨 — 재사용 가능.

```python
AIRBRIDGE_TOKEN = os.environ.get("AIRBRIDGE_TOKEN", "")
AIRBRIDGE_APP   = os.environ.get("AIRBRIDGE_APP", "coveringprod")
```

---

### 두발히어로 배송 (`DHERO_API_URL`, `DHERO_TOKEN`, `DHERO_SPOT_CODE`)

이미 설정됨 (large-bag 전용 spot) — 재사용 가능.

> **주의**: 2026-05-13부터 `DHERO_BASE_URL` → `DHERO_API_URL`로 이름 통일. 기존 `DHERO_BASE_URL`은 하위 호환 fallback으로 유지되나 신규 코드에서는 `DHERO_API_URL` 사용.

```python
DHERO_API_URL   = os.environ.get("DHERO_API_URL", "")
DHERO_TOKEN     = os.environ.get("DHERO_TOKEN", "")
DHERO_SPOT_CODE = os.environ.get("DHERO_SPOT_CODE", "")
```

> ⚠️ covering-spot-chatbot은 **별도 spot**을 사용합니다. 앱 `.env`에 `DHERO_API_URL`, `DHERO_TOKEN`, `DHERO_SPOT_CODE`를 별도 값으로 주입하세요.

---

### 채널톡 (`CHANNELTALK_ACCESS_KEY`, `CHANNELTALK_ACCESS_SECRET`)

이미 설정됨 — 재사용 가능. 단, 현재 vehicle-dispatch-monitor 전용 계정 값으로 설정됨.

```python
CHANNELTALK_ACCESS_KEY    = os.environ.get("CHANNELTALK_ACCESS_KEY", "")
CHANNELTALK_ACCESS_SECRET = os.environ.get("CHANNELTALK_ACCESS_SECRET", "")
```

> ⚠️ 다른 앱에서 사용 전, 해당 채널톡 계정이 여러 앱에서 공유 가능한 계정인지 확인하세요.

---

### 백오피스 자동 로그인 (`BACKOFFICE_EMAIL`, `BACKOFFICE_PASSWORD`)

이미 설정됨 — 재사용 가능.

```python
BACKOFFICE_EMAIL    = os.environ.get("BACKOFFICE_EMAIL", "")
BACKOFFICE_PASSWORD = os.environ.get("BACKOFFICE_PASSWORD", "")
```

---

### 새 앱에서 공통 변수 사용 표준 절차

```text
1. 이 가이드에서 사용할 서비스 확인
   └─ 레지스트리에 이미 있음 → 코드에서 os.environ.get("변수명")으로 바로 사용
   └─ 레지스트리에 없음     → 아래 2번으로

2. 없는 경우 — 레지스트리 먼저 등록
   a. apps/AGENTS.md 레지스트리 테이블에 변수명 추가
   b. VM에서 직접 값 추가: sudo -u sa_109369409955768144646 nano /shared/.env
   c. 코드에서 사용

3. 앱별 고유 값 (채널 ID, 시트 ID 등)
   └─ 앱 README.md "환경변수" 섹션에 문서화
   └─ 변수명에 앱 prefix 사용 권장 (예: MYAPP_SLACK_CHANNEL)
```

---

## 배포 실패 시 디버깅

### 1. GitHub Actions 로그 확인

```
https://github.com/covering-app/covering-labs/actions
```

`deploy` 또는 `undeploy` 워크플로 → 실패한 job 클릭 → 단계별 로그 확인

### 2. VM에서 직접 확인

#### VM별 디버깅

##### private VM (covering-labs-instance-20260306-050059)

```bash
# PM2 앱 상태
sudo -u sa_109369409955768144646 pm2 list

# 앱 에러 로그 (nextjs/nestjs)
sudo -u sa_109369409955768144646 pm2 logs [앱이름] --lines 50

# batch 로그
tail -50 /shared/apps/[앱이름]/logs/batch.log

# nginx 상태
sudo nginx -t
sudo systemctl status nginx --no-pager | head -10

# 포트 배정 현황
cat /shared/port-registry.json
```

##### public VM (covering-labs-public)

```bash
gcloud compute ssh covering-labs-public \
  --zone=asia-northeast3-a --project=covering-app-ccd23
```

### 3. 앱 수동 재시작

```bash
# nextjs/nestjs
sudo -u sa_109369409955768144646 pm2 restart [앱이름]

# batch crontab 확인
sudo cat /var/spool/cron/crontabs/sa_109369409955768144646
```

### 4. 배포가 안 트리거될 때

undeploy는 `deploy.yml` 파일 자체가 삭제(`git rm`)되어야 트리거됩니다. 다른 파일만 삭제하면 undeploy가 실행되지 않습니다.

---

## 배포 후 접속 주소

**private 앱 (VPN 필수):**
```
https://labs.covering.app/[앱이름]
```
**AWS Client VPN (`covering-vpn-v2`) 연결이 필요합니다.**
VPN 미연결 시 접근 불가. 자세한 내용은 `AGENTS.md` 방화벽 섹션 참조.

IP 직접 접근(`http://34.64.177.181/[앱이름]`)은 nginx default server 에서 VPN 전용 차단 적용됨 → VPN 상태라도 앱으로 라우팅되지 않음. 반드시 도메인 사용.

**public 앱 (VPN 불필요):**
```
https://public-labs.covering.app/[앱이름]
```
VPN 없이 접근 가능.

---

## 앱 제거

앱 폴더를 삭제하고 push하면 자동으로 내려갑니다.

```bash
git rm -r apps/private/[앱이름]/   # private 앱
# 또는
git rm -r apps/public/[앱이름]/    # public 앱
git commit -m "chore: [앱이름] 제거"

# main에 직접 push 금지 — 브랜치 + PR 필수
git checkout -b fix/$(date +%Y-%m-%d)-remove-[앱이름]
git push origin fix/$(date +%Y-%m-%d)-remove-[앱이름]
gh pr create --title "chore: [앱이름] 제거" --body "앱 삭제"
```

자동 처리: PM2 중지/삭제 → nginx conf 제거 → 포트 반환 → 파일 삭제 → Slack 알림

---

## 개발 순서 (AI 에이전트 필수 준수)

앱 개발/수정 요청이 들어오면 반드시 아래 순서를 따릅니다.

### 1단계 — 구현

- `apps/[앱이름]/` 하위에서만 작업
- 타입별 필수 파일 구성은 "타입별 파일 구성" 섹션 참조

### 2단계 — 테스트 코드 작성

구현한 로직에 대한 테스트를 작성합니다.

**Next.js (Jest + React Testing Library):**
```bash
# apps/[앱이름]/에서
npm install --save-dev jest @testing-library/react @testing-library/jest-dom
```

**NestJS (Jest):**
```bash
# NestJS는 package.json에 jest 기본 포함
npm run test
```

**batch (Python):**
```bash
# pytest 사용
pip install pytest
pytest src/
```

테스트가 불가능한 순수 설정 파일이나 단순 정적 페이지는 생략 가능. 단, 비즈니스 로직이 있으면 반드시 작성.

### 3단계 — LSP 진단

TypeScript 앱(Next.js, NestJS)은 빌드 전 타입 오류를 확인합니다.

```bash
# Next.js
npx tsc --noEmit

# NestJS
npx tsc --noEmit -p tsconfig.build.json
```

오류가 0건이어야 다음 단계로 넘어갑니다.

### 4단계 — 로컬 실행 확인 (권장)

가능하면 로컬에서 앱을 직접 실행해 동작을 확인합니다. `node_modules/`, `.next/`, `dist/` 는
`.gitignore` 로 커밋되지 않으니 로컬에서 자유롭게 생성하세요.

```bash
# Next.js (브라우저로 http://localhost:3000 접속)
npm install
npm run dev

# NestJS (API 포트 확인)
npm install
npm run start:dev

# batch (1회 실행 테스트)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 src/main.py
```

### 5단계 — 로컬 빌드 확인

```bash
# Next.js
npm run build

# NestJS
npm run build   # dist/ 생성 확인

# batch
python3 -m py_compile src/main.py   # 구문 오류 확인
```

빌드가 성공하면 **여기서 `git commit` 까지만 수행하고 멈춥니다.**
사용자가 "배포 준비해줘 / 배포해줘 / PR 올려줘" 같은 **명시적 배포 키워드**를 지시하면
그때 브랜치 push + `gh pr create` 를 실행하세요. (AGENTS.md § "개발 기본 흐름" 참조)

### 완료 기준 체크리스트

- [ ] 구현 완료
- [ ] **README.md 작성 완료** (아래 "README 필수 규칙" 참조)
- [ ] 테스트 코드 작성 및 통과
- [ ] `tsc --noEmit` 오류 0건 (TypeScript 앱)
- [ ] 빌드 성공
- [ ] 민감 정보 처리 확인 (아래 섹션 참조)
- [ ] 보안 규약 준수 확인 (`docs/09_보안_규약.md` § AI 개발 요청 체크리스트)

---

## README 필수 규칙

> **모든 앱에 README.md가 있어야 합니다.** 앱 생성 시 README 없이 PR을 열지 마세요.

### 필수 섹션

모든 README.md는 아래 섹션을 반드시 포함해야 합니다.

```markdown
# [앱이름]
한 줄 설명

## 목적
무엇을 언제 왜 하는가 (2-3문장)

## 실행 환경
- 실행 방식 (cron / PM2 / GitHub Actions)
- 실행 주기
- 실행 서버

## 주요 파일
파일별 역할 설명

## 환경변수
필수 환경변수 목록과 설명

## 실행 방법
```bash
# 실행 명령어
\```

## 의존 서비스
외부 API, DB 등

## 주의사항
운영 시 알아야 할 것들
```

### 타입별 필수 파일 구성에 README 추가

**batch:**
```
apps/[앱이름]/
├── README.md         ← 필수
├── deploy.yml
├── requirements.txt
├── logs/
└── src/
    └── main.py
```

**nextjs / nestjs:**
```
apps/[앱이름]/
├── README.md         ← 필수
├── deploy.yml
├── package.json
└── ...
```

### README 작성 시점

- 신규 앱 생성 → 구현 완료 후 PR 열기 전에 작성
- 기존 앱 대규모 수정 → 내용 반영해서 업데이트
- README 없는 앱 발견 → 그 자리에서 작성 후 커밋

---

## 민감 정보 처리 규칙

### 절대 금지

| 금지 사항 | 이유 |
|---|---|
| API 키, 비밀번호, 토큰을 코드에 하드코딩 | git 히스토리에 영구 기록 → 유출 불가 삭제 |
| `.env` 파일을 `git add`/커밋 | `.gitignore`에 등록되어 있으나 실수 방지를 위해 명시 |
| `*.json` 키 파일 (`service-account.json`, `credentials.json` 등) 앱 디렉토리에 저장 | 키 파일은 절대 레포에 저장하지 않음 |
| `secrets/`, `keys/`, `certs/` 디렉토리를 `apps/` 하위에 생성 | 구조 자체가 키 저장 유도 |

### 비개발자에게 반드시 안내해야 하는 상황

구현 중 아래 상황이 발생하면 **코딩을 멈추고 사용자에게 먼저 안내**합니다:

1. **외부 API 키가 필요한 경우**
   > "이 기능은 [서비스명] API 키가 필요합니다. VM의 `/shared/.env`에 `KEY_NAME=값` 형태로 직접 추가해주세요. (방법: 이 문서 → '환경변수 처리' 섹션 또는 `docs/08_비개발자_가이드.md` → '민감한 정보 관리법' 참조)"

2. **데이터베이스 접속 정보가 필요한 경우**
   > "DB_URL 등 접속 정보가 필요합니다. `/shared/.env` 또는 앱 디렉토리 `.env`에 직접 입력해주세요. 코드에는 `process.env.DB_URL`로만 참조합니다."

3. **GCP 서비스 계정 키 파일 요청이 들어온 경우**
   > "GCP 서비스 접근은 VM의 서비스 계정이 자동 처리합니다. 키 파일 없이 `google.auth.default()`로 인증됩니다. 키 파일은 불필요하며 레포에 저장할 수 없습니다."

### 올바른 환경변수 사용법

```bash
# VM에서 직접 추가 (jun@로 실행)
sudo -u sa_109369409955768144646 nano /shared/.env
```

앱 코드에서는 항상 환경변수로만 참조:
```python
# batch
import os
api_key = os.environ.get("MY_API_KEY")
if not api_key:
    raise ValueError("MY_API_KEY가 설정되지 않았습니다")
```
```typescript
// nextjs / nestjs
const apiKey = process.env.MY_API_KEY;
if (!apiKey) throw new Error('MY_API_KEY가 설정되지 않았습니다');
```

---

## 주의사항

- 폴더 이름 = URL 경로 = 앱 식별자 **(한 번 정하면 변경 불가)**
- `_template/` 폴더는 예시용 — 수정하거나 배포 대상으로 사용하지 마세요
- batch 스케줄 시간은 **KST 기준**
- 포트는 자동 배정 (직접 지정 불가)
- 같은 커밋에 여러 앱을 변경하면 모두 병렬 배포됩니다
