"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <div style={{ textAlign: "center", padding: "80px 16px", fontFamily: "system-ui" }}>
          <p style={{ color: "#6B7280", marginBottom: "8px" }}>
            페이지를 불러오는 중 오류가 발생했습니다.
          </p>
          {error.digest && (
            <p style={{ fontSize: "12px", color: "#9CA3AF", marginBottom: "24px" }}>
              오류 코드: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "280px", margin: "0 auto" }}>
            <button
              onClick={reset}
              style={{ padding: "12px 16px", background: "#1AA3FF", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}
            >
              다시 시도
            </button>
            <a
              href="/covering-spot/"
              style={{ padding: "12px 16px", background: "transparent", color: "#6B7280", border: "1px solid #E2E8F0", borderRadius: "12px", fontWeight: 600, fontSize: "14px", textDecoration: "none", display: "block" }}
            >
              홈으로
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
