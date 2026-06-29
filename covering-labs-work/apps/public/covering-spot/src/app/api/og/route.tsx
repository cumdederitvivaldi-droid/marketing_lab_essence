import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #0A1628 0%, #1A2B4A 100%)",
          padding: "60px",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#1AA3FF",
            marginBottom: 20,
          }}
        >
          커버링 방문수거
        </div>
        <div
          style={{
            fontSize: 36,
            color: "#F8FAFC",
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          대형폐기물 수거, 온라인으로 바로 예약
        </div>
        <div style={{ fontSize: 24, color: "#94A3B8", marginTop: 20 }}>
          서울 · 경기 · 인천 전 지역 | 사전 견적 = 최종 금액
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
