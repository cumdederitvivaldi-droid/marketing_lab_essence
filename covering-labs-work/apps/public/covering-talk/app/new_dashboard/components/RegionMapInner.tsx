"use client";

import { useEffect, useRef, useState } from "react";

// 카카오맵 SDK 글로벌 — 동적 로드 후 window.kakao.maps 로 접근
declare global {
  interface Window {
    kakao: {
      maps: {
        load: (cb: () => void) => void;
        Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        Polygon: new (options: KakaoPolygonOptions) => KakaoPolygon;
        CustomOverlay: new (options: KakaoCustomOverlayOptions) => KakaoCustomOverlay;
        event: { addListener: (target: object, type: string, handler: (e?: unknown) => void) => void };
      };
    };
  }
}

interface KakaoLatLng { __kakaoLatLng: true }
interface KakaoMap { setLevel: (l: number) => void }
interface KakaoPolygonOptions {
  path: KakaoLatLng[];
  strokeWeight?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  fillColor?: string;
  fillOpacity?: number;
}
interface KakaoPolygon {
  setMap: (m: KakaoMap | null) => void;
  setOptions: (opts: Partial<KakaoPolygonOptions>) => void;
}
interface KakaoCustomOverlayOptions {
  position: KakaoLatLng;
  content: string | HTMLElement;
  xAnchor?: number;
  yAnchor?: number;
  zIndex?: number;
}
interface KakaoCustomOverlay {
  setMap: (m: KakaoMap | null) => void;
}

interface SggFeature {
  type: "Feature";
  properties: {
    name: string;
    name_eng: string;
    code: string;
    sido: string;
    centroid: { lat: number; lng: number };
  };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
}

interface SidoFeature {
  type: "Feature";
  properties: { name: string; name_eng: string; code: string; centroid: { lat: number; lng: number } };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
}

interface SggGeo { type: "FeatureCollection"; features: SggFeature[] }
interface SidoGeo { type: "FeatureCollection"; features: SidoFeature[] }

export interface RegionStat {
  sigungu: string;          // "서울특별시 강남구"
  count: number;
  totalRevenue?: number;
  avgPrice?: number;
}
export interface UnserviceableSidoStat {
  sido: string;             // "부산광역시" / "충청남도" 등
  count: number;
}

interface Props {
  serviceableRegions: RegionStat[];
  unserviceableSidos?: UnserviceableSidoStat[];
  /** @deprecated 호환용 — 사용 안 함 */
  unserviceableRegions?: RegionStat[];
}

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";
const KOREA_CENTER = { lat: 36.5, lng: 127.8 };
const INITIAL_LEVEL = 12;

// 서비스 가능 (파랑) — sqrt 분포로 작은 건수도 시각적으로 보이게
function getServiceableColor(count: number, max: number): string {
  if (count === 0) return "#f8fafc";
  const adj = Math.sqrt(count / max);
  if (adj > 0.92) return "#0c1e3d";   // 거의 검정 navy (top tier)
  if (adj > 0.78) return "#1e3a8a";
  if (adj > 0.62) return "#1e40af";
  if (adj > 0.46) return "#2563eb";
  if (adj > 0.32) return "#3b82f6";
  if (adj > 0.2)  return "#60a5fa";
  if (adj > 0.1)  return "#93c5fd";
  return "#dbeafe";
}

// 서비스 불가 (빨강) — 동일 sqrt 분포
function getUnserviceableColor(count: number, max: number): string {
  if (count === 0) return "#fef2f2";
  const adj = Math.sqrt(count / max);
  if (adj > 0.85) return "#7f1d1d";
  if (adj > 0.65) return "#991b1b";
  if (adj > 0.45) return "#b91c1c";
  if (adj > 0.28) return "#dc2626";
  if (adj > 0.15) return "#ef4444";
  return "#fca5a5";
}

function getOpacity(count: number, max: number): number {
  if (count === 0) return 0.12;
  const adj = Math.sqrt(count / max);
  return 0.45 + adj * 0.45;             // 0.45 ~ 0.9
}

interface HoverInfo {
  name: string;
  kind: "serviceable" | "unserviceable" | "empty-serviceable";
  count: number;
  avgPrice?: number;
  totalRevenue?: number;
}

