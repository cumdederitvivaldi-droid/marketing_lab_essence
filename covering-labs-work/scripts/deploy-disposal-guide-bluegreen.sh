#!/usr/bin/env bash
# Blue/green deploy for the public disposal-guide app.
# Intended to run on covering-labs-public as the GitHub Actions deploy user.

set -Eeuo pipefail

APP_NAME="disposal-guide"
BASE_PATH="/disposal-guide"
PUBLIC_URL="https://public-labs.covering.app/disposal-guide"
RELEASE_ROOT="/shared/releases/${APP_NAME}"
STATE_DIR="/shared/apps-state"
STATE_FILE="${STATE_DIR}/${APP_NAME}.json"
NGINX_CONF="/shared/nginx-confs/${APP_NAME}.conf"
ENV_FILE="/shared/.env"
APP_ENV_FILES=(
  "$ENV_FILE"
  "/shared/apps/disposal_guide/.env"
  "/shared/apps/disposal_guide/.env.production"
  "/shared/apps/disposal_guide/.env.local"
  "/shared/apps/disposal_guide/.env.production.local"
  "/shared/apps/${APP_NAME}/.env"
  "/shared/apps/${APP_NAME}/.env.production"
  "/shared/apps/${APP_NAME}/.env.local"
  "/shared/apps/${APP_NAME}/.env.production.local"
)
BLUE_PORT="3108"
GREEN_PORT="3109"
BLUE_PROCESS="${APP_NAME}-blue"
GREEN_PROCESS="${APP_NAME}-green"

COMMIT_SHA="${COMMIT_SHA:-}"
RELEASE_ARCHIVE="${RELEASE_ARCHIVE:-}"
DEPLOY_RUN_ID="${DEPLOY_RUN_ID:-}"
DRY_RUN=0
EXECUTE=0

log() {
  printf '[%s] [bluegreen:%s] %s\n' "$(date '+%H:%M:%S')" "$APP_NAME" "$*"
}

fail() {
  log "ERROR: $*"
  return 1
}

usage() {
  cat <<EOF
Usage:
  COMMIT_SHA=<sha> RELEASE_ARCHIVE=/tmp/disposal-guide.tar.gz $0 --execute
  $0 --commit-sha <sha> --archive /tmp/disposal-guide.tar.gz --execute
  $0 --dry-run

This script:
  1. extracts a release into ${RELEASE_ROOT}/<sha>
  2. builds it away from the active app
  3. starts the candidate on ${BLUE_PORT} or ${GREEN_PORT}
  4. verifies ${BASE_PATH} and Next.js static assets
  5. switches nginx only after candidate health passes
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --commit-sha)
      COMMIT_SHA="${2:-}"
      shift 2
      ;;
    --archive)
      RELEASE_ARCHIVE="${2:-}"
      shift 2
      ;;
    --execute)
      EXECUTE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

if [ "$DRY_RUN" -eq 1 ]; then
  log "dry-run only; no files, PM2 processes, or nginx config will be changed"
  log "release root: ${RELEASE_ROOT}"
  log "state file: ${STATE_FILE}"
  log "nginx conf: ${NGINX_CONF}"
  log "ports: blue=${BLUE_PORT}, green=${GREEN_PORT}"
  log "processes: blue=${BLUE_PROCESS}, green=${GREEN_PROCESS}"
  exit 0
fi

load_env_file() {
  local path="$1"
  local line
  local line_no=0
  local name
  local value
  if [ ! -f "$path" ]; then
    return 0
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    line_no=$((line_no + 1))
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    line="${line#"${line%%[![:space:]]*}"}"
    if [[ "$line" =~ ^export[[:space:]]+(.+)$ ]]; then
      line="${BASH_REMATCH[1]}"
    fi
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
      name="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
    else
      fail "invalid env line in ${path}:${line_no}"
    fi
    value="${value#"${value%%[![:space:]]*}"}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "${name}=${value}"
  done < "$path"
  log "loaded env file: $path"
}

[ "$EXECUTE" -eq 1 ] || fail "pass --execute to run a real deployment"
[ -n "$COMMIT_SHA" ] || fail "COMMIT_SHA is required"
[[ "$COMMIT_SHA" =~ ^[0-9a-fA-F]{7,40}$ ]] || fail "COMMIT_SHA must be a git SHA"
[ -n "$RELEASE_ARCHIVE" ] || fail "RELEASE_ARCHIVE is required"
[ -f "$RELEASE_ARCHIVE" ] || fail "release archive not found: $RELEASE_ARCHIVE"

