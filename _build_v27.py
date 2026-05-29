"""Build v27 — Performance Marketer edition — from v26.

Approach
========
1. Read v26 as text.
2. Split into preamble + ordered list of slides + tail.
3. Reorder slides in the performance-marketer-first sequence.
4. Apply targeted text substitutions:
   - <title>
   - p1 hero (ribbon, h1, sub-ribbon, subtitle)
   - p2 profile (h2, lead paragraph, stack reorder)
   - p3 capability overview (eyebrow, page-title, card order, perf card desc)
   - each slide's slide-num pill + bottom chrome page number
   - sub-counters inside cat-meta where order within a category changed
     (CVR/ARPU/M1 within 그로스, 페이백 RCT within CRM)

v26 file remains untouched.
"""
from __future__ import annotations

import re
from pathlib import Path

SRC = Path(__file__).parent / "이도형_포트폴리오_v26.html"
DST = Path(__file__).parent / "이도형_포트폴리오_v27.html"

html = SRC.read_text(encoding="utf-8")

# --------------------------------------------------------------------------
# 1. Split preamble / slides / tail
# --------------------------------------------------------------------------
# Slides are top-level <div class="slide ..."> ... </div> blocks. We find them
# by their `id="pN"` and consume balanced div ranges.
slide_pat = re.compile(r'^<div class="slide[^"]*" id="(p\d+)">', re.MULTILINE)

slide_blocks: dict[str, str] = {}
slide_starts: list[tuple[int, str]] = []  # (start_offset, id)
for m in slide_pat.finditer(html):
    slide_starts.append((m.start(), m.group(1)))

# Compute slide end positions by scanning forward until matching closing </div>
def find_block_end(text: str, start: int) -> int:
    """Return the offset right after the matching </div> for the <div> at start."""
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
    raise RuntimeError("Unbalanced <div> from offset %d" % start)

slide_ranges: list[tuple[str, int, int]] = []
for start, sid in slide_starts:
    end = find_block_end(html, start)
    slide_ranges.append((sid, start, end))

first_start = slide_ranges[0][1]
last_end = slide_ranges[-1][2]
preamble = html[:first_start]
tail = html[last_end:]

# Extract each slide block text (incl. any trailing comment line is OK; we keep
# the comments as part of preceding slide's tail by not consuming them).
for sid, s, e in slide_ranges:
    slide_blocks[sid] = html[s:e]

EXPECTED_V26_IDS = {f"p{i}" for i in range(1, 18)} - {"p8"}
assert set(slide_blocks) == EXPECTED_V26_IDS, (
    f"unexpected slide ids: {sorted(slide_blocks)}"
)

# --------------------------------------------------------------------------
# 2. New order — performance marketer first
# --------------------------------------------------------------------------
NEW_ORDER = [
    ("p1",       1),   # Cover
    ("p2",       2),   # Profile
    ("p3",       3),   # Performance Capability
    ("p10",      4),   # Web2App Bridge        (perf 01/03)
    ("p11",      5),   # T-ROAS                (perf 02/03)
    ("ptiktok",  6),   # NEW: TikTok 매체 확장 (perf 03/03)
    ("p13",      7),   # PA 그로스 사이클      (viral 01/01)
    ("p7",       8),   # 영상 콘텐츠           (content 01/01)
    ("p6",       9),   # CVR +231%             (growth 01/03)
    ("p990",    10),   # NEW: 990원 진입 이벤트 (growth 02/03)
    ("p4",      11),   # M1 리텐션 +41%p        (growth 03/03)
    ("p9",      12),   # 페이백 RCT             (CRM 01/01)
    ("p14",     13),   # Claude CLI
    ("p15",     14),   # 팀 리딩
    ("p16",     15),   # 이전 경력
    ("p17",     16),   # OUTRO
]
assert len(NEW_ORDER) == 16

# Slide IDs in NEW_ORDER that are NOT present in v26 (we synthesize them below
# and inject into slide_blocks before per-slide substitution).
EXTRA_SLIDE_IDS = {"ptiktok", "p990"}

# --------------------------------------------------------------------------
# 3. Per-slide text substitutions (slide-num + chrome page number + sub-counters)
# --------------------------------------------------------------------------
def sub_once(text: str, pattern: str, repl: str, flags: int = 0) -> str:
    new, n = re.subn(pattern, repl, text, count=1, flags=flags)
    if n != 1:
        raise RuntimeError(
            f"expected exactly 1 substitution, got {n} for pattern={pattern!r}"
        )
    return new

# 16 slides — pad page number to 2 digits.
def page2(n: int) -> str:
    return f"{n:02d}"

