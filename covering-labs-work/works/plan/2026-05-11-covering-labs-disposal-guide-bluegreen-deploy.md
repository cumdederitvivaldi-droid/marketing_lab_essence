# 링퀴즈 Blue/Green 배포 플랜

> 유형: 플랜
> 작성일: 2026-05-11
> 상태: 검토중

## 목표

링퀴즈(`apps/public/disposal-guide`)를 고객 장애 없이 운영 배포할 수 있도록 기존 운영 프로세스를 유지한 채 새 버전을 별도 포트에서 검증하고, 검증 통과 후 nginx 라우팅만 전환하는 수동 blue/green 배포 경로를 만든다.

## 현황 분석

- 현재 공개 URL은 `https://public-labs.covering.app/disposal-guide`이고 public VM의 nginx가 `/disposal-guide`를 `localhost:3008`로 라우팅한다.
- 기존 자동 배포는 `/shared/apps/disposal-guide` 운영 디렉터리에서 `npm install`, `next build`, `pm2 restart`를 수행한다.
- `origin/main`의 `scripts/deploy-app.sh`에는 nginx 설정 rollback은 있지만 release 디렉터리, 후보 포트 검증, 프로세스 단위 rollback은 없다.
- 링퀴즈는 Next.js `basePath: /disposal-guide`를 사용하므로 health check는 `/`가 아니라 `/disposal-guide`와 `/disposal-guide/_next/static/...` asset을 확인해야 한다.

## 구현 계획

### 1단계: 수동 blue/green 경로 추가

- 새 workflow `.github/workflows/deploy-disposal-guide-bluegreen.yml`를 `workflow_dispatch` 전용으로 추가한다.
- 실행 확인 input을 요구해 실수 실행을 막는다.
- `main` 브랜치에서만 실행되게 막는다.
- checkout된 `apps/public/disposal-guide`를 tarball로 묶어 public VM에 업로드한다.
- VM에서 새 스크립트 `scripts/deploy-disposal-guide-bluegreen.sh`를 실행한다.

### 2단계: VM 배포 스크립트

- release 경로: `/shared/releases/disposal-guide/<commit-sha>`
- 상태 파일: `/shared/apps-state/disposal-guide.json`
- blue/green 포트: `3108`, `3109`
- PM2 프로세스명: `disposal-guide-blue`, `disposal-guide-green`
- 후보 release에서 `npm ci`, `npm run typecheck`, `npm test`, `npm run build` 실행
- 후보 포트에서 PM2 start 후 local health와 Next asset health 확인
- `nginx -t` 통과 후에만 nginx reload
- 외부 URL과 외부 Next asset 확인 후 상태 파일 갱신
- 실패 시 기존 nginx conf와 기존 active 프로세스는 유지

### 3단계: 운영 전환 기준

- 첫 실행은 GitHub Actions manual workflow로만 수행한다.
- 기존 `Deploy Apps` 자동 workflow는 `apps/public/disposal-guide/**` 변경을 레거시 방식으로 자동 배포하지 않도록 제외한다.
- 기존 `scripts/deploy-app.sh`는 이번 변경에서 수정하지 않는다.
- 첫 성공 이후에만 범용 `deploy-app-bluegreen.sh` opt-in 전환을 별도 작업으로 검토한다.

## 완료 기준

- 새 workflow와 스크립트가 shell syntax 검증을 통과한다.
- 링퀴즈 앱의 typecheck, test, build가 로컬에서 통과한다.
- 배포 스크립트가 dry-run에서 변경 대상, release, port, health 기준을 출력한다.
- 실제 운영 전환은 사용자 승인 후 manual workflow로만 실행한다.

## 검증 결과

- `bash -n scripts/deploy-disposal-guide-bluegreen.sh` 통과
- `bash scripts/deploy-disposal-guide-bluegreen.sh --dry-run` 통과
- workflow YAML parse 통과
- `git diff --check` 통과
- `npm run typecheck` 통과
- `npm test -- --runInBand` 통과: 75 tests
- `npm run build` 통과
- local production server에서 `/disposal-guide`, `_next/static/<BUILD_ID>/_buildManifest.js`, `noticeBoardGraphic.svg` 확인
- public VM read-only 확인: 현재 active는 `3008`, `3108`/`3109`는 listening 없음
- 운영 URL `https://public-labs.covering.app/disposal-guide` HTTP 200 확인

## 첫 운영 배포 시도 결과

- GitHub Actions run `25671717934`
- local preflight, VM install, typecheck, test, build 통과
- candidate PM2 `disposal-guide-blue`가 `3108`에서 시작됨
- nginx가 candidate로 전환됐으나 외부 health check가 전환 직후 old response를 보고 실패 처리
- 스크립트가 nginx conf를 기존 `3008`로 rollback
- 운영 URL은 계속 HTTP 200 유지
- 확인된 보완점:
  - nginx reload 직후 외부 health는 단발 체크가 아니라 retry가 필요하다.
  - deploy SA umask 때문에 nginx conf가 `600`으로 생성될 수 있어 `chmod 664` 보정이 필요하다.

## Rollback 기준

아래 중 하나라도 발생하면 nginx active upstream을 바꾸지 않는다. 이미 바뀐 뒤라면 이전 nginx conf로 복구하고 reload한다.

- candidate local `/disposal-guide` health 실패
- candidate `_next/static` asset health 실패
- `nginx -t` 실패
- nginx reload 실패
- 외부 URL 5xx 또는 asset 404
- candidate PM2 프로세스 unstable

## 성공 후 수동 Rollback 절차

배포 workflow가 성공했지만 5~10분 안에 화면, 전환, 로그 이상이 발견되면 public VM에서 이전 포트로 nginx를 되돌린다. 첫 blue/green 전환에서는 이전 포트가 기존 운영 포트 `3008`이다. 이후부터는 `/shared/apps-state/disposal-guide.json`의 `previousPort`를 기준으로 한다.

```bash
PREVIOUS_PORT=$(python3 - <<'PY'
import json
from pathlib import Path

state = Path("/shared/apps-state/disposal-guide.json")
if state.exists():
    data = json.loads(state.read_text())
    print(data.get("previousPort") or 3008)
else:
    print(3008)
PY
)

cp /shared/nginx-confs/disposal-guide.conf \
  "/shared/nginx-confs/disposal-guide.conf.rollback.$(date -u +%Y%m%d%H%M%S)"

cat > /shared/nginx-confs/disposal-guide.conf <<EOF
location = /disposal-guide {
    proxy_pass http://localhost:${PREVIOUS_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_cache_bypass \$http_upgrade;
}

location ^~ /disposal-guide/ {
    proxy_pass http://localhost:${PREVIOUS_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_cache_bypass \$http_upgrade;
}
EOF

sudo -n nginx -t
sudo -n nginx -s reload
curl -fsS https://public-labs.covering.app/disposal-guide >/dev/null
```

Rollback 후에는 외부 URL, 대표 화면, `noticeBoardGraphic.svg`, Next static asset을 다시 확인한다. 문제가 사라지면 candidate PM2 프로세스 삭제와 release 정리는 별도 후속 작업으로 처리하고, 즉시 삭제하지 않는다.

## 변경 파일

- `.github/workflows/deploy-disposal-guide-bluegreen.yml`
- `.github/workflows/deploy.yml`
- `scripts/deploy-disposal-guide-bluegreen.sh`
- `works/plan/2026-05-11-covering-labs-disposal-guide-bluegreen-deploy.md`
