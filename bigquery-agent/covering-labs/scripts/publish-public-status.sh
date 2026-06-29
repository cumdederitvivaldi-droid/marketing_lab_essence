#!/bin/bash
# Publishes public VM app status to GCS for private dashboard consumption.
# Runs as a cron job (every minute) on the public VM under the service account user.
# Consumer: apps/private/_dashboard/app/api/status/route.ts via gsutil cat

set -euo pipefail

SHARED=/shared
LOG=/tmp/publish-public-status.log
GCS_URI="gs://covering-labs/_dashboard/public-status.json"
TMP_FILE=$(mktemp /tmp/public-status-XXXXXX.json)

cleanup() { rm -f "$TMP_FILE"; }
trap cleanup EXIT

# Generate status JSON
python3 - << 'PYEOF' > "$TMP_FILE"
import json, os, re, datetime, subprocess

shared = "/shared"
apps_dir = os.path.join(shared, "apps")

port_registry = {}
try:
    with open(os.path.join(shared, "port-registry.json")) as f:
        port_registry = json.load(f)
except Exception:
    pass

pm2_status = {}
try:
    raw = subprocess.check_output(["pm2", "jlist"], stderr=subprocess.DEVNULL, timeout=5)
    for p in json.loads(raw):
        pm2_status[p["name"]] = p.get("pm2_env", {}).get("status", "unknown")
except Exception:
    pass

apps = []
if os.path.isdir(apps_dir):
    for app_name in sorted(os.listdir(apps_dir)):
        if app_name.startswith("_"):
            continue
        deploy_yml = os.path.join(apps_dir, app_name, "deploy.yml")
        if not os.path.exists(deploy_yml):
            continue
        cfg = {}
        with open(deploy_yml) as f:
            for line in f:
                m = re.match(r'^(\w+):\s*["\']?([^"\'#\n]*)["\']?', line)
                if m:
                    cfg[m.group(1).strip()] = m.group(2).strip()
        if not cfg.get("type") or cfg.get("type") == "batch":
            continue
        apps.append({
            "name": app_name,
            "displayName": cfg.get("name", app_name),
            "description": cfg.get("description", ""),
            "type": cfg.get("type", ""),
            "port": port_registry.get(app_name),
            "status": pm2_status.get(app_name, "unknown"),
        })

print(json.dumps({
    "apps": apps,
    "updatedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
}))
PYEOF

# Upload to GCS
gsutil cp "$TMP_FILE" "$GCS_URI" >> "$LOG" 2>&1
echo "[$(date -Iseconds)] Published to $GCS_URI" >> "$LOG"
