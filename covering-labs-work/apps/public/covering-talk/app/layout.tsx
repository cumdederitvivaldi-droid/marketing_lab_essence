"use client";

import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { MessageSquare, Settings, LogOut, X, UtensilsCrossed, Headphones, Moon, Sun, Zap, Bell, Truck, LayoutDashboard, FlaskConical } from "lucide-react";
import { Toaster, toast } from "sonner";
import { prefetch, CACHE_KEYS } from "@/lib/cache/prefetch";
import { useNewConversationNotifier } from "@/lib/hooks/useNewConversationNotifier";
import { CsRealtimePresenceProvider } from "@/lib/hooks/CsRealtimePresenceContext";
import { ConversationUpdatesProvider } from "@/lib/hooks/ConversationUpdatesContext";
import { prefetchDashboardData } from "@/lib/dashboard/cache";
import { AuthProvider, useAuth } from "@/lib/auth/AuthContext";
import { ThemeProvider, useTheme } from "@/lib/theme/ThemeContext";

// basePath(/covering-talk) 없이 /api/ 로 시작하는 클라이언트 fetch를 자동 보정
if (typeof window !== "undefined") {
  const _origFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    if (typeof input === "string" && input.startsWith("/api/")) {
      input = "/covering-talk" + input;
    }
    return _origFetch(input, init);
  };
}

// 로그인명 → 채널톡 닉네임 (알림 표시용)
const LOGIN_TO_NICKNAME: Record<string, string> = {
  "김원빈": "테디",
  "박소리": "골드쉽",
  "김진유": "메리다",
  "신인섭": "토미",
};

// 채널톡 매니저명 → 로그인명 (알림 sender 표시에도 활용)
const NICKNAME_TO_LOGIN: Record<string, string> = {
  "라이언": "김원빈",
  "테디": "김원빈",
  "골드쉽": "박소리",
  "메리다": "김진유",
  "토미": "신인섭",
};

// 배차관리·관리자 대시보드는 특정 담당자만 접근 가능
const DISPATCH_ALLOWED_USERS = ["강성진", "유대현", "김원빈"];
const ADMIN_DASHBOARD_ALLOWED_USERS = ["강성진", "유대현", "김원빈"];
const LAB_ALLOWED_USERS = ["김원빈", "강성진"];  // 커버링 실험실 — 브랜드메시지 등 실험적 기능