export default function RegionMapInner({ serviceableRegions, unserviceableSidos = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const polygonsRef = useRef<KakaoPolygon[]>([]);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const [sggGeo, setSggGeo] = useState<SggGeo | null>(null);
  const [sidoGeo, setSidoGeo] = useState<SidoGeo | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // 1. 카카오 SDK 동적 로드 (한 번만)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.kakao && window.kakao.maps) {
      setSdkReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-kakao-sdk]");
    if (existing) {
      existing.addEventListener("load", () => {
        window.kakao.maps.load(() => setSdkReady(true));
      });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`;
    script.async = true;
    script.dataset.kakaoSdk = "1";
    script.onload = () => window.kakao.maps.load(() => setSdkReady(true));
    document.head.appendChild(script);
  }, []);

  // 2. GeoJSON 두 개 병렬 로드
  useEffect(() => {
    fetch("/geo/skorea-sgg-sgi.geo.json").then((r) => r.json()).then(setSggGeo)
      .catch((err) => console.error("[RegionMap] sgg geo load failed:", err));
    fetch("/geo/skorea-provinces-non-service.geo.json").then((r) => r.json()).then(setSidoGeo)
      .catch((err) => console.error("[RegionMap] sido geo load failed:", err));
  }, []);

  // 3. 지도 + 폴리곤 그리기
  useEffect(() => {
    if (!sdkReady || !sggGeo || !sidoGeo || !containerRef.current) return;
    const { kakao } = window;

    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    if (!mapRef.current) {
      mapRef.current = new kakao.maps.Map(containerRef.current, {
        center: new kakao.maps.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lng),
        level: INITIAL_LEVEL,
      });
    }
    const map = mapRef.current;

    const serviceableMap = new Map(serviceableRegions.map((r) => [r.sigungu, r]));
    const maxServiceable = Math.max(1, ...serviceableRegions.map((r) => r.count));
    const unserviceableMap = new Map(unserviceableSidos.map((s) => [s.sido, s]));
    const maxUnserviceable = Math.max(1, ...unserviceableSidos.map((s) => s.count));

    // 디버그
    const sggKeys = new Set(sggGeo.features.map((f) => `${f.properties.sido} ${f.properties.name}`));
    const unmatchedSgg = serviceableRegions.filter((r) => !sggKeys.has(r.sigungu));
    if (unmatchedSgg.length > 0) {
      console.warn("[RegionMap] 시군구 매칭 실패:", unmatchedSgg.map((u) => u.sigungu).join(", "));
    }
    const sidoKeys = new Set(sidoGeo.features.map((f) => f.properties.name));
    const unmatchedSido = unserviceableSidos.filter((s) => !sidoKeys.has(s.sido));
    if (unmatchedSido.length > 0) {
      console.warn("[RegionMap] 시도 매칭 실패:", unmatchedSido.map((u) => u.sido).join(", "));
    }

    // 서비스 가능 — 시군구 (서울/경기/인천)
    sggGeo.features.forEach((f) => {
      const key = `${f.properties.sido} ${f.properties.name}`;
      const stat = serviceableMap.get(key);
      const count = stat?.count ?? 0;
      const fillColor = getServiceableColor(count, maxServiceable);
      const fillOpacity = getOpacity(count, maxServiceable);

      const paths = geometryToPaths(f.geometry, kakao);
      paths.forEach((path) => {
        const polygon = new kakao.maps.Polygon({
          path, strokeWeight: 1, strokeColor: "#1e3a8a", strokeOpacity: 0.5,
          fillColor, fillOpacity,
        });
        polygon.setMap(map);
        polygonsRef.current.push(polygon);

        kakao.maps.event.addListener(polygon, "mouseover", () => {
          polygon.setOptions({ fillOpacity: Math.min(0.95, fillOpacity + 0.2), strokeWeight: 2, strokeOpacity: 1 });
          setHover({
            name: key,
            kind: count > 0 ? "serviceable" : "empty-serviceable",
            count,
            avgPrice: stat?.avgPrice ?? 0,
            totalRevenue: stat?.totalRevenue ?? 0,
          });
        });
        kakao.maps.event.addListener(polygon, "mouseout", () => {
          polygon.setOptions({ fillOpacity, strokeWeight: 1, strokeOpacity: 0.5 });
          setHover(null);
        });
      });
    });

    // 매출 Top 5 지역에 1~5 번호 마커 (centroid 위)
    const sggCentroidMap = new Map(
      sggGeo.features.map((f) => [`${f.properties.sido} ${f.properties.name}`, f.properties.centroid]),
    );
    const top5ByRevenue = [...serviceableRegions]
      .filter((r) => (r.totalRevenue ?? 0) > 0)
      .sort((a, b) => (b.totalRevenue ?? 0) - (a.totalRevenue ?? 0))
      .slice(0, 5);
    top5ByRevenue.forEach((r, i) => {
      const c = sggCentroidMap.get(r.sigungu);
      if (!c) return;
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(c.lat, c.lng),
        content: `<div style="background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#78350f;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);">${i + 1}</div>`,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 50,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    // 서비스 불가 — 시도 (전국 14개)
    sidoGeo.features.forEach((f) => {
      const sidoName = f.properties.name;
      const stat = unserviceableMap.get(sidoName);
      const count = stat?.count ?? 0;
      const fillColor = getUnserviceableColor(count, maxUnserviceable);
      const fillOpacity = count > 0 ? getOpacity(count, maxUnserviceable) : 0.08;

      const paths = geometryToPaths(f.geometry, kakao);
      paths.forEach((path) => {
        const polygon = new kakao.maps.Polygon({
          path, strokeWeight: 1, strokeColor: "#7f1d1d", strokeOpacity: count > 0 ? 0.5 : 0.2,
          fillColor, fillOpacity,
        });
        polygon.setMap(map);
        polygonsRef.current.push(polygon);

        kakao.maps.event.addListener(polygon, "mouseover", () => {
          polygon.setOptions({ fillOpacity: Math.min(0.95, fillOpacity + 0.2), strokeWeight: 2, strokeOpacity: 1 });
          setHover({ name: sidoName, kind: "unserviceable", count });
        });
        kakao.maps.event.addListener(polygon, "mouseout", () => {
          polygon.setOptions({ fillOpacity, strokeWeight: 1, strokeOpacity: count > 0 ? 0.5 : 0.2 });
          setHover(null);
        });
      });
    });
  }, [sdkReady, sggGeo, sidoGeo, serviceableRegions, unserviceableSidos]);

  return (
    <div style={{
      width: "100%", height: 500, position: "relative",
      borderRadius: 8, overflow: "hidden", border: "1px solid var(--app-border)",
    }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {!sdkReady && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "var(--app-text-tertiary)", fontSize: 13, background: "var(--app-card-bg)",
        }}>
          카카오맵 로딩 중...
        </div>
      )}
      {hover && (
        <div style={{
          position: "absolute", top: 12, left: 12, zIndex: 100,
          background: "rgba(255, 255, 255, 0.97)",
          border: "1px solid var(--app-border)", borderRadius: 8,
          padding: "10px 12px", fontSize: 12, lineHeight: 1.6,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
          minWidth: 160, pointerEvents: "none",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: "#0f172a" }}>{hover.name}</div>
          {hover.kind === "serviceable" && (
            <>
              <div>예약 <strong>{hover.count.toLocaleString()}</strong>건</div>
              <div>객단가 <strong>{(hover.avgPrice ?? 0).toLocaleString()}</strong>원</div>
              <div style={{ color: "#64748b" }}>매출 {(hover.totalRevenue ?? 0).toLocaleString()}원</div>
            </>
          )}
          {hover.kind === "empty-serviceable" && (
            <div style={{ color: "#94a3b8" }}>예약 없음</div>
          )}
          {hover.kind === "unserviceable" && (
            <>
              <div style={{ color: "#7f1d1d" }}>서비스 불가 지역</div>
              {hover.count > 0
                ? <div>문의 <strong>{hover.count.toLocaleString()}</strong>건</div>
                : <div style={{ color: "#94a3b8" }}>문의 없음</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function geometryToPaths(
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] },
  kakao: Window["kakao"],
): KakaoLatLng[][] {
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0] as number[][];
    return [ring.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng))];
  }
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as number[][][][];
    return polys.map((poly) => {
      const ring = poly[0];
      return ring.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng));
    });
  }
  return [];
}
