# -*- coding: utf-8 -*-
"""
답글 '기준' 설정 창 (별도 명령 창).
- API 키 / 모델 (config.json)
- 답글 톤·지침 (AI 답글에 반영)
- 유형별 기본 답글(템플릿) 편집 (키 없는 무료 모드에 반영)
단독 실행: python settings_gui.py  /  메인 GUI의 [답글 기준 설정] 버튼에서도 열림.
"""
import sys, os
_usersite = os.path.join(os.environ.get("APPDATA", ""), "Python", "Python312", "site-packages")
if os.path.isdir(_usersite) and _usersite not in sys.path:
    sys.path.insert(0, _usersite)
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import tkinter as tk
from tkinter import ttk, messagebox
import settings_store
import template_engine

MODELS = ["claude-opus-4-8 (최고 품질)", "claude-haiku-4-5 (저렴/빠름)", "claude-sonnet-4-6 (중간)"]
MODEL_IDS = {"claude-opus-4-8 (최고 품질)": "claude-opus-4-8",
             "claude-haiku-4-5 (저렴/빠름)": "claude-haiku-4-5",
             "claude-sonnet-4-6 (중간)": "claude-sonnet-4-6"}
ID_TO_LABEL = {v: k for k, v in MODEL_IDS.items()}


def open_settings(parent=None):
    win = tk.Toplevel(parent) if parent else tk.Tk()
    win.title("답글 기준 설정")
    win.geometry("680x720")
    if parent:
        win.grab_set()

    s = settings_store.load()
    key, model = settings_store.get_api()
    defaults = template_engine.default_templates()
    overrides = s.get("templates", {})

    # ── AI 설정 ──────────────────────────────
    f1 = tk.LabelFrame(win, text=" AI 답글 설정 ", padx=10, pady=8)
    f1.pack(fill="x", padx=12, pady=(12, 6))
    tk.Label(f1, text="Anthropic API 키 (비우면 무료 템플릿으로 동작)").grid(row=0, column=0, sticky="w")
    key_var = tk.StringVar(value=key)
    key_ent = tk.Entry(f1, textvariable=key_var, show="•", width=58)
    key_ent.grid(row=1, column=0, sticky="we", pady=2)
    show_var = tk.IntVar(value=0)
    tk.Checkbutton(f1, text="표시", variable=show_var,
                   command=lambda: key_ent.config(show="" if show_var.get() else "•")).grid(row=1, column=1, padx=6)
    tk.Label(f1, text="모델").grid(row=2, column=0, sticky="w", pady=(6, 0))
    model_var = tk.StringVar(value=ID_TO_LABEL.get(model, MODELS[0]))
    ttk.Combobox(f1, textvariable=model_var, values=MODELS, state="readonly", width=30).grid(row=3, column=0, sticky="w")
    f1.columnconfigure(0, weight=1)

    # ── 답글 톤·지침 ─────────────────────────
    f2 = tk.LabelFrame(win, text=" 답글 톤 · 지침 (AI 모드에 반영) ", padx=10, pady=8)
    f2.pack(fill="x", padx=12, pady=6)
    tk.Label(f2, text="예: ‘반말 금지, 항상 존댓말. 이모지는 1개만. 환불·법적 문의는 채널톡으로 안내.’",
             fg="#777").pack(anchor="w")
    tone = tk.Text(f2, height=4, wrap="word")
    tone.insert("1.0", s.get("tone_guide", ""))
    tone.pack(fill="x", pady=4)

    # ── 유형별 기본 답글 ─────────────────────
    f3 = tk.LabelFrame(win, text=" 유형별 기본 답글 (무료 템플릿 모드에 반영) ", padx=6, pady=6)
    f3.pack(fill="both", expand=True, padx=12, pady=6)
    canvas = tk.Canvas(f3, highlightthickness=0)
    sb = ttk.Scrollbar(f3, orient="vertical", command=canvas.yview)
    inner = tk.Frame(canvas)
    inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.create_window((0, 0), window=inner, anchor="nw")
    canvas.configure(yscrollcommand=sb.set)
    canvas.pack(side="left", fill="both", expand=True)
    sb.pack(side="right", fill="y")

    boxes = {}
    for i, (label, dft) in enumerate(defaults.items()):
        tk.Label(inner, text=label, font=("맑은 고딕", 9, "bold"), fg="#2D6CDF").grid(row=i, column=0, sticky="nw", padx=4, pady=4)
        t = tk.Text(inner, height=2, width=66, wrap="word")
        t.insert("1.0", overrides.get(label, dft))
        t.grid(row=i, column=1, sticky="we", padx=4, pady=4)
        boxes[label] = (t, dft)

    def do_save():
        # API
        settings_store.set_api(key_var.get().strip(), MODEL_IDS.get(model_var.get(), "claude-opus-4-8"))
        # 톤 + 템플릿(기본과 다른 것만 override 저장)
        new_templates = {}
        for label, (t, dft) in boxes.items():
            val = t.get("1.0", "end").strip()
            if val and val != dft.strip():
                new_templates[label] = val
        settings_store.save({"tone_guide": tone.get("1.0", "end").strip(), "templates": new_templates})
        messagebox.showinfo("저장됨", f"답글 기준이 저장되었습니다.\n(변경 템플릿 {len(new_templates)}개)")
        win.destroy()

    bar = tk.Frame(win); bar.pack(fill="x", pady=10)
    tk.Button(bar, text="저장", command=do_save, bg="#2D6CDF", fg="white", relief="flat",
              padx=24, pady=7, font=("맑은 고딕", 10, "bold")).pack(side="right", padx=12)
    tk.Button(bar, text="닫기", command=win.destroy, relief="flat", padx=16, pady=7).pack(side="right")

    if not parent:
        win.mainloop()


def main():
    try:
        ttk.Style().theme_use("clam")
    except Exception:
        pass
    open_settings(None)


if __name__ == "__main__":
    main()
