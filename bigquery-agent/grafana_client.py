#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Grafana API 클라이언트
패널 데이터 조회, 대시보드 탐색, 쿼리 실행 지원
"""
import os, json, requests
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

GRAFANA_URL = os.getenv("GRAFANA_URL", "").rstrip("/")
GRAFANA_API_KEY = os.getenv("GRAFANA_API_KEY", "")

if not GRAFANA_URL or "여기에" in GRAFANA_URL:
    raise RuntimeError(".env 파일에 GRAFANA_URL을 입력해주세요.")
if not GRAFANA_API_KEY:
    raise RuntimeError(".env 파일에 GRAFANA_API_KEY를 입력해주세요.")


class GrafanaClient:
    def __init__(self, url: str = GRAFANA_URL, api_key: str = GRAFANA_API_KEY):
        self.url = url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        })

    def _get(self, path: str, params: dict = None) -> dict | list:
        resp = self.session.get(f"{self.url}{path}", params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: dict) -> dict:
        resp = self.session.post(f"{self.url}{path}", json=body, timeout=30)
        resp.raise_for_status()
        return resp.json()

    # ── 연결 확인 ─────────────────────────────────────────────────────────────

    def health(self) -> dict:
        """Grafana 헬스 체크"""
        return self._get("/api/health")

    # ── 대시보드 탐색 ─────────────────────────────────────────────────────────

    def search_dashboards(self, query: str = "") -> list[dict]:
        """대시보드 목록 조회. query로 이름 필터링 가능."""
        return self._get("/api/search", params={"type": "dash-db", "query": query})

    def get_dashboard(self, uid: str) -> dict:
        """대시보드 전체 JSON (패널 목록 포함) 반환."""
        return self._get(f"/api/dashboards/uid/{uid}")

    def list_panels(self, uid: str) -> list[dict]:
        """대시보드 내 패널 요약 목록 반환: id, title, type, datasource."""
        dash = self.get_dashboard(uid)
        panels = dash.get("dashboard", {}).get("panels", [])
        result = []
        for p in panels:
            result.append({
                "id":          p.get("id"),
                "title":       p.get("title"),
                "type":        p.get("type"),
                "datasource":  p.get("datasource"),
                "targets":     p.get("targets", []),
            })
        return result

    # ── 패널 데이터 쿼리 ──────────────────────────────────────────────────────

    def query_panel(
        self,
        uid: str,
        panel_id: int,
        from_time: str = "now-30d",
        to_time: str = "now",
    ) -> dict:
        """
        대시보드 uid + 패널 panel_id 기준으로 쿼리를 실행해 데이터 반환.

        from_time / to_time 예시:
          "now-7d", "now-30d", "now-1y"
          "2026-01-01T00:00:00Z", "2026-04-30T23:59:59Z"
        """
        dash = self.get_dashboard(uid)
        panels = dash.get("dashboard", {}).get("panels", [])
        panel = next((p for p in panels if p.get("id") == panel_id), None)
        if panel is None:
            raise ValueError(f"패널 ID {panel_id}를 '{uid}' 대시보드에서 찾을 수 없습니다.")

        targets = panel.get("targets", [])
        if not targets:
            raise ValueError(f"패널 '{panel.get('title')}' 에 쿼리(targets)가 없습니다.")

        ds = panel.get("datasource", {})
        ds_uid = ds.get("uid") if isinstance(ds, dict) else ds

        queries = []
        for t in targets:
            q = {**t, "refId": t.get("refId", "A")}
            if ds_uid:
                q["datasource"] = {"uid": ds_uid}
            queries.append(q)

        body = {
            "queries": queries,
            "from":    from_time,
            "to":      to_time,
        }
        return self._post("/api/ds/query", body)

    # ── 패널 이미지 렌더링 ────────────────────────────────────────────────────

    def render_panel_png(
        self,
        uid: str,
        panel_id: int,
        from_time: str = "now-30d",
        to_time: str = "now",
        width: int = 1200,
        height: int = 600,
        save_path: str = None,
    ) -> bytes:
        """
        패널을 PNG 이미지로 렌더링해서 반환. (Grafana Image Renderer 플러그인 필요)
        save_path 지정 시 파일로 저장.
        """
        params = {
            "orgId":    1,
            "from":     from_time,
            "to":       to_time,
            "panelId":  panel_id,
            "width":    width,
            "height":   height,
            "tz":       "Asia/Seoul",
        }
        resp = self.session.get(
            f"{self.url}/render/d-solo/{uid}/panel",
            params=params,
            timeout=60,
        )
        resp.raise_for_status()
        if save_path:
            Path(save_path).write_bytes(resp.content)
            print(f"  저장: {save_path}")
        return resp.content

    # ── 데이터소스 탐색 ───────────────────────────────────────────────────────

    def list_datasources(self) -> list[dict]:
        """연결된 데이터소스 목록 반환."""
        return self._get("/api/datasources")


# ── 편의 함수 ─────────────────────────────────────────────────────────────────

def print_dashboards():
    """대시보드 목록 출력"""
    g = GrafanaClient()
    dashboards = g.search_dashboards()
    print(f"\n[대시보드 목록] 총 {len(dashboards)}개")
    for d in dashboards:
        print(f"  uid={d.get('uid'):<20} title={d.get('title')}")


def print_panels(uid: str):
    """특정 대시보드의 패널 목록 출력"""
    g = GrafanaClient()
    panels = g.list_panels(uid)
    print(f"\n[패널 목록] 대시보드 uid={uid}, 총 {len(panels)}개")
    for p in panels:
        print(f"  id={p['id']:<5} type={p['type']:<20} title={p['title']}")


def fetch_panel_to_csv(uid: str, panel_id: int, from_time="now-30d", to_time="now", out_dir="datas"):
    """패널 데이터를 CSV로 저장"""
    g = GrafanaClient()
    result = g.query_panel(uid, panel_id, from_time, to_time)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    os.makedirs(out_dir, exist_ok=True)

    # 결과 JSON 파싱 → CSV 변환
    frames = []
    for series_key, series_val in result.get("results", {}).items():
        for frame in series_val.get("frames", []):
            schema = frame.get("schema", {})
            data   = frame.get("data", {})
            fields = schema.get("fields", [])
            values = data.get("values", [])
            if not fields or not values:
                continue
            col_names = [f.get("name", f"col{i}") for i, f in enumerate(fields)]
            rows = list(zip(*values))
            frames.append((col_names, rows))

    if not frames:
        print("  [경고] 반환된 데이터가 없습니다.")
        json_path = os.path.join(out_dir, f"{ts}_panel_{uid}_{panel_id}_raw.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"  원본 JSON 저장: {json_path}")
        return

    import csv
    csv_path = os.path.join(out_dir, f"{ts}_panel_{uid}_{panel_id}.csv")
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        for col_names, rows in frames:
            writer.writerow(col_names)
            writer.writerows(rows)
            writer.writerow([])  # 프레임 간 구분

    print(f"  저장: {csv_path}  ({sum(len(r) for _, r in frames)}행)")
    return csv_path


# ── CLI 사용 예시 ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    g = GrafanaClient()

    # 연결 확인
    h = g.health()
    print(f"Grafana 연결 OK: version={h.get('version')}  db={h.get('database')}")

    cmd = sys.argv[1] if len(sys.argv) > 1 else "dashboards"

    if cmd == "dashboards":
        print_dashboards()

    elif cmd == "panels" and len(sys.argv) >= 3:
        # python grafana_client.py panels <dashboard_uid>
        print_panels(sys.argv[2])

    elif cmd == "fetch" and len(sys.argv) >= 4:
        # python grafana_client.py fetch <dashboard_uid> <panel_id> [from] [to]
        uid      = sys.argv[2]
        panel_id = int(sys.argv[3])
        frm      = sys.argv[4] if len(sys.argv) > 4 else "now-30d"
        to       = sys.argv[5] if len(sys.argv) > 5 else "now"
        fetch_panel_to_csv(uid, panel_id, frm, to)

    elif cmd == "render" and len(sys.argv) >= 4:
        # python grafana_client.py render <dashboard_uid> <panel_id>
        uid      = sys.argv[2]
        panel_id = int(sys.argv[3])
        save     = f"datas/panel_{uid}_{panel_id}.png"
        g.render_panel_png(uid, panel_id, save_path=save)

    else:
        print("""
사용법:
  python grafana_client.py dashboards
  python grafana_client.py panels   <uid>
  python grafana_client.py fetch    <uid> <panel_id> [from] [to]
  python grafana_client.py render   <uid> <panel_id>
""")