# v26 sub-counter values per id (cat-meta `<b>NN / MM</b>` strings) and the
# replacement we want for v27.
SUBCOUNTER_REWRITES: dict[str, tuple[str, str]] = {
    # 퍼포먼스 카테고리에 TikTok 슬라이드를 추가했으므로 01/02 → 01/03, 02/02 → 02/03
    "p10": ("<b>01 / 02</b> · Web2App", "<b>01 / 03</b> · Web2App"),
    "p11": ("<b>02 / 02</b> · T-ROAS", "<b>02 / 03</b> · T-ROAS"),
    # 단순 협업 제거 → PA가 단독 바이럴 슬라이드. 02/02 → 01/01
    "p13": (
        "<b>02 / 02</b> · PA 그로스 사이클",
        "<b>01 / 01</b> · PA 그로스 사이클",
    ),
    # CVR was 03/03 → make 01/03 (first growth slide in new order)
    "p6": ("<b>03 / 03</b> · CVR", "<b>01 / 03</b> · CVR"),
    # M1 retention was 01/03 → make 03/03 (last growth slide)
    "p4": ("<b>01 / 03</b> · Retention", "<b>03 / 03</b> · Retention"),
    # 페이백 RCT was 02/02 · CRM → make 01/01 (solo CRM in v27)
    "p9": (
        "<b>02 / 02</b> · 식목일 페이백 RCT",
        "<b>01 / 01</b> · 식목일 페이백 RCT",
    ),
}