const navItems = [
  { href: "/conversations", icon: MessageSquare, label: "방문수거", badgeKey: "conv" as const },
  { href: "/channeltalk", icon: Headphones, label: "채널톡", badgeKey: "ct" as const },
  // 대시보드·예약관리·품목관리 → 방문수거 내 뷰 전환 탭으로 이동
  { href: "/lunch", icon: UtensilsCrossed, label: "런치", badgeKey: "lunch" as const },
  { href: "/dispatch", icon: Truck, label: "배차", allowedUsers: DISPATCH_ALLOWED_USERS },
  { href: "/new_dashboard", icon: LayoutDashboard, label: "관리자", allowedUsers: ADMIN_DASHBOARD_ALLOWED_USERS },
  { href: "/lab/brand-message", icon: FlaskConical, label: "실험실", allowedUsers: LAB_ALLOWED_USERS },
  { href: "/settings", icon: Settings, label: "설정" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return (
      <html lang="ko">
        <head><title>커버링톡</title></head>
        <body style={{ margin: 0, fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
          {children}
          <Toaster richColors position="bottom-right" />
        </body>
      </html>
    );
  }

  return (
    <html lang="ko">
      <head><title>커버링톡</title></head>
      <body style={{ height: "100vh", display: "flex", overflow: "hidden", margin: 0, fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <ThemeProvider>
          <AuthProvider>
            <CsRealtimePresenceProvider>
              <ConversationUpdatesProvider>
                <DashboardShell>{children}</DashboardShell>
              </ConversationUpdatesProvider>
            </CsRealtimePresenceProvider>
          </AuthProvider>
        </ThemeProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}

interface Notification {
  id: string;
  recipient: string;
  sender: string;
  type: string;
  chat_id: string | null;
  message_preview: string | null;
  read: boolean;
  created_at: string;
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showPwModal, setShowPwModal] = useState(false);
  const [ctOpenCount, setCtOpenCount] = useState(0);
  const [convPendingCount, setConvPendingCount] = useState(0);
  const [lunchUnreadCount, setLunchUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useNewConversationNotifier();

  // 관리자 대시보드 권한자: 페이지 진입 시 한 번 + 30분 주기 백그라운드 prefetch
  // (이전 4분 주기는 cs-report Sonnet 비용 누적 → 30분으로 완화)
  useEffect(() => {
    if (!user || !ADMIN_DASHBOARD_ALLOWED_USERS.includes(user.name)) return;
    prefetchDashboardData();
    const t = setInterval(prefetchDashboardData, 30 * 60_000);
    return () => clearInterval(t);
  }, [user?.name]);

  const fetchBadgeCounts = useCallback(() => {
    fetch("/api/channeltalk/chats?state=opened")
      .then((r) => r.json())
      .then((d) => {
        const total = (d.chats ?? []).reduce(
          (sum: number, c: { unreadCount?: number }) => sum + (c.unreadCount ?? 0),
          0,
        );
        setCtOpenCount(total);
      })
      .catch(() => {});
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((d) => {
        const pending = (d.conversations ?? []).filter(
          (c: { status: string }) => c.status === "pending" || c.status === "needs_check"
        );
        setConvPendingCount(pending.length);
      })
      .catch(() => {});
    fetch("/api/lunch/conversations?limit=100")
      .then((r) => r.json())
      .then((d) => {
        const total = (d.conversations ?? []).reduce((sum: number, c: { unreadCount?: number }) => sum + (c.unreadCount ?? 0), 0);
        setLunchUnreadCount(total);
      })
      .catch(() => {});
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchBadgeCounts();
    // 30초 폴링 — 사이드 네비 배지(채널톡/방문수거/런치/알림) 는 stale 허용. 10s 였을 때
    //   ctrl→4개 API (chats/conversations/lunch/notifications) 매 10s 호출이라 Supabase 큰 비중.
    const timer = setInterval(fetchBadgeCounts, 30_000);
    return () => clearInterval(timer);
  }, [fetchBadgeCounts]);

  // 알림 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readAll: true }),
    }).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleNotifClick = async (notif: Notification) => {
    // 읽음 처리
    if (!notif.read) {
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [notif.id] }),
      }).catch(() => {});
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n));
    }
    // 해당 채팅으로 이동 — type 기준 라우팅
    if (notif.chat_id) {
      if (notif.type?.startsWith("mention_visit")) {
        window.location.href = `/covering-talk/conversations?id=${notif.chat_id}`;
      } else if (notif.type?.startsWith("mention_lunch")) {
        window.location.href = `/covering-talk/lunch?id=${notif.chat_id}`;
      } else {
        window.location.href = `/covering-talk/channeltalk?chatId=${notif.chat_id}`;
      }
    }
    setShowNotifications(false);
  };

  const handleDeleteNotif = async (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [notifId] }),
    }).catch(() => {});
  };

  useEffect(() => {
    prefetch(CACHE_KEYS.CONVERSATIONS, () =>
      fetch("/api/conversations").then((r) => r.json()).then((d) => d.conversations ?? [])
    ).catch(() => {});
    prefetch(CACHE_KEYS.DASHBOARD_STATS, () =>
      fetch("/api/dashboard/stats").then((r) => r.json())
    ).catch(() => {});
    prefetch(CACHE_KEYS.PRODUCTS, () =>
      fetch("/api/products/list").then((r) => r.json())
    ).catch(() => {});
  }, []);

  return (
    <>
      <nav style={{
        width: 64, flexShrink: 0, backgroundColor: "var(--app-nav-bg)",
        borderRight: "1px solid var(--app-nav-border)",
        display: "flex", flexDirection: "column", alignItems: "center",
        paddingTop: 16, paddingBottom: 16, gap: 4, zIndex: 50,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          overflow: "hidden", marginBottom: 20, flexShrink: 0,
        }}>
          <img src="/covering-talk/logo.png" alt="커버링스팟" style={{ width: 40, height: 40, objectFit: "cover" }} />
        </div>

        {navItems
          .filter((item) => !item.allowedUsers || (user?.name && item.allowedUsers.includes(user.name)))
          .map(({ href, icon: Icon, label, badgeKey }) => (
            <NavItem
              key={href}
              href={href}
              icon={Icon}
              label={label}
              badge={badgeKey === "ct" ? ctOpenCount : badgeKey === "conv" ? convPendingCount : badgeKey === "lunch" ? lunchUnreadCount : 0}
            />
          ))}

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {/* 알림 벨 */}
          <div ref={notifRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowNotifications((v) => !v)}
              title="알림"
              style={{
                width: 36, height: 36, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: showNotifications ? "var(--app-nav-hover)" : "transparent",
                border: "none", cursor: "pointer", position: "relative",
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => { if (!showNotifications) e.currentTarget.style.backgroundColor = "var(--app-nav-hover)"; }}
              onMouseLeave={(e) => { if (!showNotifications) e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <Bell style={{ width: 18, height: 18, color: "var(--app-nav-text)" }} />
              {unreadNotifCount > 0 && (
                <span style={{
                  position: "absolute", top: 2, right: 2,
                  minWidth: 16, height: 16, borderRadius: 8,
                  backgroundColor: "#EF4444", color: "white",
                  fontSize: 10, fontWeight: 700, lineHeight: "16px",
                  textAlign: "center", padding: "0 3px",
                }}>
                  {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                </span>
              )}
            </button>

            {/* 알림 드롭다운 */}
            {showNotifications && (
              <div style={{
                position: "absolute", bottom: 0, left: 48,
                width: 320, maxHeight: 420,
                backgroundColor: "var(--app-modal-bg)",
                border: "1px solid var(--app-border)",
                borderRadius: 12, boxShadow: "var(--app-shadow-lg)",
                zIndex: 100, overflow: "hidden",
                display: "flex", flexDirection: "column",
              }}>
                <div style={{
                  padding: "12px 16px", borderBottom: "1px solid var(--app-border)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--app-text-primary)" }}>
                    알림 {unreadNotifCount > 0 && `(${unreadNotifCount})`}
                  </span>
                  {unreadNotifCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      style={{
                        fontSize: 12, color: "var(--app-accent)",
                        backgroundColor: "transparent", border: "none", cursor: "pointer",
                      }}
                    >
                      모두 읽음
                    </button>
                  )}
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: 24, textAlign: "center", color: "var(--app-text-tertiary)", fontSize: 13 }}>
                      알림이 없습니다
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleNotifClick(n)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleNotifClick(n); }}
                        style={{
                          width: "100%", padding: "10px 16px",
                          display: "flex", alignItems: "flex-start", gap: 10,
                          backgroundColor: n.read ? "transparent" : "rgba(59,130,246,0.06)",
                          border: "none", borderBottom: "1px solid var(--app-border-light)",
                          cursor: "pointer", textAlign: "left",
                          transition: "background-color 0.1s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = n.read ? "transparent" : "rgba(59,130,246,0.06)"}
                      >
                        {!n.read && (
                          <span style={{
                            width: 8, height: 8, borderRadius: "50%",
                            backgroundColor: "#3B82F6", flexShrink: 0, marginTop: 5,
                          }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: "var(--app-text-primary)", marginBottom: 2 }}>
                            <strong>{LOGIN_TO_NICKNAME[n.sender] ?? n.sender}</strong>
                            {n.type === "mention" ? "님이 멘션했습니다" : "님의 알림"}
                          </div>
                          {n.message_preview && (
                            <div style={{
                              fontSize: 12, color: "var(--app-text-tertiary)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {n.message_preview}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 2 }}>
                            {formatNotifTime(n.created_at)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteNotif(e, n.id)}
                          style={{
                            flexShrink: 0, background: "none", border: "none",
                            cursor: "pointer", color: "var(--app-text-tertiary)",
                            padding: 4, borderRadius: 4, marginTop: 2,
                            transition: "color 0.15s",
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = "var(--app-text-primary)"}
                          onMouseLeave={(e) => e.currentTarget.style.color = "var(--app-text-tertiary)"}
                          title="알림 삭제"
                        >
                          <X style={{ width: 12, height: 12 }} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 다크모드 토글 */}
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "라이트 모드" : "다크 모드"}
            style={{
              width: 36, height: 36, borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "transparent", border: "none", cursor: "pointer",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-nav-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            {theme === "dark" ? (
              <Sun style={{ width: 18, height: 18, color: "#F59E0B" }} />
            ) : (
              <Moon style={{ width: 18, height: 18, color: "var(--app-nav-text)" }} />
            )}
          </button>

          {user && (
            <button
              onClick={() => setShowPwModal(true)}
              title={`${user.name} — 프로필 설정`}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                backgroundColor: "var(--app-accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, color: "white",
                border: "none", cursor: "pointer",
                transition: "transform 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            >
              {user.name.charAt(0)}
            </button>
          )}
          <button
            onClick={logout}
            title="로그아웃"
            style={{
              width: 36, height: 36, borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "transparent", border: "none", cursor: "pointer",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-nav-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            <LogOut style={{ width: 18, height: 18, color: "var(--app-nav-text)" }} />
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, overflow: "hidden", backgroundColor: "var(--app-bg)" }}>
        {children}
      </main>

      {showPwModal && (
        <ProfileModal userName={user?.name ?? ""} onClose={() => setShowPwModal(false)} />
      )}
    </>
  );
}

function ProfileModal({ userName, onClose }: { userName: string; onClose: () => void }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [ctNickname, setCtNickname] = useState("");
  const [ctNicknameLoaded, setCtNicknameLoaded] = useState(false);
  const [ctNicknameOriginal, setCtNicknameOriginal] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const [ctAiSuggestVisible, setCtAiSuggestVisible] = useState(true);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then((r) => r.json())
      .then((d) => {
        setCtNickname(d.channeltalkNickname ?? "");
        setCtNicknameOriginal(d.channeltalkNickname ?? "");
        setCtAiSuggestVisible(d.ctAiSuggestVisible !== false);
        setCtNicknameLoaded(true);
      })
      .catch(() => setCtNicknameLoaded(true));
  }, []);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw || !newPw || !confirmPw) return;
    if (newPw !== confirmPw) { toast.error("새 비밀번호가 일치하지 않습니다"); return; }
    if (newPw.length < 6) { toast.error("비밀번호는 6자 이상이어야 합니다"); return; }
    setSavingPw(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!res.ok) { const data = await res.json(); toast.error(data.error ?? "비밀번호 변경 실패"); return; }
      toast.success("비밀번호가 변경되었습니다");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch { toast.error("서버 연결 실패"); } finally { setSavingPw(false); }
  };

  const handleNicknameSave = async () => {
    if (ctNickname === ctNicknameOriginal) return;
    setSavingNickname(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channeltalkNickname: ctNickname }),
      });
      if (!res.ok) { const data = await res.json(); toast.error(data.error ?? "닉네임 저장 실패"); return; }
      toast.success("채널톡 닉네임이 저장되었습니다");
      setCtNicknameOriginal(ctNickname);
    } catch { toast.error("서버 연결 실패"); } finally { setSavingNickname(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", fontSize: 14,
    border: "1px solid var(--app-input-border)", borderRadius: 8,
    outline: "none", boxSizing: "border-box",
    backgroundColor: "var(--app-input-bg)", color: "var(--app-text-primary)",
    transition: "border-color 0.15s",
  };

  const nicknameChanged = ctNickname !== ctNicknameOriginal;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        backgroundColor: "var(--app-modal-backdrop)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420, backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
          padding: "28px 24px", boxShadow: "var(--app-shadow-lg)",
          maxHeight: "90vh", overflowY: "auto",
          border: "1px solid var(--app-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%", backgroundColor: "var(--app-accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, color: "white",
            }}>
              {userName.charAt(0)}
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>프로필 설정</h2>
              <p style={{ fontSize: 13, color: "var(--app-text-tertiary)", margin: "2px 0 0" }}>{userName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "transparent", border: "none", cursor: "pointer",
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 10,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Headphones style={{ width: 15, height: 15, color: "var(--app-accent)" }} />
            채널톡 닉네임
          </div>
          <p style={{ fontSize: 12, color: "var(--app-text-tertiary)", margin: "0 0 8px" }}>
            채널톡에서 고객에게 보이는 상담사 이름입니다. 비워두면 로그인 이름이 사용됩니다.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={ctNickname}
              onChange={(e) => setCtNickname(e.target.value)}
              placeholder={userName}
              maxLength={20}
              disabled={!ctNicknameLoaded}
              style={{ ...inputStyle, flex: 1 }}
              onFocus={(e) => e.target.style.borderColor = "var(--app-accent)"}
              onBlur={(e) => e.target.style.borderColor = "var(--app-input-border)"}
            />
            <button
              onClick={handleNicknameSave}
              disabled={!nicknameChanged || savingNickname}
              style={{
                padding: "10px 16px", fontSize: 13, fontWeight: 600,
                color: "white", whiteSpace: "nowrap",
                backgroundColor: nicknameChanged ? "var(--app-accent)" : "var(--app-disabled-bg)",
                border: "none", borderRadius: 8,
                cursor: nicknameChanged ? "pointer" : "not-allowed",
              }}
            >
              {savingNickname ? "저장중..." : "저장"}
            </button>
          </div>
        </div>

        {/* AI 추천 답변 토글 제거 — 운영 정책상 항상 ON 강제 (사전 생성 답변 누락 방지) */}

        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 12 }}>
          비밀번호 변경
        </div>
        <form onSubmit={handlePasswordSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 5 }}>현재 비밀번호</label>
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = "var(--app-accent)"} onBlur={(e) => e.target.style.borderColor = "var(--app-input-border)"} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 5 }}>새 비밀번호</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = "var(--app-accent)"} onBlur={(e) => e.target.style.borderColor = "var(--app-input-border)"} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 5 }}>새 비밀번호 확인</label>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = "var(--app-accent)"} onBlur={(e) => e.target.style.borderColor = "var(--app-input-border)"} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{
              padding: "10px 20px", fontSize: 14, fontWeight: 500,
              color: "var(--app-text-secondary)", backgroundColor: "var(--app-surface-secondary)",
              border: "none", borderRadius: 8, cursor: "pointer",
            }}>닫기</button>
            <button type="submit" disabled={savingPw || !currentPw || !newPw || !confirmPw} style={{
              padding: "10px 20px", fontSize: 14, fontWeight: 600,
              color: "white",
              backgroundColor: (savingPw || !currentPw || !newPw || !confirmPw) ? "var(--app-disabled-bg)" : "var(--app-accent)",
              border: "none", borderRadius: 8,
              cursor: (savingPw || !currentPw || !newPw || !confirmPw) ? "not-allowed" : "pointer",
            }}>
              {savingPw ? "변경 중..." : "비밀번호 변경"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NavItem({ href, icon: Icon, label, badge = 0 }: { href: string; icon: React.ElementType; label: string; badge?: number }) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      title={label}
      style={{
        width: 44, height: 44, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: isActive ? "var(--app-accent)" : "transparent",
        textDecoration: "none", position: "relative",
        transition: "background-color 0.15s",
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--app-nav-hover)"; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <Icon style={{ width: 20, height: 20, color: isActive ? "white" : "var(--app-nav-text)" }} />
      {badge > 0 && (
        <span style={{
          position: "absolute", top: 2, right: 2,
          minWidth: 18, height: 18, borderRadius: 9,
          backgroundColor: "#EF4444", color: "white",
          fontSize: 11, fontWeight: 700, lineHeight: "18px",
          textAlign: "center", padding: "0 4px",
        }}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function formatNotifTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}일 전`;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}