for env_path in "${APP_ENV_FILES[@]}"; do
  load_env_file "$env_path"
done

short_sha="${COMMIT_SHA:0:12}"
if [ -z "$DEPLOY_RUN_ID" ]; then
  DEPLOY_RUN_ID="$(date -u '+%Y%m%d%H%M%S')"
fi
safe_run_id="$(printf '%s' "$DEPLOY_RUN_ID" | tr -cd '[:alnum:]_.-')"
[ -n "$safe_run_id" ] || fail "DEPLOY_RUN_ID resolved to an empty value"
release_id="${short_sha}-${safe_run_id}"
release_dir="${RELEASE_ROOT}/${release_id}"
tmp_extract="${release_dir}.tmp.$$"
candidate_port=""
candidate_process=""
previous_port=""
previous_process=""
backup_conf=""
candidate_owned=0
preflight_checksum=""

cleanup_tmp() {
  rm -rf "$tmp_extract"
}

rollback_nginx() {
  if [ -n "$backup_conf" ] && [ -f "$backup_conf" ]; then
    mv "$backup_conf" "$NGINX_CONF"
    chmod 664 "$NGINX_CONF" || true
    sudo -n nginx -t && sudo -n nginx -s reload || true
    log "nginx rolled back to previous config"
  fi
}

cleanup_candidate_on_failure() {
  if [ "$candidate_owned" -eq 1 ] && [ -n "$candidate_process" ]; then
    pm2 delete "$candidate_process" >/dev/null 2>&1 || true
    pm2 save >/dev/null 2>&1 || true
  fi
}

on_error() {
  rollback_nginx
  cleanup_candidate_on_failure
}

trap cleanup_tmp EXIT
trap on_error ERR

extract_active_port() {
  if [ ! -f "$NGINX_CONF" ]; then
    return 0
  fi
  sed -nE 's/.*proxy_pass http:\/\/localhost:([0-9]+).*/\1/p' "$NGINX_CONF" | head -1
}

process_for_port() {
  case "$1" in
    "$BLUE_PORT") printf '%s\n' "$BLUE_PROCESS" ;;
    "$GREEN_PORT") printf '%s\n' "$GREEN_PROCESS" ;;
    *) printf '%s\n' "$APP_NAME" ;;
  esac
}

choose_candidate() {
  previous_port="$(extract_active_port || true)"
  previous_process="$(process_for_port "$previous_port")"

  case "$previous_port" in
    "$BLUE_PORT")
      candidate_port="$GREEN_PORT"
      candidate_process="$GREEN_PROCESS"
      ;;
    "$GREEN_PORT")
      candidate_port="$BLUE_PORT"
      candidate_process="$BLUE_PROCESS"
      ;;
    *)
      candidate_port="$BLUE_PORT"
      candidate_process="$BLUE_PROCESS"
      ;;
  esac

  [ "$candidate_port" != "$previous_port" ] || fail "candidate port equals active port: $candidate_port"
}

ensure_ports_are_unreserved() {
  if [ ! -f /shared/port-registry.json ]; then
    return 0
  fi
  python3 - "$APP_NAME" "$BLUE_PORT" "$GREEN_PORT" <<'PY'
import json
import sys

app_name, blue_port, green_port = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
with open("/shared/port-registry.json", encoding="utf-8") as f:
    registry = json.load(f)

reserved = {blue_port, green_port}
conflicts = {
    app: port
    for app, port in registry.items()
    if app != app_name and int(port) in reserved
}
if conflicts:
    print(f"blue/green port conflict in port-registry: {conflicts}", file=sys.stderr)
    raise SystemExit(1)
PY
}

assert_port_free() {
  local port="$1"
  if ss -ltn | awk '{print $4}' | grep -Eq "[:.]${port}$"; then
    fail "candidate port is already listening: $port"
  fi
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-30}"
  local i=1
  while [ "$i" -le "$attempts" ]; do
    if curl -fsS --max-time 5 "$url" >/dev/null; then
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  return 1
}

verify_local_release() {
  local port="$1"
  local build_id="$2"
  local html
  local asset_url="http://127.0.0.1:${port}${BASE_PATH}/_next/static/${build_id}/_buildManifest.js"
  html="$(mktemp)"
  curl -fsS --max-time 5 "http://127.0.0.1:${port}${BASE_PATH}" > "$html" || {
    rm -f "$html"
    return 1
  }
  grep -q "$build_id" "$html" || {
    rm -f "$html"
    return 1
  }
  grep -q "${BASE_PATH}/_next/static/" "$html" || {
    rm -f "$html"
    return 1
  }
  rm -f "$html"
  curl -fsSI --max-time 5 "$asset_url" >/dev/null || return 1
  curl -fsS --max-time 5 "http://127.0.0.1:${port}${BASE_PATH}/noticeBoardGraphic.svg" >/dev/null || return 1
}