# --------------------------------------------------------------------------
# 3.5 Synthesize the new TikTok slide (replaces 단순 협업 case)
# --------------------------------------------------------------------------
TIKTOK_SLIDE = '''<div class="slide" id="ptiktok">
  <div class="grid-bg light"></div>
  <div class="hd-tight">
    <div>
      <div class="cat-row">
        <span class="cat-chip" style="background:var(--ca-perf);"><span class="ko">퍼포먼스</span><span class="en">Performance</span></span>
        <span class="cat-meta"><b>03 / 03</b> · TikTok 매체 확장</span>
      </div>
      <div class="page-title">"3개월 챌린지"로 도입한 TikTok — <em>일 예산 ×12 · CPA -9.4%</em></div>
    </div>
    <span class="slide-num">06 / 16</span>
  </div>

  <div class="body2">
    <div class="col-l">
      <div class="tag-row">
        <span class="c-badge" style="background:var(--ca-perf);">Performance · TikTok</span>
        <span class="c-badge outline">커버링 · 2025.11.25~ · 116일 매칭 실측</span>
      </div>
      <div class="p-title">"3개월 안에 성과 못 내면 포기하겠습니다" —<br><em>매체 의존 리스크와 통념</em>을 한 번에 풀다</div>

      <div class="phase b1"><span class="ptag">병목</span>메타·구글 두 매체 의존 + "TikTok은 안 된다" 통념</div>
      <div class="sec tight"><ul>
        <li>두 매체 의존 — 계정 블락 시 <em>전면 중단 리스크</em> · 두 매체가 못 닿는 유저층은 그대로 남음</li>
        <li>업계 통념 + 초반 시도 저조로 도입 자체가 어려움 → <strong>"3개월 챌린지"</strong> 약속으로 검증 기간 확보</li>
      </ul></div>

      <div class="phase b2"><span class="ptag">실행</span>최적화 이벤트 순서 뒤집기 + PA 입혀 + 핏 소재 탐색</div>
      <div class="sec tight"><ul>
        <li>구매 최적화 직진을 멈추고 <strong>앱 설치 → 회원가입 → 구매</strong> 단계 학습으로 머신러닝 신호 안정 누적</li>
        <li><strong>PA(인플루언서 라이센스) 도입 · 25.11.25</strong> — 단일 캠페인 첫 큰 폭 증액(10만→28만), 화이트리스트·SPC 지원으로 안정 운영 구간 진입</li>
        <li>음식물·엄마·복합·대형봉투 등 <strong>"TikTok 핏 소재"</strong>를 팀과 함께 베리에이션 누적</li>
      </ul></div>

      <div class="phase b3"><span class="ptag">결과</span>일 예산 ×12 · 구매 +264% · CPA <b>-9.4%</b></div>
      <div class="sec tight"><ul>
        <li>광고비 <strong>+229%</strong> 증액에도 CPA는 <strong>-9.4%</strong>(₩24,586 → ₩22,284)로 개선 · 구매 <strong>+264%</strong>(1,125 → 4,090건)</li>
        <li>일 예산 <strong>10만 → 120만원 (12배)</strong> · 메타·구글·TikTok 3매체 믹스로 블락 리스크 분산 + 매체 간 리타겟 시너지 확보</li>
      </ul></div>

      <div class="result">
        <div class="kpi"><span class="kpi-num">×12</span><span class="kpi-label">일 예산 (10만 → 120만)</span></div>
        <div class="kpi"><span class="kpi-num">+264%</span><span class="kpi-label">구매 (1,125 → 4,090건)</span></div>
        <div class="kpi"><span class="kpi-num">-9.4%</span><span class="kpi-label">CPA · 광고비 +229% 증액 와중</span></div>
      </div>
    </div>

    <div class="col-r">
      <!-- Before / After 표 (PA 도입 116일 매칭) -->
      <div class="chart-card" style="flex:none;display:flex;flex-direction:column;padding:14px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="chart-title" style="margin-bottom:0;">TikTok 채널 Before / After — PA 도입 2025.11.25 기준</div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--sub);letter-spacing:.08em;">Airbridge 실측 · 116일 매칭</span>
        </div>
        <table style="width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;">
          <thead><tr>
            <th style="text-align:left;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;border-radius:6px 0 0 0;">구분</th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;">일평균 광고비</th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;">구매</th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;border-radius:0 6px 0 0;">CPA</th>
          </tr></thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--line-lt);">
              <td style="padding:10px 10px;font-size:12px;color:var(--text);">Before <span style="color:var(--sub);font-size:10px;">25.08.01~11.24</span></td>
              <td style="text-align:right;padding:10px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">₩238,442</td>
              <td style="text-align:right;padding:10px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">1,125건</td>
              <td style="text-align:right;padding:10px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">₩24,586</td>
            </tr>
            <tr style="background:#F4FBF7;border-bottom:1px solid var(--line-lt);">
              <td style="padding:10px 10px;font-size:12px;font-weight:800;color:var(--text);">After <span style="color:var(--sub);font-size:10px;font-weight:500;">26.01.29~05.24</span></td>
              <td style="text-align:right;padding:10px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">₩785,706</td>
              <td style="text-align:right;padding:10px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">4,090건</td>
              <td style="text-align:right;padding:10px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">₩22,284</td>
            </tr>
            <tr>
              <td style="padding:10px 10px;font-size:12px;font-weight:800;color:var(--text);">개선 <span style="color:var(--sub);font-size:10px;font-weight:500;">(After − Before)</span></td>
              <td style="text-align:right;padding:8px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">+229%</span></td>
              <td style="text-align:right;padding:8px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">+264%</span></td>
              <td style="text-align:right;padding:8px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">-9.4%</span></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:12px;padding:12px 14px;background:var(--ink);border-radius:8px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--lime);"></div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--lavender);font-weight:600;letter-spacing:.08em;">핵심 인사이트</div>
          <div style="font-family:var(--font-display);font-size:15px;color:#fff;font-weight:800;letter-spacing:-.018em;margin-top:3px;line-height:1.4;">광고비 3.3배에 구매 <span style="color:var(--lime);">4배</span> — CPA는 <span style="color:var(--lime);">오히려 감소</span>. 모수 순서 + PA 입혀 + 핏 소재 결합의 효과.</div>
        </div>
      </div>

      <!-- 일 예산 진화 라인 차트 -->
      <div class="chart-card" style="flex:1;min-height:0;display:flex;flex-direction:column;padding:14px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div class="chart-title" style="margin-bottom:0;">일 예산 진화 — "3개월 챌린지" 약속 → 5개월 뒤 12배 도달</div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--sub);letter-spacing:.08em;">일 예산 합산 (만원)</span>
        </div>
        <svg viewBox="0 0 540 240" width="100%" style="display:block;flex:1;">
          <defs>
            <linearGradient id="tt_grow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#1E29FF" stop-opacity=".34"/>
              <stop offset="100%" stop-color="#1E29FF" stop-opacity="0"/>
            </linearGradient>
          </defs>

          <!-- y grid (max 120) -->
          <line x1="50" y1="30" x2="510" y2="30" stroke="#F1F4F9"/><text x="44" y="34" font-size="10" fill="#8B95A6" text-anchor="end" font-family="JetBrains Mono">120</text>
          <line x1="50" y1="72" x2="510" y2="72" stroke="#F1F4F9"/><text x="44" y="76" font-size="10" fill="#8B95A6" text-anchor="end" font-family="JetBrains Mono">90</text>
          <line x1="50" y1="114" x2="510" y2="114" stroke="#F1F4F9"/><text x="44" y="118" font-size="10" fill="#8B95A6" text-anchor="end" font-family="JetBrains Mono">60</text>
          <line x1="50" y1="156" x2="510" y2="156" stroke="#F1F4F9"/><text x="44" y="160" font-size="10" fill="#8B95A6" text-anchor="end" font-family="JetBrains Mono">30</text>
          <line x1="50" y1="190" x2="510" y2="190" stroke="#E2E6EF" stroke-width="1.5"/>

          <!-- PA 도입 수직선 -->
          <line x1="135" y1="26" x2="135" y2="190" stroke="#B3DA1C" stroke-width="1.3" stroke-dasharray="3,3"/>
          <rect x="98" y="10" width="74" height="16" rx="3" fill="#0A0F2E"/>
          <text x="135" y="22" font-size="9" fill="#D6FF3D" font-weight="800" text-anchor="middle" font-family="JetBrains Mono">↑ PA 1차 도입</text>

          <!-- area fill -->
          <polygon points="60,179 135,151 250,172 360,134 450,35 510,30 510,190 60,190" fill="url(#tt_grow)"/>

          <!-- main polyline -->
          <polyline points="60,179 135,151 250,172 360,134 450,35 510,30" fill="none" stroke="#1E29FF" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>

          <!-- points -->
          <circle cx="60" cy="179" r="4" fill="#1E29FF"/>
          <circle cx="135" cy="151" r="5.5" fill="#1E29FF" stroke="#fff" stroke-width="1.5"/>
          <circle cx="250" cy="172" r="4" fill="#1E29FF"/>
          <circle cx="360" cy="134" r="4" fill="#1E29FF"/>
          <circle cx="450" cy="35" r="5.5" fill="#1E29FF" stroke="#fff" stroke-width="1.5"/>
          <circle cx="510" cy="30" r="6.5" fill="#D6FF3D" stroke="#1E29FF" stroke-width="2.5"/>

          <!-- value labels -->
          <text x="60" y="170" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">~8</text>
          <text x="135" y="142" font-size="11" fill="#0F19D8" font-weight="800" text-anchor="middle" font-family="JetBrains Mono">28</text>
          <text x="250" y="163" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">13</text>
          <text x="360" y="125" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">40</text>
          <text x="450" y="26" font-size="11" fill="#0F19D8" font-weight="800" text-anchor="middle" font-family="JetBrains Mono">111</text>
          <text x="490" y="22" font-size="13" fill="#0F19D8" font-weight="900" text-anchor="middle" font-family="JetBrains Mono">120 ★</text>

          <!-- x date labels -->
          <text x="60" y="205" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">~25.11</text>
          <text x="135" y="205" font-size="10" fill="#0F172A" font-weight="800" text-anchor="middle" font-family="JetBrains Mono">25.11.25</text>
          <text x="250" y="205" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">26.03.06</text>
          <text x="360" y="205" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">26.04.02</text>
          <text x="450" y="205" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">26.04.29</text>
          <text x="510" y="205" font-size="10" fill="#0F19D8" font-weight="800" text-anchor="middle" font-family="JetBrains Mono">26.05.15</text>

          <!-- x sub-labels (milestone) -->
          <text x="60" y="220" font-size="9" fill="#8B95A6" text-anchor="middle" font-family="JetBrains Mono">PA 이전 정체</text>
          <text x="135" y="220" font-size="9" fill="#0F172A" font-weight="700" text-anchor="middle" font-family="JetBrains Mono">PA 도입</text>
          <text x="250" y="220" font-size="9" fill="#8B95A6" text-anchor="middle" font-family="JetBrains Mono">대형봉투</text>
          <text x="360" y="220" font-size="9" fill="#8B95A6" text-anchor="middle" font-family="JetBrains Mono">iOS 증액</text>
          <text x="450" y="220" font-size="9" fill="#8B95A6" text-anchor="middle" font-family="JetBrains Mono">일 100만</text>
          <text x="510" y="220" font-size="9" fill="#0F19D8" font-weight="700" text-anchor="middle" font-family="JetBrains Mono">목표 도달</text>

          <!-- bottom callout -->
          <rect x="60" y="226" width="450" height="14" rx="4" fill="#D6FF3D"/>
          <text x="285" y="237" font-size="10.5" fill="#0A0F2E" text-anchor="middle" font-weight="900" font-family="JetBrains Mono">★ 약속 시점 → 5개월 뒤 12배 도달 · 메타·구글·TikTok 3매체 믹스 완성</text>
        </svg>
      </div>
    </div>
  </div>
  <div class="chrome"><span><b>06</b> / 16</span><span>Performance · TikTok · ×12 · CPA -9.4%</span></div>
</div>'''

