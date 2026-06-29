"use client";

import { useState, useEffect } from "react";
import { Loader2, Zap, AlertTriangle, Brain, MessageSquare, SkipForward, RotateCcw, Save, MessageCircle, Truck, ChevronRight, Tag, Plus, X, Pencil, Trash2, Clock, FileText } from "lucide-react";
import { TemplateModal } from "@/components/channeltalk";
import { toast } from "sonner";

// 기본 템플릿 (workflow-config.ts와 동일)
const DEFAULT_GREETING = `안녕하세요, 커버링입니다 :)

📝 정확한 견적을 위해 아래 내용을 채팅으로 작성해주세요

1.수거 희망 일시 📅
예) {{예시날짜}}

2. 상세 주소 📍
예) 서울시 성동구 성수동 123-45, 3층
주거 형태(주택·빌라/아파트) 차량(탑차) 진입이 원활한가요?

3. 버릴 품목 📦
예) 싱글 침대 1개, 3인용 소파 1개, 양문형 냉장고 1개

📌 아래 항목에 해당하는 품목이 있다면 별도로 알려주세요
  - 현관문/엘리베이터를 통과하기 어려운 대형 품목
  - 해체가 필요한 품목
  - 가전/가구에 내용물이 들어있는 경우

4. 작업 환경 🏢
• 엘리베이터: 사용 가능 / 사용 불가
• 주차: 가능 / 불가능

위 내용을 작성해서 보내주시면
담당자가 확인 후 견적을 안내드리겠습니다.`;

const DEFAULT_QUOTE = `고객님, 기다려주셔서 감사합니다.
전달해 주신 내용에 따라 예상 견적 안내해 드립니다!

견적: {{금액}}
* 내용물이 비워지지 않으면 추가 비용이 발생할 수 있으며, 함께 수거가 필요한 품목이 있으시면 말씀 부탁드립니다.

수거를 희망하시면 예약 확정 도와드리겠습니다.
추가로 궁금하신 점이 있으시다면 언제든지 말씀 주세요 : )`;

const DEFAULT_BOOKING_CONFIRM = `말씀해 주신 날짜와 주소로 수거 예약 완료 되었습니다!

{{결제정보}}

혹시 수거 관련하여 변동 사항이 있으신 경우, 수거 24시간 전까지만 말씀해 주세요.
깔끔한 수거로 찾아뵙겠습니다!

감사합니다 : )`;

interface WorkflowConfig {
  greeting: string;
  quote: string;
  booking_confirm: string;
  skip_nudge: boolean;
  skip_doublecheck: boolean;
}