verify_external() {
  local build_id="$1"
  local html
  html="$(mktemp)"
  curl -fsS --max-time 10 "$PUBLIC_URL" > "$html" || {
    rm -f "$html"
    return 1
  }
  grep -q "$build_id" "$html" || {
    rm -f "$html"
    return 1
  }
  grep -q "${BASE_PATH}/_next/static/" "$html" || {
    rm -f "$html"
    return 1
  }
  rm -f "$html"
  curl -fsSI --max-time 10 "${PUBLIC_URL}/_next/static/${build_id}/_buildManifest.js" >/dev/null || return 1
  curl -fsS --max-time 10 "${PUBLIC_URL}/noticeBoardGraphic.svg" >/dev/null || return 1
}

verify_feedback_backend() {
  local supabase_url="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-${COVERING_SUPABASE_URL:-}}}"
  local supabase_key="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:-${COVERING_SUPABASE_KEY:-}}}"
  local feedback_table="${DISPOSAL_GUIDE_FEEDBACK_TABLE:-disposal_guide_feedback}"
  local body
  local code

  [ -n "$supabase_url" ] || fail "SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, or COVERING_SUPABASE_URL is required for feedback"
  [ -n "$supabase_key" ] || fail "SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, or COVERING_SUPABASE_KEY is required for feedback"
  if [ -z "${SLACK_BOT_TOKEN:-}" ]; then
    log "warning: SLACK_BOT_TOKEN missing; feedback Slack notification will be skipped"
  fi

  body="$(mktemp)"
  if ! code="$(curl -sS -o "$body" -w "%{http_code}" --max-time 5 \
    -H "apikey: ${supabase_key}" \
    -H "Authorization: Bearer ${supabase_key}" \
    "${supabase_url%/}/rest/v1/${feedback_table}?select=id,message,slack_status&limit=0")"; then
    log "feedback backend schema check request failed"
    sed -E 's/[A-Za-z0-9_=-]{24,}/[redacted]/g' "$body" >&2 || true
    rm -f "$body"
    fail "feedback backend schema check request failed"
  fi

  if [ "$code" != "200" ]; then
    log "feedback backend schema check failed: http=${code}"
    sed -E 's/[A-Za-z0-9_=-]{24,}/[redacted]/g' "$body" >&2 || true
    rm -f "$body"
    fail "feedback table or message column is not ready"
  fi

  rm -f "$body"
}

extract_diagnostics_checksum() {
  local file="$1"
  python3 - "$file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)

print(data.get("configChecksum") or "")
PY
}

verify_diagnostics_url() {
  local url="$1"
  local expected_checksum="${2:-}"
  local body
  body="$(mktemp)"
  curl -fsS --max-time 5 "$url" > "$body" || {
    rm -f "$body"
    return 1
  }

  local status
  python3 - "$body" "$expected_checksum" <<'PY'
import json
import os
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)

expected_checksum = sys.argv[2]
mode = os.environ.get("GUIDE_CONFIG_MODE", "default")
ok = data.get("ok") is True

if expected_checksum:
    ok = (
        ok
        and bool(data.get("configChecksum"))
        and data.get("configChecksum") == expected_checksum
    )

if mode == "supabase_strict":
    ok = (
        ok
        and data.get("requestedMode") == "supabase_strict"
        and data.get("resolvedSource") == "supabase"
        and data.get("validationStatus") == "valid"
        and bool(data.get("configChecksum"))
    )

if not ok:
    print(
        "candidate diagnostics gate failed: "
        f"mode={data.get('requestedMode')} "
        f"source={data.get('resolvedSource')} "
        f"status={data.get('validationStatus')} "
        f"errors={data.get('validationErrorCodes')}",
        file=sys.stderr,
    )
    raise SystemExit(1)
PY
  status="$?"
  rm -f "$body"
  return "$status"
}

verify_candidate_diagnostics() {
  local port="$1"
  local expected_checksum="${2:-}"
  verify_diagnostics_url "http://127.0.0.1:${port}${BASE_PATH}/api/diagnostics" "$expected_checksum"
}

wait_for_external_diagnostics() {
  local expected_checksum="${1:-}"
  local attempts="${2:-30}"
  local i=1
  while [ "$i" -le "$attempts" ]; do
    if verify_diagnostics_url "${PUBLIC_URL}/api/diagnostics" "$expected_checksum"; then
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  return 1
}