# Inject the new slide block so the per-slide pipeline below treats it the same
# as a v26 slide (its slide-num/chrome page already match position 6, so nothing
# to rewrite, but we still want SUBCOUNTER_REWRITES to apply uniformly).
slide_blocks["ptiktok"] = TIKTOK_SLIDE


# --------------------------------------------------------------------------
# 3.6 Synthesize the 990원 진입 이벤트 슬라이드 (replaces ARPU/8kg slot, position 10)
# --------------------------------------------------------------------------
ENTRY990_SLIDE = '''<div class="slide" id="p990">
  <div class="grid-bg light"></div>
  <div class="hd-tight">
    <div>
      <div class="cat-row">
        <span class="cat-chip" style="background:var(--ca-growth);"><span class="ko">그로스</span><span class="en">Growth</span></span>
        <span class="cat-meta"><b>02 / 03</b> · 진입 이벤트</span>
      </div>
      <div class="page-title">990원 진입 이벤트로 <em>월 신규 +36% · 브랜드 검색 2.4배 · CAC 동시 개선</em></div>
    </div>
    <span class="slide-num">10 / 16</span>
  </div>

  <div class="body2">
    <div class="col-l">
      <div class="tag-row">
        <span class="c-badge" style="background:var(--ca-growth);">Growth · CRM · Viral</span>
        <span class="c-badge outline">커버링 · 2024.12 (연말 청소결산 캠페인)</span>
      </div>
      <div class="p-title">광고 도달 밖의 고객을 깨우면서<br><em>가격 허들</em>도 같이 낮추다 — 첫 이용 990원</div>

      <div class="phase b1"><span class="ptag">병목</span>Paid 액션만으로는 월 목표 매출에 한계</div>
      <div class="sec tight"><ul>
        <li>고객 인터뷰에서 <em>"가격 대비 효용성"</em> 우려가 반복 등장, 첫 결제 직전 이탈률이 다른 단계 대비 높음</li>
        <li>광고 도달 밖 고객을 깨우면서 <strong>가격 허들도 함께 낮춰야 한다</strong>는 판단 — 단, "저가 진입 = 저품질 유저" 통념은 코호트로 직접 검증</li>
      </ul></div>

      <div class="phase b2"><span class="ptag">실행</span>3-track 프로모션 + CRM 알림톡 자동화</div>
      <div class="sec tight"><ul>
        <li><strong>메인</strong> — 신규 가입 시 첫 이용 990원 쿠폰 자동 발급 (정상가 무시, 최대 ₩50,000)</li>
        <li><strong>기존 고객</strong> — 다배출 리워드(1등 290kg)로 기존 매출 보호</li>
        <li><strong>바이럴</strong> — 인스타 친구 태그 챌린지 (6,471명 노출, 12/11~12/31)</li>
        <li><strong>CRM 자동화</strong> — 알림톡 14,315명 · 12/27 청소결산 쿠폰 5,601명 · 12/31 18시 만료 직전 추가 푸시</li>
      </ul></div>

      <div class="phase b3"><span class="ptag">결과</span>신규·브랜드·CAC 세 축이 <b>동시에</b> 움직임</div>
      <div class="sec tight"><ul>
        <li>월 신규 <strong>+669명(+36%)</strong> · 네이버 브랜드 검색량 <strong>2.4배</strong>(1,810 → 4,400회)</li>
        <li>CAC <strong>-₩194</strong>(₩19,250 → ₩19,056) — 쿠폰이 Paid 효율까지 함께 끌어올림</li>
        <li>990원 실사용 코호트 M1~M6 잔존율 <strong>전 구간</strong>에서 비쿠폰 신규 우위 — "저가 = 저품질" 통념을 데이터로 깸</li>
      </ul></div>

      <div class="result">
        <div class="kpi"><span class="kpi-num">+36%</span><span class="kpi-label">월 신규 (1,876 → 2,545명)</span></div>
        <div class="kpi"><span class="kpi-num">2.4×</span><span class="kpi-label">네이버 브랜드 검색량</span></div>
        <div class="kpi"><span class="kpi-num">-₩194</span><span class="kpi-label">CAC · Paid 효율 동시 개선</span></div>
      </div>
    </div>

    <div class="col-r">
      <!-- 결과물: 좌 연말 청소결산 LP + 우 3-track 프로모션 구조 카드 -->
      <div style="display:grid;grid-template-columns:230px 1fr;gap:14px;flex:none;height:432px;">
        <!-- Card #1: 연말 청소결산 LP (직접 기획) -->
        <div class="phone-frame" style="height:100%;">
          <div class="scr" style="display:flex;flex-direction:column;height:100%;">
            <div style="background:#F1F5F9;padding:7px 10px;font-family:var(--font-mono);font-size:10px;font-weight:800;color:var(--sub);letter-spacing:.08em;text-align:center;text-transform:uppercase;flex-shrink:0;">연말 청소결산 · 990원 LP</div>
            <div style="flex:1;min-height:0;overflow:hidden;background:#F8FAFF;position:relative;"><img src="./assets/covering_promo_year_end.png" alt="연말 청소결산 · 990원 진입 이벤트 상세페이지 (직접 기획·제작)" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;display:block;"></div>
          </div>
        </div>

        <!-- Card #2: 3-track 프로모션 + CRM 자동화 구조 -->
        <div style="background:var(--ink);border:1.5px solid var(--lime);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 6px 18px rgba(214,255,61,.18);">
          <div style="background:var(--lime);padding:9px 18px;font-family:var(--font-mono);font-size:11px;font-weight:800;color:var(--ink);letter-spacing:.1em;text-align:center;text-transform:uppercase;flex-shrink:0;">★ 3-track 프로모션 + CRM 자동화 — 단일 LP 한 장에 동시 집행</div>
          <div style="flex:1;padding:14px 18px;display:flex;flex-direction:column;gap:11px;justify-content:space-between;">
            <div style="display:flex;align-items:flex-start;gap:11px;">
              <div style="width:32px;height:32px;background:var(--cobalt);border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;color:#fff;font-weight:900;flex-shrink:0;">①</div>
              <div style="flex:1;min-width:0;">
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--lime);font-weight:800;letter-spacing:.12em;text-transform:uppercase;">메인 · 신규 모객</div>
                <div style="font-size:13.5px;color:#fff;font-weight:700;line-height:1.4;margin-top:2px;">첫 이용 <strong style="color:var(--lime);">990원 쿠폰</strong> 자동 발급 · 정상가 무시 · 최대 ₩50,000</div>
              </div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:11px;">
              <div style="width:32px;height:32px;background:var(--cobalt);border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;color:#fff;font-weight:900;flex-shrink:0;">②</div>
              <div style="flex:1;min-width:0;">
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--lime);font-weight:800;letter-spacing:.12em;text-transform:uppercase;">기존 고객 참여</div>
                <div style="font-size:13.5px;color:#fff;font-weight:700;line-height:1.4;margin-top:2px;">다배출 리워드 (1등 <strong style="color:var(--lime);">290kg</strong>) — 기존 매출 보호</div>
              </div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:11px;">
              <div style="width:32px;height:32px;background:var(--cobalt);border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;color:#fff;font-weight:900;flex-shrink:0;">③</div>
              <div style="flex:1;min-width:0;">
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--lime);font-weight:800;letter-spacing:.12em;text-transform:uppercase;">바이럴</div>
                <div style="font-size:13.5px;color:#fff;font-weight:700;line-height:1.4;margin-top:2px;">인스타 친구 태그 챌린지 · <strong style="color:var(--lime);">6,471명 노출</strong> (12/11~12/31)</div>
              </div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:11px;padding-top:9px;border-top:1px dashed rgba(214,255,61,.32);">
              <div style="width:32px;height:32px;background:#7C3AED;border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:10px;color:#fff;font-weight:900;flex-shrink:0;">CRM</div>
              <div style="flex:1;min-width:0;">
                <div style="font-family:var(--font-mono);font-size:10px;color:#E9D5FF;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">알림톡 자동화 — 첫 이용·결산·만료 직전 3-step</div>
                <div style="font-size:12.5px;color:#fff;font-weight:600;line-height:1.4;margin-top:2px;">첫 이용 쿠폰 <strong>14,315명</strong> · 12/27 결산 <strong>5,601명</strong> · 12/31 18시 만료 직전 추가 푸시</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- KPI 비교 표 (11월 vs 12월) + 핵심 인사이트 -->
      <div class="chart-card" style="flex:1;min-height:0;display:flex;flex-direction:column;padding:14px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="chart-title" style="margin-bottom:0;">핵심 KPI — 11월 vs 12월 (3-track 프로모션 전후)</div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--sub);letter-spacing:.08em;">2024.11–12 · 모수 동일</span>
        </div>
        <table style="width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;">
          <thead><tr>
            <th style="text-align:left;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;border-radius:6px 0 0 0;">지표</th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;">이벤트 전 (11월)</th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;">이벤트 후 (12월)</th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;border-radius:0 6px 0 0;">변화</th>
          </tr></thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--line-lt);">
              <td style="padding:9px 10px;font-size:12px;color:var(--text);">월 신규 유저</td>
              <td style="text-align:right;padding:9px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">1,876명</td>
              <td style="text-align:right;padding:9px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">2,545명</td>
              <td style="text-align:right;padding:9px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">+36% (+669명)</span></td>
            </tr>
            <tr style="background:#F4FBF7;border-bottom:1px solid var(--line-lt);">
              <td style="padding:9px 10px;font-size:12px;font-weight:800;color:var(--text);">네이버 브랜드 검색량</td>
              <td style="text-align:right;padding:9px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">1,810회</td>
              <td style="text-align:right;padding:9px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">4,400회</td>
              <td style="text-align:right;padding:9px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">+143% (2.4×)</span></td>
            </tr>
            <tr style="background:#F4FBF7;border-bottom:1px solid var(--line-lt);">
              <td style="padding:9px 10px;font-size:12px;font-weight:800;color:var(--text);">CAC (실측)</td>
              <td style="text-align:right;padding:9px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">₩19,250</td>
              <td style="text-align:right;padding:9px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">₩19,056</td>
              <td style="text-align:right;padding:9px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">-₩194 ↓</span></td>
            </tr>
            <tr>
              <td style="padding:9px 10px;font-size:12px;color:var(--text);">990원 코호트 vs 비쿠폰 <span style="color:var(--sub);font-size:10px;">M1~M6 잔존</span></td>
              <td style="text-align:right;padding:9px 10px;font-size:12px;font-family:var(--font-mono);color:var(--sub);" colspan="2">37.7% / 29.4% / 25.2% / 25.6% / 23.8% / 23.3% <span style="color:var(--text2);">vs</span> 34.7% / 26.5% / 24.5% / 23.4% / 22.7% / 23.2%</td>
              <td style="text-align:right;padding:9px 10px;"><span style="display:inline-block;background:#EEF1FF;color:#1E29FF;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">M1~M6 우위</span></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:10px;padding:12px 14px;background:var(--ink);border-radius:8px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--lime);"></div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--lavender);font-weight:600;letter-spacing:.08em;">핵심 인사이트</div>
          <div style="font-family:var(--font-display);font-size:15.5px;color:#fff;font-weight:800;letter-spacing:-.018em;margin-top:3px;line-height:1.4;">신규 +36%·브랜드 검색 2.4×·CAC 동시 하락 — 세 축이 <span style="color:var(--lime);">함께 움직임</span>. 브랜드 검색 급증 = 광고 도달 밖 입소문 신호, CAC 하락 = 쿠폰이 Paid 효율까지 견인.</div>
        </div>
      </div>
    </div>
  </div>
  <div class="chrome"><span><b>10</b> / 16</span><span>Growth · 990원 진입 · 신규 +36% · 검색 ×2.4 · CAC -194원</span></div>
</div>'''

