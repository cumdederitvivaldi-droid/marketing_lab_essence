"""Build v26 (그로스 마케터) deck — 17 슬라이드.

v26은 그로스 마케터 톤이지만, Web2App 본문은 v27의 실측 수치를 사용하고
iOS ODM 슬라이드(p_ios_odm)도 추가됨 (T-ROAS 10번 다음 = 11번 자리).

순서:
  01 Cover · 02 Profile · 03 Capability
  04 p4 (M1 등급제) · 05 p5 (ARPU 8kg) · 06 p6 (D45 CVR)
  07 p9 (페이백 RCT)
  08 p7 (영상 콘텐츠)
  09 p10 (Web2App, v27 실측)
  10 p11 (T-ROAS)
  11 p_ios_odm (NEW)
  12 p12 (단순 협업) · 13 p13 (PA)
  14 p14 (Claude CLI) · 15 p15 (팀) · 16 p16 (이전 경력) · 17 p17 (OUTRO)

Outputs (모두 동일 내용):
- 이도형_포트폴리오_v26.html
- portfolio.html
- 이도형_그로스마케터_포트폴리오.html
"""
from __future__ import annotations

import re
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "이도형_포트폴리오_v26.html"

html = SRC.read_text(encoding="utf-8")

# --------------------------------------------------------------------------
# 1) Split slides by id (top-level <div class="slide..." id="pN">)
# --------------------------------------------------------------------------
slide_pat = re.compile(r'^<div class="slide[^"]*" id="(p\w+)">', re.MULTILINE)

slide_blocks: dict[str, str] = {}
slide_starts = [(m.start(), m.group(1)) for m in slide_pat.finditer(html)]


def find_block_end(text: str, start: int) -> int:
    depth = 0
    i = start
    while i < len(text):
        if text.startswith("<div", i):
            depth += 1
            i += 4
        elif text.startswith("</div>", i):
            depth -= 1
            i += 6
            if depth == 0:
                return i
        else:
            i += 1
    raise RuntimeError(f"Unbalanced <div> from offset {start}")


slide_ranges: list[tuple[str, int, int]] = []
for start, sid in slide_starts:
    end = find_block_end(html, start)
    slide_ranges.append((sid, start, end))
    slide_blocks[sid] = html[start:end]

if not slide_ranges:
    raise RuntimeError("No slides found")

preamble = html[: slide_ranges[0][1]]
tail = html[slide_ranges[-1][2]:]

# --------------------------------------------------------------------------
# 2) NEW_ORDER for v26 — 17 슬라이드, p_ios_odm position 11 (T-ROAS 다음)
# --------------------------------------------------------------------------
NEW_ORDER = [
    ("p1",         1),   # Cover
    ("p2",         2),   # Profile
    ("p3",         3),   # Capability
    ("p4",         4),   # M1 등급제           (growth 01/03)
    ("p5",         5),   # ARPU 8kg            (growth 02/03)
    ("p6",         6),   # D45 CVR             (growth 03/03)
    ("p9",         7),   # 페이백 RCT          (CRM 02/02 — v26 source 그대로)
    ("p7",         8),   # 영상 콘텐츠         (content 01/01)
    ("p10",        9),   # Web2App (v27 실측)  (perf 01/03)
    ("p11",       10),   # T-ROAS              (perf 02/03)
    ("p_ios_odm", 11),   # NEW: iOS ODM        (perf 03/03)
    ("p12",       12),   # 단순 협업           (viral 01/02)
    ("p13",       13),   # PA 그로스 사이클    (viral 02/02)
    ("p14",       14),   # Claude CLI
    ("p15",       15),   # 팀 리딩
    ("p16",       16),   # 이전 경력
    ("p17",       17),   # OUTRO
]
assert len(NEW_ORDER) == 17

# --------------------------------------------------------------------------
# 3) Web2App (p10) 본문 — v27의 WEB2APP_SLIDE 가져와 v26 카운터로 변환
# --------------------------------------------------------------------------
v27_src = (HERE / "_build_v27.py").read_text(encoding="utf-8")

m = re.search(r"WEB2APP_SLIDE = '''(.*?)'''", v27_src, re.DOTALL)
if not m:
    raise SystemExit("WEB2APP_SLIDE not found in _build_v27.py")
