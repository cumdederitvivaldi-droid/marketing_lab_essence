#!/bin/bash
# deploy-app.sh — 앱 배포 스크립트 (VM에서 실행)
# Usage: bash /shared/scripts/deploy-app.sh <app-name>
set -e

APP_NAME="$1"
APP_DIR="/shared/apps/$APP_NAME"
PORT_REGISTRY="/shared/port-registry.json"
NGINX_CONF_DIR="/shared/nginx-confs"
ENV_FILE="/shared/.env"

[ -f "$ENV_FILE" ] && source "$ENV_FILE"

log() { echo "[$(date '+%H:%M:%S')] [deploy:$APP_NAME] $*"; }
fail() { log "ERROR: $*"; exit 1; }

[ -z "$APP_NAME" ] && fail "앱 이름을 입력하세요"
[ -d "$APP_DIR" ] || fail "앱 디렉토리 없음: $APP_DIR"

DEPLOY_CONF="$APP_DIR/deploy.yml"
[ -f "$DEPLOY_CONF" ] || fail "deploy.yml 없음: $DEPLOY_CONF"

APP_TYPE=$(grep '^type:' "$DEPLOY_CONF" | awk '{print $2}' | tr -d '"')
APP_DISPLAY=$(grep '^name:' "$DEPLOY_CONF" | awk '{print $2}' | tr -d '"')

log "시작: $APP_DISPLAY (type=$APP_TYPE)"

# ── 포트 자동 배정 (파일 잠금으로 병렬 배포 race condition 방지) ──────────
assign_port() {
  python3 - <<PYEOF
import json, fcntl, os
registry = "$PORT_REGISTRY"
try:
    f = open(registry, "r+")
except FileNotFoundError:
    f = open(registry, "w+")
    f.write("{}")
    f.seek(0)

fcntl.flock(f, fcntl.LOCK_EX)
try:
    content = f.read()
    reg = json.loads(content) if content.strip() else {}
    if "$APP_NAME" in reg:
        print(reg["$APP_NAME"])
    else:
        used = set(reg.values())
        port = 3001
        while port in used:
            port += 1
        reg["$APP_NAME"] = port
        f.seek(0)
        f.truncate()
        json.dump(reg, f, indent=2)
        print(port)
finally:
    fcntl.flock(f, fcntl.LOCK_UN)
    f.close()
PYEOF
}

# ── Next.js 배포 ──────────────────────────────────────────────
deploy_nextjs() {
  PORT=$(assign_port)
  log "포트: $PORT"
  cd "$APP_DIR"

  # basePath 설정 (없으면 자동 생성)
  if [ ! -f "next.config.js" ] && [ ! -f "next.config.ts" ] && [ ! -f "next.config.mjs" ]; then
    cat > next.config.js <<EOF
/** @type {import('next').NextConfig} */
const nextConfig = { basePath: '/$APP_NAME' };
module.exports = nextConfig;
EOF
    log "next.config.js 생성 (basePath=/$APP_NAME)"
  fi

  npm install --legacy-peer-deps --silent
  NODE_OPTIONS="--max-old-space-size=3072" PORT=$PORT npx next build

  if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
    PORT=$PORT pm2 restart "$APP_NAME" --update-env
  else
    PORT=$PORT pm2 start npm --name "$APP_NAME" -- start
  fi
  pm2 save
  update_nginx "$PORT"
}

# ── NestJS 배포 ───────────────────────────────────────────────
deploy_nestjs() {
  PORT=$(assign_port)
  log "포트: $PORT"
  cd "$APP_DIR"

  npm install --silent
  npm run build

  if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
    PORT=$PORT pm2 restart "$APP_NAME" --update-env
  else
    PORT=$PORT pm2 start dist/main.js --name "$APP_NAME"
  fi
  pm2 save
  update_nginx "$PORT"
}