slide_blocks["p990"] = ENTRY990_SLIDE

# v26 had p3 chrome="<b>03</b> / 16". The other chromes are unique strings we
# rewrite per slide via slide-num + chrome page substitution.
for sid, new_pos in NEW_ORDER:
    block = slide_blocks[sid]

    # (a) slide-num pill: <span class="slide-num">NN / 16</span>
    block = re.sub(
        r'(<span class="slide-num">)\d{2}( / 16</span>)',
        rf"\g<1>{page2(new_pos)}\g<2>",
        block,
    )
    # (b) chrome page number: <b>NN</b> / 16
    block = re.sub(
        r"(<b>)\d{2}(</b> / 16</span>)",
        rf"\g<1>{page2(new_pos)}\g<2>",
        block,
    )

    # (c) optional sub-counter rewrite
    if sid in SUBCOUNTER_REWRITES:
        old, new = SUBCOUNTER_REWRITES[sid]
        if old not in block:
            raise RuntimeError(
                f"slide {sid}: expected sub-counter {old!r} not found"
            )
        block = block.replace(old, new, 1)

    slide_blocks[sid] = block


# --------------------------------------------------------------------------
# 4. Cover rebrand (p1) — performance-marketer headline
# --------------------------------------------------------------------------
cover = slide_blocks["p1"]