web2app = m.group(1)
# v26 퍼포먼스 카운터 (Web2App, T-ROAS, iOS ODM = 3개) — 01/03
web2app = web2app.replace(
    "<b>01 / 04</b> · Web2App", "<b>01 / 03</b> · Web2App"
)
slide_blocks["p10"] = web2app

# --------------------------------------------------------------------------
# 4) iOS ODM (p_ios_odm) 본문 — v27 IOS_ODM_SLIDE 가져와 v26용으로 변환
# --------------------------------------------------------------------------
m = re.search(r"IOS_ODM_SLIDE = '''(.*?)'''", v27_src, re.DOTALL)
if not m:
    raise SystemExit("IOS_ODM_SLIDE not found in _build_v27.py")
ios_odm = m.group(1)
# v26 퍼포먼스 3개 중 세 번째 — 03/03
ios_odm = ios_odm.replace(
    "<b>03 / 04</b> · iOS ODM", "<b>03 / 03</b> · iOS ODM"
)
slide_blocks["p_ios_odm"] = ios_odm

# --------------------------------------------------------------------------
# 5) Per-slide rewrite: slide-num + chrome page → "NN / 17"
# --------------------------------------------------------------------------
TOTAL = len(NEW_ORDER)


def page2(n: int) -> str:
    return f"{n:02d}"


TOTAL_STR = page2(TOTAL)

# v26 퍼포먼스 T-ROAS: 02/02 → 02/03 (iOS ODM 추가로 카테고리 슬라이드 수 증가)
SUBCOUNTER_REWRITES: dict[str, tuple[str, str]] = {
    "p11": ("<b>02 / 02</b> · T-ROAS", "<b>02 / 03</b> · T-ROAS"),
}

for sid, new_pos in NEW_ORDER:
    block = slide_blocks[sid]
    # (a) slide-num: NN / MM → new_pos / TOTAL
    block = re.sub(
        r'(<span class="slide-num">)\d{2} / \d{2}(</span>)',
        rf"\g<1>{page2(new_pos)} / {TOTAL_STR}\g<2>",
        block,
    )
    # (b) chrome page: <b>NN</b> / MM → <b>new_pos</b> / TOTAL
    block = re.sub(
        r"(<b>)\d{2}(</b> / )\d{2}(</span>)",
        rf"\g<1>{page2(new_pos)}\g<2>{TOTAL_STR}\g<3>",
        block,
    )
    # (c) sub-counter
    if sid in SUBCOUNTER_REWRITES:
        old, new = SUBCOUNTER_REWRITES[sid]
        if old in block:
            block = block.replace(old, new, 1)
    slide_blocks[sid] = block

# --------------------------------------------------------------------------
# 6) Title — '그로스 마케터' 명시 (멱등)
# --------------------------------------------------------------------------
preamble = re.sub(
    r"<title>이도형 포트폴리오 v26 — Cobalt Edge · 병목·실행·결과</title>",
    "<title>이도형 그로스 마케터 포트폴리오 v26 — Cobalt Edge</title>",
    preamble,
    count=1,
)

# --------------------------------------------------------------------------
# 7) Reassemble + write outputs
# --------------------------------------------------------------------------
ordered = [slide_blocks[sid] for sid, _ in NEW_ORDER]
out = preamble + "\n\n".join(ordered) + tail

# NOTE: v26.html은 build SRC(canonical) 이므로 patch 결과로 덮어쓰지 않는다.
# _build_v27.py / _build_v28.py가 동일 source를 SUBCOUNTER 패턴매칭으로 사용하므로
# v26.html source를 17 슬라이드 reorder로 변환하면 다른 빌드가 깨진다.
# 사용자에게 노출되는 v26 결과물은 portfolio.html과 그로스 alias로 충분.
OUTPUTS = [
    "portfolio.html",
    "이도형_그로스마케터_포트폴리오.html",
]
for fn in OUTPUTS:
    p = HERE / fn
    p.write_text(out, encoding="utf-8")
    print(f"wrote {p}: {len(out):,} chars, {out.count(chr(10)):,} lines")
