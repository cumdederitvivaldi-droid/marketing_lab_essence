# -*- coding: utf-8 -*-
"""
커버링 댓글 자동답글 — 데스크톱 GUI (Tkinter, 추가설치 불필요)

흐름(버튼 클릭만):
  [전용 크롬 열기] → 로그인(최초 1회)
  [① 댓글 수집 + 초안]  → Meta/TikTok 댓글 수집 + 답글 초안 자동 생성, 표에 표시
  표에서 초안 확인/수정(더블클릭), 게시할 행 체크
  [② 게시 (답글+하트)] → 체크된 행에 답글 + 하트 게시

기존 스크립트(scrape_comments/read_rules/generate_drafts/post_replies)를 그대로 호출한다.
"""
import sys, os, json, subprocess, threading, queue
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
OUT = ROOT / "out"
PY = sys.executable

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext

ACCENT = "#2D6CDF"


class App:
    def __init__(self, root):
        self.root = root
        self.q = queue.Queue()
        self.rows = {}            # item_id -> dict(comment_id, platform, author, comment, draft, need, checked)
        self.busy = False
        root.title("커버링 댓글 자동답글")
        root.geometry("1100x680")

        # 상단 버튼 바
        bar = tk.Frame(root, bg="white", pady=8)
        bar.pack(fill="x")
        self.btn_chrome = tk.Button(bar, text="전용 크롬 열기 / 로그인", command=self.open_chrome,
                                    bg="#EEF2FB", relief="flat", padx=10, pady=6)
        self.btn_chrome.pack(side="left", padx=(12, 6))
        self.btn_collect = tk.Button(bar, text="①  댓글 수집 + 초안 생성", command=self.collect,
                                     bg=ACCENT, fg="white", relief="flat", padx=14, pady=6,
                                     font=("맑은 고딕", 10, "bold"))
        self.btn_collect.pack(side="left", padx=6)
        self.btn_post = tk.Button(bar, text="②  게시 (답글 + 하트)", command=self.post,
                                  bg="#1CA45C", fg="white", relief="flat", padx=14, pady=6,
                                  font=("맑은 고딕", 10, "bold"))
        self.btn_post.pack(side="left", padx=6)
        tk.Button(bar, text="전체 선택", command=lambda: self.check_all(True),
                  relief="flat", padx=8, pady=6).pack(side="left", padx=(18, 2))
        tk.Button(bar, text="전체 해제", command=lambda: self.check_all(False),
                  relief="flat", padx=8, pady=6).pack(side="left", padx=2)
        tk.Button(bar, text="⚙ 답글 기준 설정", command=self.open_settings,
                  relief="flat", padx=10, pady=6).pack(side="left", padx=(14, 2))
        self.count_lbl = tk.Label(bar, text="", bg="white", fg="#555")
        self.count_lbl.pack(side="right", padx=12)

        # 안내
        tk.Label(root, text="게시 칸을 클릭해 체크/해제, 행을 더블클릭하면 답글을 수정할 수 있어요. "
                            "노랑(확인필요)은 직접 확인 후 체크하세요.",
                 bg="#FFF7E6", fg="#7A5B00", anchor="w", padx=12, pady=4).pack(fill="x")

        # 표
        cols = ("post", "platform", "author", "comment", "draft", "need")
        self.tree = ttk.Treeview(root, columns=cols, show="headings", selectmode="browse")
        for c, t, w in [("post", "게시", 50), ("platform", "채널", 70), ("author", "작성자", 120),
                        ("comment", "댓글", 320), ("draft", "답글 초안", 400), ("need", "확인필요", 70)]:
            self.tree.heading(c, text=t)
            self.tree.column(c, width=w, anchor=("center" if c in ("post", "platform", "need") else "w"))
        self.tree.tag_configure("need", background="#FFF2CC")
        self.tree.pack(fill="both", expand=True, padx=12, pady=8)
        vsb = ttk.Scrollbar(self.tree, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set); vsb.pack(side="right", fill="y")
        self.tree.bind("<Button-1>", self.on_click)
        self.tree.bind("<Double-1>", self.on_edit)

        # 로그
        self.log = scrolledtext.ScrolledText(root, height=8, bg="#1E1E1E", fg="#DDD",
                                             font=("Consolas", 9))
        self.log.pack(fill="x", padx=12, pady=(0, 10))
        self._log("준비됨. ‘전용 크롬 열기’ 후 로그인하고, ‘① 댓글 수집 + 초안 생성’을 누르세요.")
        self.root.after(120, self._drain)

    # ---------- 유틸 ----------
    def _log(self, msg):
        self.log.insert("end", msg.rstrip() + "\n"); self.log.see("end")

    def _drain(self):
        try:
            while True:
                kind, payload = self.q.get_nowait()
                if kind == "log":
                    self._log(payload)
                elif kind == "done":
                    self._on_done(*payload)
        except queue.Empty:
            pass
        self.root.after(120, self._drain)

    def _run(self, args, on_finish):
        """스크립트를 백그라운드로 실행, 출력은 로그로, 끝나면 on_finish(code)."""
        if self.busy:
            messagebox.showinfo("진행 중", "이미 작업이 진행 중입니다. 잠시만요.")
            return
        self.busy = True
        self._set_buttons(False)

        def worker():
            code = 0
            try:
                p = subprocess.Popen([PY] + args, cwd=str(ROOT),
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                     text=True, encoding="utf-8", errors="replace")
                for line in p.stdout:
                    self.q.put(("log", line))
                code = p.wait()
            except Exception as e:
                self.q.put(("log", f"[오류] {e}")); code = 1
            self.q.put(("done", (on_finish, code)))
        threading.Thread(target=worker, daemon=True).start()

    def _on_done(self, on_finish, code):
        self.busy = False
        self._set_buttons(True)
        if on_finish:
            on_finish(code)

    def _set_buttons(self, enabled):
        st = "normal" if enabled else "disabled"
        for b in (self.btn_chrome, self.btn_collect, self.btn_post):
            b.config(state=st)

    # ---------- 동작 ----------
    def open_settings(self):
        try:
            import settings_gui
            settings_gui.open_settings(self.root)
        except Exception as e:
            messagebox.showerror("오류", f"설정 창 오류: {e}")

    def open_chrome(self):
        self._log("전용 크롬을 엽니다... 뜨는 창에서 Meta/TikTok/Google 로그인(최초 1회).")
        try:
            subprocess.Popen([PY, str(SCRIPTS / "launch_chrome.py")], cwd=str(ROOT))
        except Exception as e:
            messagebox.showerror("오류", str(e))

    def collect(self):
        self._log("\n=== ① 댓글 수집 + 초안 생성 시작 ===")

        def step_scrape(_):
            self._run([str(SCRIPTS / "read_rules.py")], step_rules)
        def step_rules(_):
            self._run([str(SCRIPTS / "generate_drafts.py")], step_load)
        def step_load(_):
            self.load_drafts()
            self._log("=== 초안 준비 완료. 검토 후 ②게시 ===")
        self._run([str(SCRIPTS / "scrape_comments.py")], step_scrape)

    def load_drafts(self):
        self.tree.delete(*self.tree.get_children())
        self.rows.clear()
        f = OUT / "drafts.json"
        if not f.exists():
            self._log("초안 파일이 없습니다."); return
        drafts = json.loads(f.read_text(encoding="utf-8"))
        for d in drafts:
            checked = bool(d["draft_reply"]) and not d["needs_human"]
            iid = self.tree.insert("", "end", values=(
                "✅" if checked else "⬜", d["platform"], d["author"],
                d["comment_text"][:120], d["draft_reply"], "예" if d["needs_human"] else ""),
                tags=(("need",) if d["needs_human"] else ()))
            self.rows[iid] = {**d, "checked": checked}
        self._update_count()
        self._log(f"초안 {len(drafts)}건 표시. (자동 체크 {sum(r['checked'] for r in self.rows.values())}건)")

    def on_click(self, ev):
        if self.tree.identify("region", ev.x, ev.y) != "cell":
            return
        if self.tree.identify_column(ev.x) != "#1":   # 게시 칸만
            return
        iid = self.tree.identify_row(ev.y)
        if iid in self.rows:
            self.toggle(iid)

    def toggle(self, iid):
        r = self.rows[iid]
        if not r["draft_reply"].strip():
            messagebox.showinfo("빈 답글", "답글 초안이 비어 있어요. 더블클릭해서 내용을 입력하세요."); return
        r["checked"] = not r["checked"]
        self.tree.set(iid, "post", "✅" if r["checked"] else "⬜")
        self._update_count()

    def check_all(self, val):
        for iid, r in self.rows.items():
            if val and not r["draft_reply"].strip():
                continue
            r["checked"] = val
            self.tree.set(iid, "post", "✅" if val else "⬜")
        self._update_count()

    def on_edit(self, ev):
        iid = self.tree.identify_row(ev.y)
        if iid not in self.rows:
            return
        r = self.rows[iid]
        win = tk.Toplevel(self.root); win.title("답글 수정"); win.geometry("560x360"); win.grab_set()
        tk.Label(win, text=f"[{r['platform']}] {r['author']}", font=("맑은 고딕", 10, "bold")).pack(anchor="w", padx=12, pady=(12, 2))
        tk.Label(win, text="댓글:", fg="#555").pack(anchor="w", padx=12)
        cbox = tk.Text(win, height=4, wrap="word"); cbox.insert("1.0", r["comment_text"]); cbox.config(state="disabled")
        cbox.pack(fill="x", padx=12, pady=4)
        tk.Label(win, text="답글 초안 (수정 가능):", fg="#555").pack(anchor="w", padx=12)
        dbox = tk.Text(win, height=6, wrap="word"); dbox.insert("1.0", r["draft_reply"]); dbox.pack(fill="both", expand=True, padx=12, pady=4)

        def save():
            r["draft_reply"] = dbox.get("1.0", "end").strip()
            self.tree.set(iid, "draft", r["draft_reply"])
            if r["draft_reply"] and not r["checked"]:
                r["checked"] = True; self.tree.set(iid, "post", "✅")
            self._update_count(); win.destroy()
        tk.Button(win, text="저장", command=save, bg=ACCENT, fg="white", relief="flat",
                  padx=16, pady=6).pack(pady=8)

    def _update_count(self):
        n = sum(1 for r in self.rows.values() if r["checked"] and r["draft_reply"].strip())
        self.count_lbl.config(text=f"게시 예정: {n}건 / 전체 {len(self.rows)}건")

    def post(self):
        targets = [r for r in self.rows.values() if r["checked"] and r["draft_reply"].strip()]
        if not targets:
            messagebox.showinfo("게시할 항목 없음", "게시할 행을 체크하세요."); return
        if not messagebox.askyesno("게시 확인",
                                   f"{len(targets)}건에 답글 + 하트를 실제로 게시합니다.\n진행할까요?"):
            return
        approved = [{"platform": r["platform"], "comment_id": r["comment_id"], "author": r["author"],
                     "comment_text": r["comment_text"], "post_index": r.get("post_index", 0),
                     "permalink": r.get("permalink", ""), "draft_reply": r["draft_reply"],
                     "needs_human": False} for r in targets]
        (OUT / "drafts_approved.json").write_text(json.dumps(approved, ensure_ascii=False, indent=2),
                                                  encoding="utf-8")
        self._log(f"\n=== ② 게시 시작 ({len(approved)}건) ===")
        self._run([str(SCRIPTS / "post_replies.py"), "--commit", "--limit", "100"], self._post_done)

    def _post_done(self, code):
        self._log("=== 게시 작업 종료 ===")
        try:
            done = set(json.loads((ROOT / "state" / "replied.json").read_text(encoding="utf-8")))
        except Exception:
            done = set()
        for iid, r in self.rows.items():
            if r["comment_id"] in done:
                self.tree.set(iid, "post", "게시완료"); r["checked"] = False
        self._update_count()
        messagebox.showinfo("완료", "게시가 끝났습니다. ‘게시완료’로 표시된 항목은 다시 게시되지 않아요.")


def main():
    root = tk.Tk()
    try:
        ttk.Style().theme_use("clam")
    except Exception:
        pass
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