cover = sub_once(
    cover,
    r"풀 퍼널 그로스 · 4,520만 → 18\.9억 · 40배",
    "퍼포먼스 마케팅 풀스택 · 4,520만 → 18.9억 · 40배",
)

# h1 — replace entire headline text. Match the inner of <h1 ...>...</h1>.
cover = sub_once(
    cover,
    r"풀 퍼널 그로스로<br>\s*<span style=\"color:var\(--lime\);\">월 매출 4,520만 → 18\.9억,</span><br>\s*<span style=\"color:var\(--lime\);\">40배 성장</span>을 주도한<br>\s*브랜드 엑셀러레이터 <span style=\"color:var\(--lime\);\">이도형</span>입니다\.",
    "퍼포먼스 마케팅으로<br>"
    "<span style=\"color:var(--lime);\">월 매출 4,520만 → 18.9억,</span><br>"
    "<span style=\"color:var(--lime);\">40배 성장</span>을 만든<br>"
    "퍼포먼스 마케터 <span style=\"color:var(--lime);\">이도형</span>입니다.",
)

cover = sub_once(
    cover,
    r"Growth Marketing Portfolio · 2024 – 2026",
    "Performance Marketing Portfolio · 2024 – 2026",
)

cover = sub_once(
    cover,
    r"소재 단위부터 CRM · 퍼포먼스 · 팀 빌딩까지, 전 채널 그로스를 직접 설계·실행",
    "Meta · Google · TikTok · ASA · 네이버SA 5채널 + 앱 UA · MMP · T-ROAS · CRM까지 직접 설계·실행",
)