# ── 배치 배포 ─────────────────────────────────────────────────
deploy_batch() {
  SCHEDULE=$(grep '^schedule:' "$DEPLOY_CONF" | sed 's/^schedule: *//' | tr -d '"' | sed 's/[[:space:]]*#.*//')
  COMMAND=$(grep '^command:' "$DEPLOY_CONF" | sed 's/^command: *//' | tr -d '"' | sed 's/[[:space:]]*#.*//')

  [ -z "$SCHEDULE" ] && fail "deploy.yml에 schedule 없음"
  [ -z "$COMMAND" ]  && fail "deploy.yml에 command 없음"

  # Python 의존성 설치
  if [ -f "$APP_DIR/requirements.txt" ]; then
    pip install --break-system-packages -q -r "$APP_DIR/requirements.txt"
    log "requirements.txt 설치 완료"
  fi

  mkdir -p "$APP_DIR/logs"

  # 앱별 민감 환경변수는 GitHub Secrets에서 배포 시 주입하고, 앱 디렉토리의 비공개 .env로 저장한다.
  # 저장소에는 토큰을 커밋하지 않는다.
  if [ "$APP_NAME" = "airbridge-ads-cost-sync" ] && [ -n "${AIRBRIDGE_TOKEN:-}" ]; then
    umask 077
    {
      echo "AIRBRIDGE_APP=${AIRBRIDGE_APP:-coveringprod}"
      echo "AIRBRIDGE_TOKEN=${AIRBRIDGE_TOKEN}"
    } > "$APP_DIR/.env"
    log "app .env 갱신 완료"
  fi

  # 기존 crontab 항목 교체 (|| true: crontab이 없을 때 grep exit 1 → set -e 오동작 방지)
  (crontab -l 2>/dev/null | grep -v "# deploy:$APP_NAME" || true; \
   echo "$SCHEDULE cd $APP_DIR && $COMMAND >> logs/batch.log 2>&1 # deploy:$APP_NAME") \
   | crontab -

  log "crontab 등록: $SCHEDULE"
}

# ── Streamlit 배포 ────────────────────────────────────────────
deploy_streamlit() {
  PORT=$(assign_port)
  log "포트: $PORT"
  cd "$APP_DIR"

  if [ -f "requirements.txt" ]; then
    pip install --break-system-packages -q -r requirements.txt
    log "requirements.txt 설치 완료"
  fi

  cat > "$APP_DIR/pm2.config.js" <<EOF
module.exports = {
  apps: [{
    name: "$APP_NAME",
    script: "python3",
    args: ["-m", "streamlit", "run", "src/app.py",
           "--server.port", "$PORT",
           "--server.address", "0.0.0.0",
           "--server.baseUrlPath", "/$APP_NAME"],
    cwd: "$APP_DIR",
    autorestart: true
  }]
};
EOF

  pm2 startOrReload "$APP_DIR/pm2.config.js" --only "$APP_NAME" --update-env
  pm2 save
  update_nginx "$PORT"
}

# ── nginx 설정 갱신 ───────────────────────────────────────────
update_nginx() {
  local PORT="$1"
  local NGINX_CONF="$NGINX_CONF_DIR/$APP_NAME.conf"
  local BACKUP_CONF=""
  local EXTRA_DIRECTIVES=""

  # streamlit 전용: 대용량 파일 업로드 허용
  if [ "$APP_TYPE" = "streamlit" ]; then
    EXTRA_DIRECTIVES=$'    client_max_body_size 500m;\n    proxy_read_timeout 600s;\n    proxy_send_timeout 600s;'
  fi

  rollback_nginx_conf() {
    if [ -n "$BACKUP_CONF" ] && [ -f "$BACKUP_CONF" ]; then
      mv "$BACKUP_CONF" "$NGINX_CONF"
      log "nginx 설정 롤백 완료: $NGINX_CONF"
    else
      rm -f "$NGINX_CONF"
      log "nginx 신규 설정 제거 완료: $NGINX_CONF"
    fi
    sudo -n nginx -t && sudo -n nginx -s reload || true
  }

  if [ -f "$NGINX_CONF" ]; then
    BACKUP_CONF=$(mktemp "$NGINX_CONF.XXXXXX.bak")
    cp "$NGINX_CONF" "$BACKUP_CONF"
  fi

  cat > "$NGINX_CONF" <<EOF
location /$APP_NAME {
    proxy_pass http://localhost:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_cache_bypass \$http_upgrade;
${EXTRA_DIRECTIVES}
}
EOF
  if ! sudo -n nginx -t; then
    rollback_nginx_conf
    fail "nginx 설정 검증 실패: sudo 권한 또는 설정 오류"
  fi
  if ! sudo -n nginx -s reload; then
    rollback_nginx_conf
    fail "nginx reload 실패: sudo 권한 또는 서비스 오류"
  fi
  [ -n "$BACKUP_CONF" ] && rm -f "$BACKUP_CONF"
  log "nginx 갱신 완료 (/$APP_NAME → :$PORT)"
}