const DEFAULTS: WorkflowConfig = {
  greeting: DEFAULT_GREETING,
  quote: DEFAULT_QUOTE,
  booking_confirm: DEFAULT_BOOKING_CONFIRM,
  skip_nudge: false,
  skip_doublecheck: false,
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"happytalk" | "channeltalk">("happytalk");
  const [autoMode, setAutoMode] = useState(false);
  const [aiProvider, setAiProvider] = useState<string>("anthropic");
  const [extractionModel, setExtractionModel] = useState<string>("haiku");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);

  // 시트 동기화
  const [sheetSyncEnabled, setSheetSyncEnabled] = useState(false);

  // 채널톡 자동종료/자동배차
  const [ctAutoClose, setCtAutoClose] = useState(false);
  const [ctAutoVehicle, setCtAutoVehicle] = useState(true);

  // 템플릿 관리
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // 태그 관리
  const [showTagModal, setShowTagModal] = useState(false);
  const [tags, setTags] = useState<Array<{ id: number; tag: string; description: string; category: string; is_active: boolean }>>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newTagCategory, setNewTagCategory] = useState("");
  const [newTagDesc, setNewTagDesc] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editTag, setEditTag] = useState("");
  const [editTagCategory, setEditTagCategory] = useState("");
  const [editTagDesc, setEditTagDesc] = useState("");

  const fetchTags = async () => {
    setTagsLoading(true);
    try {
      const res = await fetch("/api/channeltalk/tags");
      const data = await res.json();
      setTags(data.tags ?? []);
    } catch { /* ignore */ }
    finally { setTagsLoading(false); }
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    setTagSaving(true);
    try {
      const res = await fetch("/api/channeltalk/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: newTag.trim(), category: newTagCategory.trim(), description: newTagDesc.trim() }),
      });
      if (res.ok) {
        toast.success("태그 추가 완료");
        setNewTag(""); setNewTagCategory(""); setNewTagDesc("");
        fetchTags();
      } else {
        const d = await res.json();
        toast.error(d.error || "추가 실패");
      }
    } catch { toast.error("추가 실패"); }
    finally { setTagSaving(false); }
  };

  const handleDeleteTag = async (id: number) => {
    try {
      await fetch("/api/channeltalk/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      toast.success("태그 비활성화 완료");
      fetchTags();
    } catch { toast.error("삭제 실패"); }
  };

  const handleToggleTag = async (id: number, is_active: boolean) => {
    try {
      await fetch("/api/channeltalk/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active }),
      });
      fetchTags();
    } catch { toast.error("변경 실패"); }
  };

  const handleUpdateTag = async (id: number) => {
    setTagSaving(true);
    try {
      const res = await fetch("/api/channeltalk/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tag: editTag, category: editTagCategory, description: editTagDesc }),
      });
      if (res.ok) {
        toast.success("태그 수정 완료");
        setEditingTagId(null);
        fetchTags();
      }
    } catch { toast.error("수정 실패"); }
    finally { setTagSaving(false); }
  };

  // 워크플로우 설정
  const [wfConfig, setWfConfig] = useState<WorkflowConfig>(DEFAULTS);
  const [savingWf, setSavingWf] = useState(false);
  const [wfDirty, setWfDirty] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setAutoMode(d.settings?.auto_mode === true);
        setAiProvider(d.settings?.ai_provider ?? "anthropic");
        setExtractionModel(d.settings?.extraction_model ?? "haiku");
        setSheetSyncEnabled(d.settings?.sheet_sync_enabled === true || d.settings?.sheet_sync_enabled === "true");
        // 채널톡 설정
        if (d.settings?.channeltalk_auto_close !== undefined) {
          setCtAutoClose(d.settings.channeltalk_auto_close === "true" || d.settings.channeltalk_auto_close === true);
        }
        if (d.settings?.channeltalk_auto_vehicle !== undefined) {
          setCtAutoVehicle(d.settings.channeltalk_auto_vehicle === "true" || d.settings.channeltalk_auto_vehicle === true);
        }
        if (d.settings?.workflow_config && typeof d.settings.workflow_config === "object") {
          setWfConfig({ ...DEFAULTS, ...d.settings.workflow_config });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const changeAiProvider = async (value: string) => {
    setSavingProvider(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "ai_provider", value }),
      });
      if (!res.ok) throw new Error();
      setAiProvider(value);
      toast.success(`AI 프로바이더: ${value === "openai" ? "OpenAI GPT" : "Anthropic Claude"}`);
    } catch {
      toast.error("설정 저장에 실패했습니다");
    } finally {
      setSavingProvider(false);
    }
  };

  const changeExtractionModel = async (value: string) => {
    setSavingModel(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "extraction_model", value }),
      });
      if (!res.ok) throw new Error();
      setExtractionModel(value);
      toast.success(`품목 추출 모델: ${value === "sonnet" ? "Sonnet (정확)" : "Haiku (빠름)"}`);
    } catch {
      toast.error("설정 저장에 실패했습니다");
    } finally {
      setSavingModel(false);
    }
  };

  const toggleAutoMode = async (value: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "auto_mode", value }),
      });
      if (!res.ok) throw new Error();
      setAutoMode(value);
      toast.success(value ? "자동상담이 활성화되었습니다" : "자동상담이 비활성화되었습니다");
    } catch {
      toast.error("설정 저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  };

  const updateWfField = (key: keyof WorkflowConfig, value: unknown) => {
    setWfConfig((prev) => ({ ...prev, [key]: value }));
    setWfDirty(true);
  };

  const saveWorkflowConfig = async () => {
    setSavingWf(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "workflow_config", value: wfConfig }),
      });
      if (!res.ok) throw new Error();
      setWfDirty(false);
      toast.success("워크플로우 설정이 저장되었습니다");
    } catch {
      toast.error("저장에 실패했습니다");
    } finally {
      setSavingWf(false);
    }
  };

  const togglePhase = async (key: "skip_nudge" | "skip_doublecheck", value: boolean) => {
    const newConfig = { ...wfConfig, [key]: value };
    setWfConfig(newConfig);
    // 토글은 즉시 저장
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "workflow_config", value: newConfig }),
      });
      if (!res.ok) throw new Error();
      const label = key === "skip_nudge" ? "넛지 단계" : "더블체크";
      toast.success(value ? `${label} 스킵 활성화` : `${label} 스킵 해제`);
    } catch {
      toast.error("저장에 실패했습니다");
      setWfConfig(wfConfig); // rollback
    }
  };

  const resetTemplate = (key: keyof WorkflowConfig) => {
    updateWfField(key, DEFAULTS[key]);
  };

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite", color: "var(--app-text-tertiary)" }} />
        <span style={{ marginLeft: 8, color: "var(--app-text-tertiary)", fontSize: 15 }}>로딩 중...</span>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--app-bg)" }}>
      {/* 헤더 + 탭 */}
      <div style={{ backgroundColor: "var(--app-surface)", borderBottom: "1px solid var(--app-border)" }}>
        <div style={{ padding: "20px 32px 0" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>설정</h1>
          <p style={{ fontSize: 13, color: "var(--app-text-tertiary)", margin: "4px 0 0" }}>
            시스템 운영 설정을 관리합니다
          </p>
        </div>
        <div style={{ display: "flex", gap: 0, padding: "16px 32px 0" }}>
          {([
            { key: "happytalk" as const, label: "방문수거", icon: <Truck style={{ width: 15, height: 15 }} /> },
            { key: "channeltalk" as const, label: "채널톡", icon: <MessageCircle style={{ width: 15, height: 15 }} /> },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 20px", fontSize: 14, fontWeight: 600,
                color: activeTab === tab.key ? "var(--app-accent)" : "var(--app-text-tertiary)",
                backgroundColor: "transparent", border: "none",
                borderBottom: activeTab === tab.key ? "2px solid var(--app-accent)" : "2px solid transparent",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 설정 목록 */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>

      {activeTab === "channeltalk" && (
        <div>
          {/* 상담 분석 */}
          <a
            href="/channeltalk/analytics"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "var(--app-surface)", borderRadius: 12,
              border: "1px solid var(--app-border)", padding: 24, maxWidth: 700,
              textDecoration: "none", cursor: "pointer", transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--app-accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--app-border)"; }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--app-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)" }}>상담 분석</span>
              </div>
              <p style={{ fontSize: 14, color: "var(--app-text-secondary)", lineHeight: 1.6, margin: 0 }}>
                응답 시간, 상담 처리량, 태그 분포, 시간대별 유입 등 상담 통계를 확인합니다.
              </p>
            </div>
            <ChevronRight style={{ width: 20, height: 20, color: "var(--app-text-tertiary)", flexShrink: 0 }} />
          </a>

          <div style={{ height: 16 }} />

          {/* 태그 관리 */}
          <button
            onClick={() => { setShowTagModal(true); fetchTags(); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "var(--app-surface)", borderRadius: 12,
              border: "1px solid var(--app-border)", padding: 24, maxWidth: 700,
              width: "100%", textAlign: "left", cursor: "pointer", transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--app-accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--app-border)"; }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Tag style={{ width: 20, height: 20, color: "#F59E0B" }} />
                <span style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)" }}>태그 관리</span>
              </div>
              <p style={{ fontSize: 14, color: "var(--app-text-secondary)", lineHeight: 1.6, margin: 0 }}>
                상담에 사용할 태그를 추가/수정/비활성화합니다.
              </p>
            </div>
            <ChevronRight style={{ width: 20, height: 20, color: "var(--app-text-tertiary)", flexShrink: 0 }} />
          </button>

          <div style={{ height: 16 }} />

          {/* 카테고리 프롬프트 관리 링크 */}
          <a
            href="/settings/category-prompts"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "var(--app-surface)", borderRadius: 12,
              border: "1px solid var(--app-border)", padding: 24, maxWidth: 700,
              textDecoration: "none", cursor: "pointer", transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--app-accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--app-border)"; }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Tag style={{ width: 20, height: 20, color: "var(--app-accent)" }} />
                <span style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)" }}>카테고리 프롬프트 관리</span>
              </div>
              <p style={{ fontSize: 14, color: "var(--app-text-secondary)", lineHeight: 1.6, margin: 0 }}>
                20개 카테고리별 AI 답변 규칙을 확인하고 수정합니다.
              </p>
            </div>
            <ChevronRight style={{ width: 20, height: 20, color: "var(--app-text-tertiary)", flexShrink: 0 }} />
          </a>

          <div style={{ height: 16 }} />

          {/* 템플릿 관리 */}
          <button
            onClick={() => setShowTemplateModal(true)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "var(--app-surface)", borderRadius: 12,
              border: "1px solid var(--app-border)", padding: 24, maxWidth: 700,
              width: "100%", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--app-accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--app-border)"; }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <FileText style={{ width: 20, height: 20, color: "var(--app-accent)" }} />
                <span style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)" }}>템플릿 관리</span>
              </div>
              <p style={{ fontSize: 14, color: "var(--app-text-secondary)", lineHeight: 1.6, margin: 0 }}>
                상담 매크로 템플릿을 추가/수정/삭제합니다.
              </p>
            </div>
            <ChevronRight style={{ width: 20, height: 20, color: "var(--app-text-tertiary)", flexShrink: 0 }} />
          </button>

          <div style={{ height: 16 }} />

          {/* 자동종료 / 자동배차 토글 */}
          <div style={{
            backgroundColor: "var(--app-surface)", borderRadius: 12,
            border: "1px solid var(--app-border)", padding: 24, maxWidth: 700,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Clock style={{ width: 18, height: 18, color: ctAutoClose ? "var(--app-accent)" : "var(--app-text-tertiary)" }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)" }}>자동종료</div>
                  <div style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>회신 없는 상담을 자동으로 종료합니다</div>
                </div>
              </div>
              <ToggleSwitch on={ctAutoClose} onChange={() => {
                const next = !ctAutoClose;
                setCtAutoClose(next);
                fetch("/api/settings", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ key: "channeltalk_auto_close", value: String(next) }),
                }).catch(() => {});
              }} />
            </div>
            <div style={{ borderTop: "1px solid var(--app-border-light)", paddingTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Truck style={{ width: 18, height: 18, color: ctAutoVehicle ? "var(--app-accent)" : "var(--app-text-tertiary)" }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)" }}>자동배차</div>
                  <div style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>차량등록 요청을 자동으로 처리합니다</div>
                </div>
              </div>
              <ToggleSwitch on={ctAutoVehicle} onChange={() => {
                const next = !ctAutoVehicle;
                setCtAutoVehicle(next);
                fetch("/api/settings", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ key: "channeltalk_auto_vehicle", value: String(next) }),
                }).catch(() => {});
              }} />
            </div>
          </div>

          <div style={{ height: 40 }} />
        </div>
      )}

      {activeTab === "happytalk" && (
        <>
        {/* ── 자동 응답 모드 ── */}
        <div style={{
          backgroundColor: "var(--app-surface)", borderRadius: 12,
          border: autoMode ? "2px solid #1AA3FF" : "1px solid var(--app-border)",
          padding: 24, maxWidth: 700,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Zap style={{ width: 20, height: 20, color: autoMode ? "var(--app-accent)" : "var(--app-text-tertiary)" }} />
                <span style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)" }}>자동상담</span>
              </div>
              <p style={{ fontSize: 14, color: "var(--app-text-secondary)", lineHeight: 1.6, margin: 0 }}>
                활성화하면 AI가 생성한 답변이 상담사 확인 없이<br />
                자동으로 고객에게 발송됩니다.
              </p>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                marginTop: 12, padding: "6px 12px", borderRadius: 20,
                backgroundColor: autoMode ? "var(--app-tag-blue-bg)" : "var(--app-surface-secondary)",
                fontSize: 13, fontWeight: 600,
                color: autoMode ? "var(--app-accent)" : "var(--app-text-tertiary)",
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: autoMode ? "var(--app-accent)" : "#ADB5BD",
                }} />
                {autoMode ? "자동상담 활성" : "수동상담 (기본)"}
              </div>
            </div>
            <ToggleSwitch on={autoMode} disabled={saving} onChange={() => toggleAutoMode(!autoMode)} />
          </div>
          {autoMode && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              marginTop: 16, padding: "12px 14px",
              backgroundColor: "var(--app-tag-yellow-bg)", borderRadius: 8, border: "1px solid var(--app-border)",
            }}>
              <AlertTriangle style={{ width: 16, height: 16, color: "#F9A825", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: "var(--app-tag-yellow-text)", lineHeight: 1.5 }}>
                <strong>주의:</strong> 자동 모드에서는 AI가 판단하기 어려운 질문만 상담사에게 전달됩니다.
              </div>
            </div>
          )}
        </div>

        {/* ── 품목 추출 모델 ── */}
        <div style={{
          backgroundColor: "var(--app-surface)", borderRadius: 12,
          border: "1px solid var(--app-border)", padding: 24, maxWidth: 700, marginTop: 16,
        }}>
          <div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Brain style={{ width: 20, height: 20, color: "var(--app-tag-purple-text)" }} />
                <span style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)" }}>AI 프로바이더</span>
              </div>

              {/* AI 프로바이더 선택 */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 0", borderBottom: "1px solid var(--app-border-light)",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)" }}>AI 프로바이더</div>
                  <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", marginTop: 2 }}>
                    Claude API 장애 시 OpenAI GPT로 전환 가능
                  </div>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    marginTop: 8, padding: "4px 10px", borderRadius: 16,
                    backgroundColor: aiProvider === "openai" ? "#E8F5E9" : "var(--app-tag-purple-bg)",
                    fontSize: 12, fontWeight: 600,
                    color: aiProvider === "openai" ? "#2E7D32" : "var(--app-tag-purple-text)",
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      backgroundColor: aiProvider === "openai" ? "#2E7D32" : "var(--app-tag-purple-text)",
                    }} />
                    {aiProvider === "openai" ? "OpenAI GPT (gpt-5.4 / 5.4-mini)" : "Anthropic Claude (Sonnet / Haiku)"}
                  </div>
                </div>
                <select
                  value={aiProvider}
                  onChange={(e) => changeAiProvider(e.target.value)}
                  disabled={savingProvider}
                  style={{
                    padding: "8px 12px", borderRadius: 8,
                    border: "1px solid var(--app-input-border)", fontSize: 14,
                    color: "var(--app-text-primary)", backgroundColor: "var(--app-surface)",
                    cursor: savingProvider ? "default" : "pointer",
                    opacity: savingProvider ? 0.6 : 1,
                  }}
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                </select>
              </div>

            </div>
          </div>
        </div>

        {/* ── 구글 시트 동기화 ── */}
        <div style={{
          backgroundColor: "var(--app-surface)", borderRadius: 12,
          border: "1px solid var(--app-border)", padding: 24, maxWidth: 700, marginTop: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <FileText style={{ width: 20, height: 20, color: "#2E7D32" }} />
                <span style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)" }}>구글 시트 동기화</span>
              </div>
              <p style={{ fontSize: 14, color: "var(--app-text-secondary)", lineHeight: 1.6, margin: 0 }}>
                5분마다 orders 테이블 → 구글 스프레드시트 자동 동기화
              </p>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                marginTop: 8, padding: "4px 10px", borderRadius: 16,
                backgroundColor: sheetSyncEnabled ? "#E8F5E9" : "var(--app-surface-secondary)",
                fontSize: 12, fontWeight: 600,
                color: sheetSyncEnabled ? "#2E7D32" : "var(--app-text-tertiary)",
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  backgroundColor: sheetSyncEnabled ? "#2E7D32" : "#ADB5BD",
                }} />
                {sheetSyncEnabled ? "동기화 활성" : "동기화 비활성"}
              </div>
            </div>
            <ToggleSwitch on={sheetSyncEnabled} onChange={async () => {
              const newVal = !sheetSyncEnabled;
              try {
                const res = await fetch("/api/settings", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ key: "sheet_sync_enabled", value: newVal }),
                });
                if (!res.ok) throw new Error();
                setSheetSyncEnabled(newVal);
                toast.success(`시트 동기화: ${newVal ? "활성화" : "비활성화"}`);
              } catch { toast.error("설정 저장 실패"); }
            }} />
          </div>
        </div>

        {/* ── 단계 설정 (Phase 토글) ── */}
        <div style={{
          backgroundColor: "var(--app-surface)", borderRadius: 12,
          border: "1px solid var(--app-border)", padding: 24, maxWidth: 700, marginTop: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <SkipForward style={{ width: 20, height: 20, color: "#F59E0B" }} />
            <span style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)" }}>단계 설정</span>
          </div>

          {/* 넛지 스킵 */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 0", borderBottom: "1px solid var(--app-border-light)",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)" }}>넛지 단계 스킵</div>
              <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", marginTop: 2 }}>
                고객이 고민/보류 시 넛지 메시지 없이 견적 안내 상태 유지
              </div>
            </div>
            <ToggleSwitch on={wfConfig.skip_nudge} onChange={() => togglePhase("skip_nudge", !wfConfig.skip_nudge)} />
          </div>

          {/* 더블체크 스킵 */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 0",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)" }}>예약 더블체크 스킵</div>
              <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", marginTop: 2 }}>
                예약 정보 재확인 없이 바로 예약 완료 메시지 전송
              </div>
            </div>
            <ToggleSwitch on={wfConfig.skip_doublecheck} onChange={() => togglePhase("skip_doublecheck", !wfConfig.skip_doublecheck)} />
          </div>
        </div>

        {/* ── 응답 템플릿 편집 ── */}
        <div style={{
          backgroundColor: "var(--app-surface)", borderRadius: 12,
          border: "1px solid var(--app-border)", padding: 24, maxWidth: 700, marginTop: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MessageSquare style={{ width: 20, height: 20, color: "#10B981" }} />
              <span style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)" }}>응답 템플릿</span>
            </div>
            <button
              onClick={saveWorkflowConfig}
              disabled={savingWf || !wfDirty}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8,
                backgroundColor: wfDirty ? "var(--app-accent)" : "var(--app-border)",
                color: wfDirty ? "white" : "var(--app-text-tertiary)",
                border: "none", fontSize: 13, fontWeight: 600,
                cursor: wfDirty && !savingWf ? "pointer" : "default",
                opacity: savingWf ? 0.6 : 1,
              }}
            >
              {savingWf ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Save style={{ width: 14, height: 14 }} />}
              {savingWf ? "저장 중..." : "템플릿 저장"}
            </button>
          </div>

          {/* 인사말 */}
          <TemplateField
            label="인사말 (Phase 1)"
            description="고객 첫 메시지 시 자동 발송되는 인사말. {{예시날짜}}는 3일 후 날짜로 자동 치환됩니다."
            value={wfConfig.greeting}
            onChange={(v) => updateWfField("greeting", v)}
            onReset={() => resetTemplate("greeting")}
            rows={18}
          />

          {/* 견적 안내 */}
          <TemplateField
            label="견적 안내 (Phase 4)"
            description="견적 산출 후 고객에게 보내는 메시지. {{금액}}은 '88,000원 (부가세 포함)' 형식으로 치환됩니다."
            value={wfConfig.quote}
            onChange={(v) => updateWfField("quote", v)}
            onReset={() => resetTemplate("quote")}
            rows={8}
          />

          {/* 예약 확정 */}
          <TemplateField
            label="예약 확정 (Phase 7)"
            description="고객이 예약을 확정했을 때 AI가 보내는 메시지."
            value={wfConfig.booking_confirm}
            onChange={(v) => updateWfField("booking_confirm", v)}
            onReset={() => resetTemplate("booking_confirm")}
            rows={6}
            last
          />
        </div>

        <div style={{ height: 40 }} />
      </>
      )}
      </div>

      {/* ─── 템플릿 관리 모달 ─── */}
      {showTemplateModal && <TemplateModal onClose={() => setShowTemplateModal(false)} />}

      {/* ─── 태그 관리 모달 ─── */}
      {showTagModal && (
        <div
          onClick={() => setShowTagModal(false)}
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 720, maxHeight: "80vh", backgroundColor: "var(--app-surface)",
              borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            {/* 모달 헤더 */}
            <div style={{
              padding: "20px 24px", borderBottom: "1px solid var(--app-border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Tag style={{ width: 20, height: 20, color: "#F59E0B" }} />
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)" }}>태그 관리</span>
                <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>
                  ({tags.filter(t => t.is_active).length}개 활성)
                </span>
              </div>
              <button
                onClick={() => setShowTagModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--app-text-tertiary)", padding: 4 }}
              >
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            {/* 새 태그 추가 */}
            <div style={{
              padding: "16px 24px", borderBottom: "1px solid var(--app-border)",
              backgroundColor: "var(--app-surface-secondary)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 10 }}>
                <Plus style={{ width: 14, height: 14, display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                새 태그 추가
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 3, display: "block" }}>카테고리</label>
                  <input
                    value={newTagCategory}
                    onChange={(e) => setNewTagCategory(e.target.value)}
                    placeholder="예: 고객유형, 배출, 미수거"
                    style={{
                      width: "100%", padding: "7px 10px", fontSize: 13,
                      border: "1px solid var(--app-border)", borderRadius: 6,
                      backgroundColor: "var(--app-surface)", color: "var(--app-text-primary)",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 3, display: "block" }}>태그명 *</label>
                  <input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="예: 고객유형/FIRST"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddTag(); }}
                    style={{
                      width: "100%", padding: "7px 10px", fontSize: 13,
                      border: "1px solid var(--app-border)", borderRadius: 6,
                      backgroundColor: "var(--app-surface)", color: "var(--app-text-primary)",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 3, display: "block" }}>설명</label>
                  <input
                    value={newTagDesc}
                    onChange={(e) => setNewTagDesc(e.target.value)}
                    placeholder="태그 용도 설명 (선택)"
                    style={{
                      width: "100%", padding: "7px 10px", fontSize: 13,
                      border: "1px solid var(--app-border)", borderRadius: 6,
                      backgroundColor: "var(--app-surface)", color: "var(--app-text-primary)",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                <button
                  onClick={handleAddTag}
                  disabled={!newTag.trim() || tagSaving}
                  style={{
                    padding: "7px 16px", borderRadius: 6,
                    backgroundColor: newTag.trim() ? "var(--app-accent)" : "var(--app-surface-secondary)",
                    color: newTag.trim() ? "#fff" : "var(--app-text-tertiary)",
                    border: "none", cursor: newTag.trim() ? "pointer" : "default",
                    fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  {tagSaving ? "..." : "추가"}
                </button>
              </div>
            </div>

            {/* 태그 목록 */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0" }}>
              {tagsLoading ? (
                <div style={{ padding: 40, textAlign: "center" }}>
                  <Loader2 style={{ width: 24, height: 24, color: "var(--app-accent)", animation: "spin 1s linear infinite", margin: "0 auto" }} />
                </div>
              ) : (
                (() => {
                  // 카테고리별 그룹핑
                  const grouped = new Map<string, typeof tags>();
                  for (const t of tags) {
                    const cat = t.category || "기타";
                    if (!grouped.has(cat)) grouped.set(cat, []);
                    grouped.get(cat)!.push(t);
                  }
                  return [...grouped.entries()].map(([category, catTags]) => (
                    <div key={category}>
                      <div style={{
                        padding: "10px 24px", fontSize: 12, fontWeight: 700,
                        color: "var(--app-text-tertiary)", backgroundColor: "var(--app-bg)",
                        borderBottom: "1px solid var(--app-border-light)",
                        textTransform: "uppercase", letterSpacing: 0.5,
                      }}>
                        {category} ({catTags.filter(t => t.is_active).length})
                      </div>
                      {catTags.map((t) => (
                        <div
                          key={t.id}
                          style={{
                            padding: "10px 24px", borderBottom: "1px solid var(--app-border-light)",
                            display: "flex", alignItems: "center", gap: 12,
                            opacity: t.is_active ? 1 : 0.4,
                          }}
                        >
                          {editingTagId === t.id ? (
                            /* 편집 모드 */
                            <>
                              <input value={editTagCategory} onChange={(e) => setEditTagCategory(e.target.value)}
                                style={{ width: 80, padding: "4px 8px", fontSize: 12, border: "1px solid var(--app-border)", borderRadius: 4, backgroundColor: "var(--app-surface)", color: "var(--app-text-primary)" }}
                              />
                              <input value={editTag} onChange={(e) => setEditTag(e.target.value)}
                                style={{ flex: 1, padding: "4px 8px", fontSize: 13, fontWeight: 600, border: "1px solid var(--app-border)", borderRadius: 4, backgroundColor: "var(--app-surface)", color: "var(--app-text-primary)" }}
                              />
                              <input value={editTagDesc} onChange={(e) => setEditTagDesc(e.target.value)}
                                placeholder="설명"
                                style={{ flex: 2, padding: "4px 8px", fontSize: 12, border: "1px solid var(--app-border)", borderRadius: 4, backgroundColor: "var(--app-surface)", color: "var(--app-text-primary)" }}
                              />
                              <button onClick={() => handleUpdateTag(t.id)}
                                style={{ padding: "4px 10px", borderRadius: 4, backgroundColor: "var(--app-accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                저장
                              </button>
                              <button onClick={() => setEditingTagId(null)}
                                style={{ padding: "4px 8px", borderRadius: 4, backgroundColor: "transparent", color: "var(--app-text-tertiary)", border: "1px solid var(--app-border)", cursor: "pointer", fontSize: 11 }}>
                                취소
                              </button>
                            </>
                          ) : (
                            /* 뷰 모드 */
                            <>
                              <span style={{
                                display: "inline-block", padding: "2px 8px", borderRadius: 4,
                                backgroundColor: "var(--app-tag-blue-bg)", color: "var(--app-accent)",
                                fontSize: 11, fontWeight: 600, flexShrink: 0,
                              }}>
                                {t.category || "기타"}
                              </span>
                              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", minWidth: 100 }}>
                                {t.tag}
                              </span>
                              <span style={{ flex: 1, fontSize: 12, color: "var(--app-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {t.description || "—"}
                              </span>
                              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                <button
                                  onClick={() => { setEditingTagId(t.id); setEditTag(t.tag); setEditTagCategory(t.category); setEditTagDesc(t.description); }}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--app-text-tertiary)", padding: 4 }}
                                  title="수정"
                                >
                                  <Pencil style={{ width: 14, height: 14 }} />
                                </button>
                                {t.is_active ? (
                                  <button
                                    onClick={() => handleDeleteTag(t.id)}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 4 }}
                                    title="비활성화"
                                  >
                                    <Trash2 style={{ width: 14, height: 14 }} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleToggleTag(t.id, true)}
                                    style={{ padding: "2px 8px", borderRadius: 4, backgroundColor: "#22C55E", color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                                  >
                                    활성화
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 토글 스위치 컴포넌트 ──
function ToggleSwitch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 52, height: 28, borderRadius: 14,
        backgroundColor: on ? "var(--app-accent)" : "var(--app-text-placeholder)",
        border: "none", cursor: disabled ? "default" : "pointer",
        position: "relative", flexShrink: 0,
        transition: "background-color 0.2s",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 26 : 2,
        width: 24, height: 24, borderRadius: "50%",
        backgroundColor: "white",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        transition: "left 0.2s",
      }} />
    </button>
  );
}

// ── 템플릿 편집 필드 ──
function TemplateField({
  label, description, value, onChange, onReset, rows = 6, last = false,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  rows?: number;
  last?: boolean;
}) {
  return (
    <div style={{ marginBottom: last ? 0 : 20, paddingBottom: last ? 0 : 20, borderBottom: last ? "none" : "1px solid var(--app-border-light)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: "var(--app-text-primary)" }}>{label}</label>
        <button
          onClick={onReset}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 8px", borderRadius: 6,
            backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-tertiary)",
            border: "none", fontSize: 11, cursor: "pointer",
          }}
        >
          <RotateCcw style={{ width: 10, height: 10 }} /> 기본값
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginBottom: 8, lineHeight: 1.4 }}>
        {description}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        style={{
          width: "100%", padding: "10px 12px", fontSize: 13,
          border: "1px solid var(--app-border)", borderRadius: 8,
          outline: "none", resize: "vertical", lineHeight: 1.6,
          fontFamily: "inherit", boxSizing: "border-box",
        }}
      />
    </div>
  );
}
