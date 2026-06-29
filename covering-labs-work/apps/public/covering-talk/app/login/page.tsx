"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // OAuth 에러 메시지 표시
  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) setError(oauthError);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "로그인 실패");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("서버 연결 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: 380,
      backgroundColor: "var(--app-surface)",
      borderRadius: 16,
      padding: "40px 32px",
      boxShadow: "var(--app-shadow-lg)",
    }}>
      {/* 로고 */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <img
          src="/covering-talk/logo.png"
          alt="커버링스팟"
          style={{ width: 56, height: 56, borderRadius: 14, marginBottom: 12 }}
        />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>
          커버링톡
        </h1>
        <p style={{ fontSize: 14, color: "var(--app-text-secondary)", marginTop: 4 }}>
          상담사 이름으로 로그인하세요
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 6 }}>
            이름
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 김원빈"
            autoFocus
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: 15,
              border: "1px solid var(--app-input-border)",
              borderRadius: 8,
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => e.target.style.borderColor = "var(--app-accent)"}
            onBlur={(e) => e.target.style.borderColor = "var(--app-input-border)"}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 6 }}>
            비밀번호
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 입력"
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: 15,
              border: "1px solid var(--app-input-border)",
              borderRadius: 8,
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => e.target.style.borderColor = "var(--app-accent)"}
            onBlur={(e) => e.target.style.borderColor = "var(--app-input-border)"}
          />
        </div>

        {error && (
          <div style={{
            marginBottom: 16,
            padding: "10px 14px",
            backgroundColor: "var(--app-tag-red-bg)",
            color: "var(--app-tag-red-text)",
            fontSize: 13,
            borderRadius: 8,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !name.trim() || !password}
          style={{
            width: "100%",
            padding: "12px 0",
            fontSize: 15,
            fontWeight: 600,
            color: "white",
            backgroundColor: loading ? "var(--app-border)" : "var(--app-accent)",
            border: "none",
            borderRadius: 8,
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background-color 0.15s",
          }}
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>

      {/* 구분선 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        margin: "24px 0",
      }}>
        <div style={{ flex: 1, height: 1, backgroundColor: "var(--app-border)" }} />
        <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>또는</span>
        <div style={{ flex: 1, height: 1, backgroundColor: "var(--app-border)" }} />
      </div>

      {/* Google 로그인 */}
      <button
        onClick={() => { window.location.href = "/covering-talk/api/auth/google"; }}
        style={{
          width: "100%",
          padding: "12px 0",
          fontSize: 15,
          fontWeight: 600,
          color: "var(--app-text-secondary)",
          backgroundColor: "var(--app-surface)",
          border: "1px solid var(--app-input-border)",
          borderRadius: 8,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          transition: "background-color 0.15s",
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface-hover)"}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface)"}
      >
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Google 계정으로 로그인
      </button>
      <p style={{ fontSize: 12, color: "var(--app-text-tertiary)", textAlign: "center", marginTop: 8 }}>
        @covering.app 계정만 가능
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "var(--app-bg)",
      fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