slide_blocks["p1"] = cover

# --------------------------------------------------------------------------
# 5. Profile rebrand (p2) — performance angle
# --------------------------------------------------------------------------
profile = slide_blocks["p2"]

profile = sub_once(
    profile,
    r"콘텐츠, 퍼포먼스, CRM,<br>데이터 분석, 팀빌딩<br>\s*<span style=\"color:var\(--lime\);\">한 사람이 끝내는</span> 그로스 마케팅",
    "퍼포먼스 광고 · 데이터 분석 ·<br>CRM · 콘텐츠 제작<br>"
    "<span style=\"color:var(--lime);\">한 사람이 풀스택으로 끝내는</span> 퍼포먼스 마케팅",
)

profile = sub_once(
    profile,
    r"5년 4개월, 4개 회사를 거치며 <b style=\"color:#fff;font-weight:700;\">매번 0을 1로</b> 만들어왔습니다\.",
    "5년 4개월, 4개 회사를 거치며 <b style=\"color:#fff;font-weight:700;\">Meta·Google·TikTok·ASA·네이버SA·앱피어</b> 5채널을 매번 직접 운용해왔습니다.",
)

slide_blocks["p2"] = profile

# --------------------------------------------------------------------------
# 6. Capability Overview rebrand (p3) — card order + perf-first
# --------------------------------------------------------------------------
cap = slide_blocks["p3"]

