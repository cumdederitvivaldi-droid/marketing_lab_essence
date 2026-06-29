# Apps 배포 가이드

## 새 앱 배포하기

### 1단계 — private / public 결정

| 구분 | 디렉토리 | 접속 방식 | 허용 타입 |
|---|---|---|---|
| **private** | `apps/private/[앱이름]/` | AWS Client VPN 필수 (`labs.covering.app`) | `nextjs`, `nestjs`, `batch` |
| **public** | `apps/public/[앱이름]/` | VPN 불필요, 외부 공개 (`public-labs.covering.app`) | `nextjs`, `nestjs` **only** |

> **🔴 batch 앱은 반드시 `apps/private/` 에 배치.** `apps/public/` 아래 `type: batch` 는 GitHub Actions가 배포 실패시킵니다.

### 2단계 — 디렉토리 만들기

```
apps/private/내-앱-이름/    ← VPN 전용
├── deploy.yml              ← 필수
└── ...코드...

# 또는
apps/public/내-앱-이름/     ← 공개 (nextjs/nestjs만)
├── deploy.yml              ← 필수
└── ...코드...
```

### 3단계 — deploy.yml 작성

**배치 스크립트 (private 전용):**
```yaml
name: my-batch          # 앱 이름
type: batch
schedule: "0 9 * * 1-5" # 실행 시간 (cron 형식, KST)
command: "python3 src/main.py"
```

**Next.js 서버 (private/public 둘 다 가능):**
```yaml
name: my-nextjs
type: nextjs
```

**NestJS 서버 (private/public 둘 다 가능):**
```yaml
name: my-nestjs
type: nestjs
```

### 4단계 — 브랜치 push 및 PR 생성

```bash
git add apps/private/내-앱-이름/   # 또는 apps/public/
git commit -m "feat: 내 앱 추가"

# main 직접 push 금지 — 브랜치 + PR 필수
git checkout -b feat/$(date +%Y-%m-%d)-내-앱-이름
git push origin feat/$(date +%Y-%m-%d)-내-앱-이름
gh pr create --title "feat: 내 앱 추가" --body "변경 내용 설명"
```

PR 생성 후 CodeRabbit 코드 리뷰 → 승인 시 자동 머지 + GitHub Actions 자동 배포. 완료 시 Slack으로 접속 주소를 알려줍니다.

> 🔒 **private 앱**: `https://labs.covering.app/[앱이름]` — Client VPN 연결 필요
> 🌐 **public 앱**: `https://public-labs.covering.app/[앱이름]` — VPN 불필요, 외부 접근 가능

---

## 앱 제거하기

앱 폴더를 삭제하고 push하면 자동으로 서버에서 내려갑니다.

```bash
git rm -r apps/private/내-앱-이름/   # 또는 apps/public/
git commit -m "chore: 내-앱-이름 제거"

# main 직접 push 금지 — 브랜치 + PR 필수
git checkout -b fix/$(date +%Y-%m-%d)-remove-내-앱-이름
git push origin fix/$(date +%Y-%m-%d)-remove-내-앱-이름
gh pr create --title "chore: 내-앱-이름 제거" --body "앱 삭제"
```

PR 머지 후 자동으로 PM2 중지, nginx 설정 삭제, 포트 반환까지 처리됩니다.

---

## 주의사항

- 폴더 이름 = URL 경로 = 앱 식별자 (변경 불가)
- `_template/` 폴더는 예시용이므로 수정하지 마세요
- 배치 스크립트 시간은 **서버 시간 기준 (KST)**
- public VM은 site-to-site VPN 미연결 — 내부 AWS 리소스/Admin API 접근 불가

## cron 시간 예시

| 표현 | 의미 |
|---|---|
| `0 9 * * 1-5` | 평일 오전 9시 |
| `0 8 * * *` | 매일 오전 8시 |
| `*/30 * * * *` | 30분마다 |
| `0 6 * * 1` | 매주 월요일 오전 6시 |
