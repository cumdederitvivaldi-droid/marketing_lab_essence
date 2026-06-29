#!/bin/bash
# undeploy-app.sh — 앱 제거 스크립트 (VM에서 실행)
# Usage: bash /shared/scripts/undeploy-app.sh <app-name>
set -e

APP_NAME="$1"
APP_DIR="/shared/apps/$APP_NAME"
PORT_REGISTRY="/shared/port-registry.json"
NGINX_CONF_DIR="/shared/nginx-confs"
ENV_FILE="/shared/.env"

[ -f "$ENV_FILE" ] && source "$ENV_FILE"

log() { echo "[$(date '+%H:%M:%S')] [undeploy:$APP_NAME] $*"; }
fail() { log "ERROR: $*"; exit 1; }

[ -z "$APP_NAME" ] && fail "앱 이름을 입력하세요"

log "시작: $APP_NAME 제거"

# ── PM2 중지 + 삭제 ───────────────────────────────────────────
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  pm2 stop "$APP_NAME" || true
  pm2 delete "$APP_NAME"
  pm2 save
  log "PM2 프로세스 삭제 완료"
else
  log "PM2 프로세스 없음 (건너뜀)"
fi

# ── crontab 항목 제거 ─────────────────────────────────────────
if crontab -l 2>/dev/null | grep -q "# deploy:$APP_NAME"; then
  crontab -l 2>/dev/null | grep -v "# deploy:$APP_NAME" | crontab -
  log "crontab 항목 삭제 완료"
fi

# ── nginx 설정 제거 ───────────────────────────────────────────
NGINX_CONF="$NGINX_CONF_DIR/$APP_NAME.conf"
if [ -f "$NGINX_CONF" ]; then
  BACKUP_CONF=$(mktemp "$NGINX_CONF.XXXXXX.bak")
  cp "$NGINX_CONF" "$BACKUP_CONF"
  rollback_nginx_conf() {
    if [ -f "$BACKUP_CONF" ]; then
      mv "$BACKUP_CONF" "$NGINX_CONF"
      log "nginx 설정 롤백 완료: $NGINX_CONF"
    fi
    sudo -n nginx -t && sudo -n nginx -s reload || true
  }

  rm "$NGINX_CONF"
  if ! sudo -n nginx -t; then
    rollback_nginx_conf
    fail "nginx 설정 검증 실패: sudo 권한 또는 설정 오류"
  fi
  if ! sudo -n nginx -s reload; then
    rollback_nginx_conf
    fail "nginx reload 실패: sudo 권한 또는 서비스 오류"
  fi
  rm -f "$BACKUP_CONF"
  log "nginx 설정 삭제 완료"
else
  log "nginx 설정 없음 (건너뜀)"
fi

# ── 포트 레지스트리에서 제거 ──────────────────────────────────
if [ -f "$PORT_REGISTRY" ]; then
  python3 - <<PYEOF
import json
registry = "$PORT_REGISTRY"
try:
    with open(registry) as f:
        reg = json.load(f)
    if "$APP_NAME" in reg:
        del reg["$APP_NAME"]
        with open(registry, "w") as f:
            json.dump(reg, f, indent=2)
        print("포트 레지스트리 항목 삭제 완료")
    else:
        print("포트 레지스트리 항목 없음 (건너뜀)")
except Exception as e:
    print(f"포트 레지스트리 처리 실패: {e}")
PYEOF
fi

# ── 앱 파일 삭제 ──────────────────────────────────────────────
if [ -d "$APP_DIR" ]; then
  rm -rf "$APP_DIR"
  log "앱 파일 삭제 완료: $APP_DIR"
fi

# ── Slack 알림 ────────────────────────────────────────────────
NOW=$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S KST')
if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
  PAYLOAD=$(python3 - "$APP_NAME" "${DEPLOY_ACTOR:-unknown}" "$NOW" "${COMMIT_SHA:0:7}" <<'PYEOF'
import json, sys
app, actor, ts, commit = sys.argv[1:]
blocks = [
    {
        "type": "section",
        "text": {"type": "mrkdwn", "text": f"*{app}* 제거 완료"},
        "fields": [
            {"type": "mrkdwn", "text": f"*제거자*\n{actor}"},
            {"type": "mrkdwn", "text": f"*커밋*\n`{commit}`"},
        ],
    },
    {
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": ts}],
    },
]
print(json.dumps({"channel": "C0AUK6902BE", "blocks": blocks}, ensure_ascii=False))
PYEOF
)
  curl -sf -X POST "https://slack.com/api/chat.postMessage" \
    -H 'Content-type: application/json' \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    --data "$PAYLOAD" > /dev/null || true
fi

log "완료: $APP_NAME 제거"