# Reorder the 6-card primary grid: 퍼포먼스 first.
# v26 order inside .skill-grid (no grid-template-columns override):
#   1) 그로스 / 2) 콘텐츠 / 3) CRM / 4) 퍼포먼스 / 5) 바이럴 / 6) AI 활용
# Target order (performance-first): 퍼포먼스, 콘텐츠, 바이럴, 그로스, CRM, AI 활용

# Extract all six skill-block divs in document order, then re-emit in new order.
# Match each .skill-block (NOT including the bottom row 1-col 팀 리딩 block,
# which is in its own `.skill-grid` wrapper after this one).
first_grid_match = re.search(
    r'(<div class="skill-grid">)(.*?)(</div>\s*<div class="skill-grid" style="grid-template-columns:1fr;">)',
    cap,
    re.DOTALL,
)
if not first_grid_match:
    raise RuntimeError("p3: could not locate primary skill-grid")

grid_open, grid_inner, grid_close_and_next = (
    first_grid_match.group(1),
    first_grid_match.group(2),
    first_grid_match.group(3),
)

# Each card starts with `<div class="skill-block">` and has nested children
# (sb-icon / sb-name+sb-en wrapper / sb-desc), so we need balanced-div matching
# rather than a lazy regex.
card_open_pat = re.compile(r'<div class="skill-block">')
card_blocks: list[str] = []
for cm in card_open_pat.finditer(grid_inner):
    end = find_block_end(grid_inner, cm.start())
    card_blocks.append(grid_inner[cm.start():end])
if len(card_blocks) != 6:
    raise RuntimeError(f"p3: expected 6 skill cards, found {len(card_blocks)}")

# Identify each card by its 한글 name to be order-agnostic.
def card_name(card: str) -> str:
    m = re.search(r'<div class="sb-name">([^<]+?)(?:\s*<|</div)', card)
    if not m:
        raise RuntimeError(f"could not extract sb-name from card: {card[:120]}")
    return m.group(1).strip()

cards_by_name = {card_name(c): c for c in card_blocks}
expected_names = {"그로스", "콘텐츠", "CRM", "퍼포먼스", "바이럴", "AI 활용"}
assert set(cards_by_name) == expected_names, (
    f"unexpected card names: {set(cards_by_name)}"
)

new_card_order = ["퍼포먼스", "콘텐츠", "바이럴", "그로스", "CRM", "AI 활용"]

# Optionally rewrite the 퍼포먼스 card description to be more channel-loud.
perf_card = cards_by_name["퍼포먼스"]
perf_card = sub_once(
    perf_card,
    r"Web2App 브릿지 · T-ROAS 정적가치\. AOS CVR 19\.47%",
    "Meta·Google·TikTok·ASA·네이버SA 5채널 · Web2App CVR 19.47% · T-ROAS 정적가치 30.7%",
)
cards_by_name["퍼포먼스"] = perf_card

new_grid_inner = "\n        ".join(cards_by_name[name] for name in new_card_order)
# Reassemble with original outer wrapping whitespace.
new_first_grid = f'{grid_open}\n        {new_grid_inner}\n      '

cap = cap[: first_grid_match.start()] + new_first_grid + grid_close_and_next + cap[first_grid_match.end():]

# Eyebrow rebrand
cap = sub_once(
    cap,
    r'<div class="eyebrow">Performance Overview</div>',
    '<div class="eyebrow">Performance Capability · Channel-first</div>',
)

# Chrome rebrand (keep page no left intact, only change right description).
cap = sub_once(
    cap,
    r"Capability · 7 Domains · Revenue ×40",
    "Performance Capability · 7 Domains · Revenue ×40",
)

slide_blocks["p3"] = cap

# --------------------------------------------------------------------------
# 7. Update <title>
# --------------------------------------------------------------------------
preamble = sub_once(
    preamble,
    r"<title>이도형 포트폴리오 v26 — Cobalt Edge · 병목·실행·결과</title>",
    "<title>이도형 포트폴리오 v27 — Performance Edition · 퍼포먼스 마케터</title>",
)

# v15 17-슬라이드 comment → v27 16-슬라이드
preamble = preamble.replace(
    "  v15  17-슬라이드 — Notion 피드백 반영",
    "  v27  16-슬라이드 — 퍼포먼스 마케터 직무 재구성",
    1,
)

# --------------------------------------------------------------------------
# 8. Reassemble file in new order
# --------------------------------------------------------------------------
ordered_slides = [slide_blocks[sid] for sid, _ in NEW_ORDER]
out = preamble + "\n\n".join(ordered_slides) + tail
DST.write_text(out, encoding="utf-8")
print(f"wrote {DST} ({len(out):,} bytes, {out.count(chr(10)):,} lines)")