wait_for_external() {
  local build_id="$1"
  local attempts="${2:-30}"
  local i=1
  while [ "$i" -le "$attempts" ]; do
    if verify_external "$build_id"; then
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  return 1
}

write_state() {
  mkdir -p "$STATE_DIR"
  python3 - "$STATE_FILE" "$short_sha" "$release_id" "$safe_run_id" "$candidate_port" "$candidate_process" "$previous_port" "$previous_process" <<'PY'
import json
import sys
from datetime import datetime, timezone

state_file, release, release_id, run_id, active_port, active_process, previous_port, previous_process = sys.argv[1:]
payload = {
    "app": "disposal-guide",
    "release": release,
    "releaseId": release_id,
    "runId": run_id,
    "activePort": int(active_port),
    "activeProcess": active_process,
    "previousPort": int(previous_port) if previous_port.isdigit() else None,
    "previousProcess": previous_process or None,
    "updatedAt": datetime.now(timezone.utc).isoformat(),
}
with open(state_file, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
}

render_nginx_conf() {
  local port="$1"
  cat <<EOF
location = ${BASE_PATH} {
    proxy_pass http://localhost:${port};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_cache_bypass \$http_upgrade;
}

location ^~ ${BASE_PATH}/ {
    proxy_pass http://localhost:${port};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_cache_bypass \$http_upgrade;
}
EOF
}

log "starting blue/green deploy for ${APP_NAME} at ${release_id}"
choose_candidate
ensure_ports_are_unreserved
log "active port: ${previous_port:-unknown}; candidate: ${candidate_process} on ${candidate_port}"

mkdir -p "$RELEASE_ROOT"
rm -rf "$tmp_extract"
mkdir -p "$tmp_extract"
tar -xzf "$RELEASE_ARCHIVE" -C "$tmp_extract"

[ ! -e "$release_dir" ] || fail "release directory already exists: $release_dir"
mv "$tmp_extract" "$release_dir"

cd "$release_dir"
log "installing dependencies in ${release_dir}"
npm ci --legacy-peer-deps --silent

log "running typecheck"
npm run typecheck

log "running tests"
npm test -- --runInBand

log "verifying feedback backend"
verify_feedback_backend

log "validating guide config"
preflight_diagnostics="$(mktemp)"
GUIDE_CONFIG_DIAGNOSTICS_FILE="$preflight_diagnostics" npm run validate:config
preflight_checksum="$(extract_diagnostics_checksum "$preflight_diagnostics")"
rm -f "$preflight_diagnostics"
[ -n "$preflight_checksum" ] || fail "preflight diagnostics missing configChecksum"

log "building Next.js release"
npm run build

build_id="$(cat "$release_dir/.next/BUILD_ID")"
[ -n "$build_id" ] || fail "missing Next.js build id"

log "starting candidate PM2 process ${candidate_process}"
pm2 delete "$candidate_process" >/dev/null 2>&1 || true
assert_port_free "$candidate_port"
PORT="$candidate_port" pm2 start npm --name "$candidate_process" -- start
candidate_owned=1

log "checking local candidate ${BASE_PATH}"
if ! wait_for_http "http://127.0.0.1:${candidate_port}${BASE_PATH}" 30; then
  fail "candidate local health failed"
fi
if ! verify_local_release "$candidate_port" "$build_id"; then
  fail "candidate static asset health failed"
fi
if ! verify_candidate_diagnostics "$candidate_port" "$preflight_checksum"; then
  fail "candidate diagnostics health failed"
fi

if [ -f "$NGINX_CONF" ]; then
  backup_conf="$(mktemp "${NGINX_CONF}.XXXXXX.bak")"
  cp "$NGINX_CONF" "$backup_conf"
fi

render_nginx_conf "$candidate_port" > "$NGINX_CONF"
chmod 664 "$NGINX_CONF"
sudo -n nginx -t
sudo -n nginx -s reload

log "checking external URL after nginx switch"
if ! wait_for_external "$build_id" 30; then
  fail "external health failed after switch"
fi
if ! wait_for_external_diagnostics "$preflight_checksum" 30; then
  fail "external diagnostics health failed after switch"
fi

write_state
pm2 save
[ -n "$backup_conf" ] && rm -f "$backup_conf"
trap - ERR

log "completed; ${PUBLIC_URL} now points to ${candidate_process}:${candidate_port}"
log "previous process kept for rollback: ${previous_process:-unknown}:${previous_port:-unknown}"