# ── 배포 실행 ─────────────────────────────────────────────────
case "$APP_TYPE" in
  nextjs)     deploy_nextjs     ;;
  nestjs)     deploy_nestjs     ;;
  batch)      deploy_batch      ;;
  streamlit)  deploy_streamlit  ;;
  *) fail "알 수 없는 타입: $APP_TYPE (nextjs | nestjs | batch | streamlit)" ;;
esac

# ── Slack 알림 ────────────────────────────────────────────────
SERVER_IP=$(curl -sf \
  "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/external-ip" \
  -H "Metadata-Flavor: Google" || echo "unknown")
# /shared/.env에 SERVER_DOMAIN 설정 시 해당 도메인으로 링크 생성
# 예) private VM: SERVER_DOMAIN=labs.covering.app
#     public VM:  SERVER_DOMAIN=public-labs.covering.app
if [ -n "${SERVER_DOMAIN:-}" ]; then
  APP_BASE_URL="https://${SERVER_DOMAIN}"
else
  APP_BASE_URL="http://${SERVER_IP}"
fi
NOW=$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S KST')

if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
  if [ "$APP_TYPE" = "batch" ]; then
    SCHEDULE=$(grep '^schedule:' "$DEPLOY_CONF" | sed 's/^schedule: *//' | tr -d '"' | sed 's/[[:space:]]*#.*//')
    PAYLOAD=$(python3 - "$APP_DISPLAY" "${DEPLOY_ACTOR:-unknown}" "$NOW" "$SCHEDULE" "${COMMIT_SHA:0:7}" <<'PYEOF'
import json, sys
app, actor, ts, schedule, commit = sys.argv[1:]
blocks = [
    {
        "type": "section",
        "text": {"type": "mrkdwn", "text": f"*{app}* 배포 완료"},
        "fields": [
            {"type": "mrkdwn", "text": f"*배포자*\n{actor}"},
            {"type": "mrkdwn", "text": f"*커밋*\n`{commit}`"},
        ],
    },
    {
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": f"{ts}  ·  스케줄 `{schedule}`"}],
    },
]
print(json.dumps({"channel": "C0AUK6902BE", "blocks": blocks}, ensure_ascii=False))
PYEOF
)
  else
    PORT=$(python3 -c "import json; r=json.load(open('$PORT_REGISTRY')); print(r.get('$APP_NAME','?'))")
    PAYLOAD=$(python3 - "$APP_DISPLAY" "${DEPLOY_ACTOR:-unknown}" "$NOW" "$APP_BASE_URL" "$APP_NAME" "$PORT" "${COMMIT_SHA:0:7}" <<'PYEOF'
import json, sys
app, actor, ts, base_url, name, port, commit = sys.argv[1:]
blocks = [
    {
        "type": "section",
        "text": {"type": "mrkdwn", "text": f"*{app}* 배포 완료"},
        "fields": [
            {"type": "mrkdwn", "text": f"*배포자*\n{actor}"},
            {"type": "mrkdwn", "text": f"*커밋*\n`{commit}`"},
        ],
    },
    {
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": f"{ts}  ·  <{base_url}/{name}|접속하기>  ·  포트 {port}"}],
    },
]
print(json.dumps({"channel": "C0AUK6902BE", "blocks": blocks}, ensure_ascii=False))
PYEOF
)
  fi
  curl -sf -X POST "https://slack.com/api/chat.postMessage" \
    -H 'Content-type: application/json' \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    --data "$PAYLOAD" > /dev/null || true
fi

log "완료: $APP_DISPLAY"
