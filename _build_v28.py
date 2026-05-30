"""Build v28 — Content Marketer edition — from v26.

차이점 (vs v27)
==============
- 콘텐츠 마케터 직무 우선 (영상·라이센스·LP 등 직접 제작 케이스 first)
- TikTok 매체 확장(ptiktok) 슬라이드 제거 — 매체 챌린지보단 콘텐츠 케이스가 핵심
- 시은니야 라이센스(psieun) 슬라이드 추가 — Meta +23.8% / CPA -4.9%
- Cover/Profile/Capability 콘텐츠 톤 (Premiere·AE·Photoshop·Illustrator·Figma 우선)

v26 file remains untouched.
"""
from __future__ import annotations

import re
from pathlib import Path

SRC = Path(__file__).parent / "이도형_포트폴리오_v26.html"
DST = Path(__file__).parent / "이도형_포트폴리오_v28.html"

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
    ("p3",       3),   # Capability (콘텐츠 First)
    ("p7",       4),   # 영상 콘텐츠           (content 01/02)
    ("psieun",   5),   # NEW: 시은니야 라이센스 (content 02/02)
    ("p13",      6),   # PA 그로스 사이클      (viral 01/01)
    ("p10",      7),   # Web2App Bridge LP 10종 (perf 01/02)
    ("p11",      8),   # T-ROAS                (perf 02/02)
    ("p6",       9),   # D45 CVR (알림톡 콘텐츠) (growth·CRM 01/02)
    ("p4",      10),   # M1 등급제 (모바일 직접 제작) (growth·CRM 02/02)
    ("p990",    11),   # 990원 진입 이벤트 LP   (growth 01/01)
    ("p9",      12),   # 페이백 RCT (LP + 인플 영상) (CRM 01/01)
    ("p14",     13),   # Claude CLI (Figma→웹 자동화)
    ("p15",     14),   # 팀 리딩 (콘텐츠 인턴 육성)
    ("p16",     15),   # 이전 경력
    ("p17",     16),   # OUTRO
]
assert len(NEW_ORDER) == 16

# Slide IDs in NEW_ORDER that are NOT present in v26 (we synthesize them below
# and inject into slide_blocks before per-slide substitution).
EXTRA_SLIDE_IDS = {"psieun", "p990"}

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
    # 콘텐츠 카테고리: 영상 콘텐츠 + 시은니야 라이센스 = 2개
    "p7": (
        "<b>01 / 01</b> · 영상 콘텐츠 제작",
        "<b>01 / 02</b> · 영상 콘텐츠 제작",
    ),
    # 퍼포먼스: Web2App(p10)는 본문 자체 교체로 01/02 이미 박힘
    "p11": ("<b>02 / 02</b> · T-ROAS", "<b>02 / 02</b> · T-ROAS"),
    # 단순 협업 제거 → PA가 단독 바이럴 슬라이드. 02/02 → 01/01
    "p13": (
        "<b>02 / 02</b> · PA 그로스 사이클",
        "<b>01 / 01</b> · PA 그로스 사이클",
    ),
    # CVR: 그로스·CRM 묶음, 2개 중 첫 번째
    "p6": ("<b>03 / 03</b> · CVR", "<b>01 / 02</b> · CVR"),
    # M1 등급제: 그로스 → 그로스·CRM 재분류, 두 번째
    "p4": ("<b>01 / 03</b> · Retention", "<b>02 / 02</b> · Retention"),
    # 페이백 RCT: 단독 CRM 슬라이드. 02/02 → 01/01
    "p9": (
        "<b>02 / 02</b> · 식목일 페이백 RCT",
        "<b>01 / 01</b> · 식목일 페이백 RCT",
    ),
}

# --------------------------------------------------------------------------
# 3.5 Synthesize the new psieun (시은니야 라이센스) slide
#     Notion 인사이트: Meta 채널 구매 +23.8%, CPA -4.9% (광고비 +17.8% 와중)
#     50일 매칭 · 폐기물 소재 론칭일 2025-11-19 · Airbridge 실측
# --------------------------------------------------------------------------
SIEUN_SLIDE = '''<div class="slide" id="psieun">
  <div class="grid-bg light"></div>
  <div class="hd-tight">
    <div>
      <div class="cat-row">
        <span class="cat-chip" style="background:var(--ca-content);color:#0A0F2E;"><span class="ko">콘텐츠</span><span class="en" style="opacity:.75;">Content · License</span></span>
        <span class="cat-meta"><b>02 / 02</b> · 시은니야 라이센스</span>
      </div>
      <div class="page-title">라이센스 영상 1편으로 머신러닝 못 닿는 유저층 — <em>Meta 구매 +23.8% · CPA -4.9%</em></div>
    </div>
    <span class="slide-num">05 / 16</span>
  </div>

  <div class="body2">
    <div class="col-l">
      <div class="tag-row">
        <span class="c-badge" style="background:var(--ca-content);color:#0A0F2E;">Content · Influencer License</span>
        <span class="c-badge outline">커버링 · 2025.10.22~12.22 (60일) · 50일 매칭</span>
      </div>
      <div class="p-title">본 채널 1차 + 광고 채널 2차 활용 —<br><em>클린본</em>으로 같은 영상을 자유롭게 재편집</div>

      <div class="phase b1"><span class="ptag">병목</span>머신러닝 입찰만으로는 못 닿는 유저층이 있었다</div>
      <div class="sec tight"><ul>
        <li>메타·구글 머신러닝은 <em>기존 행동 신호가 있는 유저</em>에만 우선 노출 — 광고비 늘려도 같은 풀에서 CPM만 상승</li>
        <li><strong>인플루언서의 신뢰 자산</strong>으로 콘텐츠 자체의 힘으로 도달할 수 있는 라이센스 모델 가설</li>
      </ul></div>

      <div class="phase b2"><span class="ptag">실행</span>클린본 계약 + 3개 소구점 갈아끼우기</div>
      <div class="sec tight"><ul>
        <li><strong>클린본 계약 구조</strong> — 자막·BGM 없는 클린본 입수로 광고 채널 자유 재편집 가능, 본 채널 1차 + 광고 2차 결합의 핵심 장치</li>
        <li>같은 영상을 <strong>자취 → 폐기물 → 화장품</strong> 3개 소구점으로 갈아끼우며 가장 강하게 작동하는 메시지 검증 — <strong>폐기물</strong>이 결정적</li>
        <li>본 채널 + 광고 채널 반복 노출로 머신러닝 바깥 유저층의 인지도 누적</li>
      </ul></div>

      <div class="phase b3"><span class="ptag">결과</span>Meta 채널 전체 구매 <b>+23.8%</b> · CPA <b>-4.9%</b> 동시</div>
      <div class="sec tight"><ul>
        <li>50일 매칭 — 구매 <strong>7,049 → 8,728건 (+23.8%)</strong> · 광고비 <strong>+17.8%</strong> 와중에 CPA <strong>₩21,410 → ₩20,366 (-4.9%)</strong></li>
        <li>폐기물 단일 세트가 머신러닝 새 시드로 → <strong>메타 폐기물 세팅 전체 활성화</strong> + 비-인플루언서 폐기물 소재 효율도 동반 상승</li>
        <li>인플루언서 인지도 → 광고 신뢰감 → <strong>오가닉 매출 볼륨 상승</strong>까지 3단계 확장</li>
      </ul></div>

      <div class="result">
        <div class="kpi"><span class="kpi-num">+23.8%</span><span class="kpi-label">Meta 채널 전체 구매 (7,049 → 8,728건)</span></div>
        <div class="kpi"><span class="kpi-num">-4.9%</span><span class="kpi-label">CPA · 광고비 +17.8% 와중</span></div>
        <div class="kpi"><span class="kpi-num">1편 라이센스</span><span class="kpi-label">60일 · 클린본 포함 · 3소구점</span></div>
      </div>
    </div>

    <div class="col-r">
      <!-- 결과물: 좌 시은니야 영상 + 우 3-소구점 변주 카드 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;flex:none;height:300px;">
        <!-- Card #1: 시은니야 YT Shorts 영상 (클릭 시 재생) -->
        <a class="yt-card" href="https://www.youtube.com/shorts/G9Kad7XyB98" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;">
          <div class="thumb">
            <span class="live-badge">시은니야 · YT Shorts</span>
            <img src="./assets/yt_sieun.jpg" alt="시은니야 자취 영상 — 라이센스 원본">
            <div class="play"></div>
          </div>
          <div class="meta-strip">
            <div class="title">시은니야 자취 영상 (라이센스 원본)</div>
            <div class="url">youtube.com/shorts/G9Kad7XyB98</div>
          </div>
        </a>
        <!-- Card #2: 3-소구점 변주 카드 -->
        <div style="background:var(--ink);border:1.5px solid var(--lime);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 6px 18px rgba(214,255,61,.18);">
          <div style="background:var(--lime);padding:7px 14px;font-family:var(--font-mono);font-size:10px;font-weight:800;color:var(--ink);letter-spacing:.08em;text-align:center;text-transform:uppercase;flex-shrink:0;">★ 3-소구점 갈아끼우기 — 클린본 재편집</div>
          <div style="flex:1;padding:11px 14px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:flex-start;gap:9px;">
              <div style="width:26px;height:26px;background:var(--sub);border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:10px;color:#fff;font-weight:900;flex-shrink:0;">①</div>
              <div style="flex:1;min-width:0;"><div style="font-size:12px;color:#fff;font-weight:700;line-height:1.3;"><strong style="color:var(--lavender);">자취</strong> · 25.11.07</div><div style="font-size:11px;color:var(--lavender);line-height:1.3;">기존 자취 소재와 차별점 부족 — 11.26 OFF</div></div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:9px;background:rgba(214,255,61,.10);border-radius:6px;padding:6px 8px;margin:-2px;">
              <div style="width:26px;height:26px;background:var(--lime);border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:10px;color:var(--ink);font-weight:900;flex-shrink:0;">②</div>
              <div style="flex:1;min-width:0;"><div style="font-size:12px;color:var(--lime);font-weight:800;line-height:1.3;"><strong>폐기물 ★</strong> · 25.11.19</div><div style="font-size:11px;color:#fff;line-height:1.3;font-weight:600;">의류·소형가전 폐기물 — 주말간 일 예산 소진, <strong style="color:var(--lime);">메타 폐기물 세팅 전체 활성화</strong></div></div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:9px;">
              <div style="width:26px;height:26px;background:var(--sub);border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:10px;color:#fff;font-weight:900;flex-shrink:0;">③</div>
              <div style="flex:1;min-width:0;"><div style="font-size:12px;color:#fff;font-weight:700;line-height:1.3;"><strong style="color:var(--lavender);">화장품</strong> · 25.11.20~21</div><div style="font-size:11px;color:var(--lavender);line-height:1.3;">화장품 폐기·정리 — 새 소구 세팅 발굴</div></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Before / After 비교 표 -->
      <div class="chart-card" style="flex:1;min-height:0;display:flex;flex-direction:column;padding:14px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="chart-title" style="margin-bottom:0;">Meta 채널 Before / After — 폐기물 소재 론칭 2025.11.19 기준</div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--sub);letter-spacing:.08em;">Airbridge 실측 · 50일 매칭</span>
        </div>
        <table style="width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;">
          <thead><tr>
            <th style="text-align:left;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;border-radius:6px 0 0 0;">지표</th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;">Before <span style="color:var(--lavender-dim);">25.10.01~11.18 · 49일</span></th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;">After <span style="color:var(--lavender-dim);">25.11.19~26.01.07 · 50일</span></th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;border-radius:0 6px 0 0;">증분</th>
          </tr></thead>
          <tbody>
            <tr style="background:#F4FBF7;border-bottom:1px solid var(--line-lt);">
              <td style="padding:10px 10px;font-size:12px;font-weight:800;color:var(--text);">구매</td>
              <td style="text-align:right;padding:10px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">7,049건</td>
              <td style="text-align:right;padding:10px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">8,728건</td>
              <td style="text-align:right;padding:10px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">+23.8%</span></td>
            </tr>
            <tr style="border-bottom:1px solid var(--line-lt);">
              <td style="padding:10px 10px;font-size:12px;color:var(--text);">광고비</td>
              <td style="text-align:right;padding:10px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">₩1.51억</td>
              <td style="text-align:right;padding:10px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">₩1.78억</td>
              <td style="text-align:right;padding:10px 10px;"><span style="display:inline-block;background:#FFF7ED;color:#92400E;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">+17.8%</span></td>
            </tr>
            <tr style="background:#F4FBF7;">
              <td style="padding:10px 10px;font-size:12px;font-weight:800;color:var(--text);">CPA</td>
              <td style="text-align:right;padding:10px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">₩21,410</td>
              <td style="text-align:right;padding:10px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">₩20,366</td>
              <td style="text-align:right;padding:10px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">-4.9%</span></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:auto;padding-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--text2);line-height:1.5;">
          ✅ 광고비 <strong style="color:var(--text);">+17.8%</strong> 늘리면서도 CPA가 <strong style="color:#0E9E76;">-4.9%</strong> 함께 내려간 결과 — 폐기물 단일 세트가 채널 머신러닝의 새 시드로 퍼져 비-인플루언서 폐기물 소재의 효율까지 끌어올린 시너지.
        </div>
      </div>
    </div>
  </div>
  <div class="chrome"><span><b>05</b> / 16</span><span>Content · 시은니야 라이센스 · Meta +23.8% / CPA -4.9%</span></div>
</div>'''

slide_blocks["psieun"] = SIEUN_SLIDE


# --------------------------------------------------------------------------
# 3.6 Synthesize the 990원 진입 이벤트 슬라이드 (replaces ARPU/8kg slot, position 10)
# --------------------------------------------------------------------------
ENTRY990_SLIDE = '''<div class="slide" id="p990">
  <div class="grid-bg light"></div>
  <div class="hd-tight">
    <div>
      <div class="cat-row">
        <span class="cat-chip" style="background:var(--ca-growth);"><span class="ko">그로스</span><span class="en">Growth</span></span>
        <span class="cat-meta"><b>01 / 01</b> · 진입 이벤트</span>
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
            <div style="background:#F1F5F9;padding:7px 10px;font-family:var(--font-mono);font-size:10px;font-weight:800;color:var(--sub);letter-spacing:.08em;text-align:center;text-transform:uppercase;flex-shrink:0;">첫 이용 고객 이벤트 · 990원 LP</div>
            <div style="flex:1;min-height:0;overflow:hidden;background:#F8FAFF;position:relative;"><img src="./assets/990원.PNG" alt="첫 이용 고객 이벤트 · 990원 진입 LP (직접 기획·제작)" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;display:block;"></div>
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

      <!-- 핵심 KPI 표 (11월 vs 12월) -->
      <div class="chart-card" style="flex:none;display:flex;flex-direction:column;padding:14px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="chart-title" style="margin-bottom:0;">핵심 KPI — 11월 vs 12월 (3-track 프로모션 전후)</div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--sub);letter-spacing:.08em;">2024.11–12 · 모수 동일</span>
        </div>
        <table style="width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;">
          <thead><tr>
            <th style="text-align:left;padding:7px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;border-radius:6px 0 0 0;">지표</th>
            <th style="text-align:right;padding:7px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;">이벤트 전 (11월)</th>
            <th style="text-align:right;padding:7px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;">이벤트 후 (12월)</th>
            <th style="text-align:right;padding:7px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;border-radius:0 6px 0 0;">변화</th>
          </tr></thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--line-lt);">
              <td style="padding:8px 10px;font-size:12px;color:var(--text);">월 신규 유저</td>
              <td style="text-align:right;padding:8px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">1,876명</td>
              <td style="text-align:right;padding:8px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">2,545명</td>
              <td style="text-align:right;padding:8px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">+36% (+669명)</span></td>
            </tr>
            <tr style="background:#F4FBF7;border-bottom:1px solid var(--line-lt);">
              <td style="padding:8px 10px;font-size:12px;font-weight:800;color:var(--text);">네이버 브랜드 검색량</td>
              <td style="text-align:right;padding:8px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">1,810회</td>
              <td style="text-align:right;padding:8px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">4,400회</td>
              <td style="text-align:right;padding:8px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">+143% (2.4×)</span></td>
            </tr>
            <tr style="background:#F4FBF7;">
              <td style="padding:8px 10px;font-size:12px;font-weight:800;color:var(--text);">CAC (실측)</td>
              <td style="text-align:right;padding:8px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">₩19,250</td>
              <td style="text-align:right;padding:8px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">₩19,056</td>
              <td style="text-align:right;padding:8px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">-₩194 ↓</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 코호트 잔존 비교 — 990원 vs 비쿠폰 (저가 진입 = 저품질 통념 깸) -->
      <div class="chart-card" style="flex:1;min-height:0;display:flex;flex-direction:column;padding:14px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="chart-title" style="margin-bottom:0;">990원 코호트 vs 비쿠폰 신규 · M1~M6 잔존율 <small style="color:var(--sub);font-weight:500;">— "저가 = 저품질" 통념을 데이터로 깸</small></div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--sub);letter-spacing:.08em;">2024-12 가입 코호트</span>
        </div>
        <table style="width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;">
          <thead><tr>
            <th style="text-align:left;padding:7px 8px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;border-radius:6px 0 0 0;">구분</th>
            <th style="text-align:right;padding:7px 6px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--lavender);">모수</th>
            <th style="text-align:right;padding:7px 6px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;">M1</th>
            <th style="text-align:right;padding:7px 6px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;">M2</th>
            <th style="text-align:right;padding:7px 6px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;">M3</th>
            <th style="text-align:right;padding:7px 6px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;">M4</th>
            <th style="text-align:right;padding:7px 6px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;">M5</th>
            <th style="text-align:right;padding:7px 8px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;border-radius:0 6px 0 0;">M6</th>
          </tr></thead>
          <tbody>
            <tr style="background:#F4FBF7;border-bottom:1px solid var(--line-lt);">
              <td style="padding:9px 8px;font-size:11px;font-weight:800;color:var(--text);">★ 990원 코호트 <span style="color:var(--sub);font-size:9px;font-weight:500;">(쿠폰 실사용)</span></td>
              <td style="text-align:right;padding:9px 6px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">579명</td>
              <td style="text-align:right;padding:9px 6px;font-size:12px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">37.7%</td>
              <td style="text-align:right;padding:9px 6px;font-size:12px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">29.4%</td>
              <td style="text-align:right;padding:9px 6px;font-size:12px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">25.2%</td>
              <td style="text-align:right;padding:9px 6px;font-size:12px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">25.6%</td>
              <td style="text-align:right;padding:9px 6px;font-size:12px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">23.8%</td>
              <td style="text-align:right;padding:9px 8px;font-size:12px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">23.3%</td>
            </tr>
            <tr style="border-bottom:1px solid var(--line-lt);">
              <td style="padding:9px 8px;font-size:11px;color:var(--text2);">비쿠폰 신규 <span style="color:var(--sub);font-size:9px;">(동기간 가입)</span></td>
              <td style="text-align:right;padding:9px 6px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">2,492명</td>
              <td style="text-align:right;padding:9px 6px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">34.7%</td>
              <td style="text-align:right;padding:9px 6px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">26.5%</td>
              <td style="text-align:right;padding:9px 6px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">24.5%</td>
              <td style="text-align:right;padding:9px 6px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">23.4%</td>
              <td style="text-align:right;padding:9px 6px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">22.7%</td>
              <td style="text-align:right;padding:9px 8px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">23.2%</td>
            </tr>
            <tr>
              <td style="padding:9px 8px;font-size:11px;font-weight:800;color:var(--text);">갭 <span style="color:var(--sub);font-size:9px;font-weight:500;">(990원 − 비쿠폰)</span></td>
              <td style="text-align:right;padding:9px 6px;font-size:10px;font-family:var(--font-mono);color:var(--sub);">—</td>
              <td style="text-align:right;padding:7px 6px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:10px;font-weight:800;padding:3px 6px;border-radius:10px;">+3.0pp</span></td>
              <td style="text-align:right;padding:7px 6px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:10px;font-weight:800;padding:3px 6px;border-radius:10px;">+2.9pp</span></td>
              <td style="text-align:right;padding:7px 6px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:10px;font-weight:800;padding:3px 6px;border-radius:10px;">+0.7pp</span></td>
              <td style="text-align:right;padding:7px 6px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:10px;font-weight:800;padding:3px 6px;border-radius:10px;">+2.2pp</span></td>
              <td style="text-align:right;padding:7px 6px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:10px;font-weight:800;padding:3px 6px;border-radius:10px;">+1.1pp</span></td>
              <td style="text-align:right;padding:7px 8px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:10px;font-weight:800;padding:3px 6px;border-radius:10px;">+0.1pp</span></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:auto;padding-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--text2);line-height:1.5;">
          ✅ <strong style="color:var(--text);">M1~M6 전 구간에서 990원 코호트가 비쿠폰 신규 대비 잔존 우위</strong> — 진입 비용을 낮춰도 잔존 품질은 떨어지지 않음.
        </div>
      </div>
    </div>
  </div>
  <div class="chrome"><span><b>10</b> / 16</span><span>Growth · 990원 진입 · 신규 +36% · 검색 ×2.4 · CAC -194원</span></div>
</div>'''

slide_blocks["p990"] = ENTRY990_SLIDE


# --------------------------------------------------------------------------
# 3.7 Rewrite p10 (Web2App 브릿지) — 실제 수치로 본문·표 전면 교체
#     기간 26.02.03~26.05.24 (111일) · Meta omni_purchase · AOV ₩25,000 가정.
#     일반 앱설치(33개) vs Web2App(9개): CPA -51.8% / CVR +102.9% / ROAS +107.6%
# --------------------------------------------------------------------------
WEB2APP_SLIDE = '''<div class="slide" id="p10">
  <div class="grid-bg light"></div>
  <div class="hd-tight">
    <div>
      <div class="cat-row">
        <span class="cat-chip" style="background:var(--ca-perf);"><span class="ko">퍼포먼스</span><span class="en">Performance</span></span>
        <span class="cat-meta"><b>01 / 02</b> · Web2App</span>
      </div>
      <div class="page-title">Web2App 브릿지로 — <em>CPA -51.8% · 구매 CVR 2배 · ROAS 2.1배</em></div>
    </div>
    <span class="slide-num">04 / 16</span>
  </div>

  <div class="body2">
    <div class="col-l">
      <div class="tag-row">
        <span class="c-badge" style="background:var(--ca-perf);">Performance · Meta · Web2App</span>
        <span class="c-badge outline">커버링 · 2026.02.03~05.24 · 111일 · 동일 계정 동시 운영</span>
      </div>
      <div class="p-title">앱스토어 직링크 대신 <em>브릿지로 가치를 먼저 설득</em> +<br>최적화 이벤트를 <em>구매로 격상</em></div>

      <div class="phase b1"><span class="ptag">병목</span>앱스토어 직링크는 효율을 잃고 있었다</div>
      <div class="sec tight"><ul>
        <li>설득 없이 설치만 요구 → <em>저의향 유저 무분별 유입</em>, CPA 천장이 빨리 옴</li>
        <li>최적화 이벤트가 <strong>설치 단계</strong>에 머물러 머신러닝이 <em>"설치할 사람"</em>만 학습 → 구매 의향 신호가 비어 있음</li>
      </ul></div>

      <div class="phase b2"><span class="ptag">실행</span>광고 URL을 브릿지로, 최적화 이벤트를 구매로 격상</div>
      <div class="sec tight"><ul>
        <li>앱스토어 직링크 → <strong>브릿지 웹페이지</strong>(<code style="font-family:var(--font-mono);font-size:13px;background:var(--cobalt-soft);padding:1px 6px;border-radius:3px;">bimil.covering.app</code> 외 자체 LP) — 가치를 납득한 유저만 다음 단계</li>
        <li>최적화 이벤트: <strong>앱 설치 → 구매(purchase)</strong> 격상 — Meta가 "설치할 사람"이 아니라 <em>"구매할 사람"</em>을 직접 학습</li>
        <li><strong>브릿지 10종 라인업</strong> — 범용(bimil) + 지역(천안·아산·대세종) + 친구 소구 + 대형 봉투(BULK30)</li>
      </ul></div>

      <div class="phase b3"><span class="ptag">결과</span>1/5 예산으로 CPA <b>절반</b>, 구매 CVR <b>2배</b>, ROAS <b>2.1배</b></div>
      <div class="sec tight"><ul>
        <li>같은 기간 동일 계정 — 일반 앱설치(33개) vs Web2App(9개): CPA <strong>₩15,191 → ₩7,316 (-51.8%)</strong> · CVR <strong>11.01% → 22.34% (+102.9%)</strong> · ROAS <strong>1.65x → 3.42x</strong></li>
        <li>광고비를 늘릴수록 효율이 떨어지던 구조를 깨고 — <strong>1/5 예산으로 14,114건</strong> 구매 만들며 볼륨을 키울 여력 확보</li>
      </ul></div>

      <div class="result">
        <div class="kpi"><span class="kpi-num">-51.8%</span><span class="kpi-label">CPA (₩15,191 → ₩7,316)</span></div>
        <div class="kpi"><span class="kpi-num">2.0×</span><span class="kpi-label">구매 CVR (11.01% → 22.34%)</span></div>
        <div class="kpi"><span class="kpi-num">2.1×</span><span class="kpi-label">ROAS (1.65x → 3.42x)</span></div>
      </div>
    </div>

    <div class="col-r">
      <!-- 결과물: 좌 브릿지 LP 3종 갤러리 + 우 핵심 레슨런 카드 -->
      <div style="display:grid;grid-template-columns:1.45fr 1fr;gap:14px;flex:none;height:432px;">
        <!-- Card #1: 브릿지 LP 3종 갤러리 (10종 중 대표 예시) -->
        <div style="background:#fff;border:1.5px solid var(--cobalt-border);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 4px 14px rgba(30,41,255,.10);">
          <div style="background:var(--cobalt);padding:9px 14px;font-family:var(--font-mono);font-size:11px;font-weight:800;color:#fff;letter-spacing:.08em;text-align:center;text-transform:uppercase;flex-shrink:0;">★ 브릿지 LP 10종 라인업 — 직접 기획·제작 (예시 3종)</div>
          <div style="flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:10px;background:#F8FAFF;">
            <div style="display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(15,25,50,.06);">
              <div style="background:var(--cobalt-soft);padding:5px 6px;font-family:var(--font-mono);font-size:9px;font-weight:800;color:var(--cobalt);letter-spacing:.04em;text-align:center;text-transform:uppercase;flex-shrink:0;">범용 · bimil</div>
              <div style="flex:1;min-height:0;position:relative;overflow:hidden;background:#fff;"><img src="./assets/bridge_lp_1.png" alt="범용 브릿지 LP — bimil.covering.app" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;display:block;"></div>
            </div>
            <div style="display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(15,25,50,.06);">
              <div style="background:var(--cobalt-soft);padding:5px 6px;font-family:var(--font-mono);font-size:9px;font-weight:800;color:var(--cobalt);letter-spacing:.04em;text-align:center;text-transform:uppercase;flex-shrink:0;">지역 · 천안·아산</div>
              <div style="flex:1;min-height:0;position:relative;overflow:hidden;background:#fff;"><img src="./assets/bridge_lp_2.png" alt="지역 한정 브릿지 LP — 천안·아산·대세종" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;display:block;"></div>
            </div>
            <div style="display:flex;flex-direction:column;background:#fff;border:1.5px solid var(--lime);border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(214,255,61,.22);">
              <div style="background:var(--lime);padding:5px 6px;font-family:var(--font-mono);font-size:9px;font-weight:800;color:var(--ink);letter-spacing:.04em;text-align:center;text-transform:uppercase;flex-shrink:0;">대형 봉투 · BULK30</div>
              <div style="flex:1;min-height:0;position:relative;overflow:hidden;background:#fff;"><img src="./assets/bridge_lp_3.png" alt="대형 봉투 브릿지 LP — BULK30" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;display:block;"></div>
            </div>
          </div>
        </div>

        <!-- Card #2: 레슨런 3-track 카드 -->
        <div style="background:var(--ink);border:1.5px solid var(--lime);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 6px 18px rgba(214,255,61,.18);">
          <div style="background:var(--lime);padding:9px 18px;font-family:var(--font-mono);font-size:11px;font-weight:800;color:var(--ink);letter-spacing:.1em;text-align:center;text-transform:uppercase;flex-shrink:0;">★ 운용 레슨런 — 무엇을 학습시키고, 어디서 거를 것인가</div>
          <div style="flex:1;padding:14px 18px;display:flex;flex-direction:column;gap:11px;justify-content:space-between;">
            <div style="display:flex;align-items:flex-start;gap:11px;">
              <div style="width:32px;height:32px;background:var(--cobalt);border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;color:#fff;font-weight:900;flex-shrink:0;">①</div>
              <div style="flex:1;min-width:0;">
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--lime);font-weight:800;letter-spacing:.12em;text-transform:uppercase;">학습 신호 격상</div>
                <div style="font-size:13.5px;color:#fff;font-weight:700;line-height:1.4;margin-top:2px;">최적화를 <strong style="color:var(--lime);">설치 → 구매</strong>로 격상하니 머신러닝이 구매 의향이 높은 유저를 학습 → CPA 절반</div>
              </div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:11px;">
              <div style="width:32px;height:32px;background:var(--cobalt);border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;color:#fff;font-weight:900;flex-shrink:0;">②</div>
              <div style="flex:1;min-width:0;">
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--lime);font-weight:800;letter-spacing:.12em;text-transform:uppercase;">랜딩에서 한 번 거르기</div>
                <div style="font-size:13.5px;color:#fff;font-weight:700;line-height:1.4;margin-top:2px;">직링크 대신 <strong style="color:var(--lime);">브릿지로 가치 납득한 유저만</strong> 진입 → 구매 CVR <strong style="color:var(--lime);">11.01% → 22.34%</strong></div>
              </div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:11px;">
              <div style="width:32px;height:32px;background:var(--cobalt);border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;color:#fff;font-weight:900;flex-shrink:0;">③</div>
              <div style="flex:1;min-width:0;">
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--lime);font-weight:800;letter-spacing:.12em;text-transform:uppercase;">라인업 분기로 타겟 커버리지 확장</div>
                <div style="font-size:13.5px;color:#fff;font-weight:700;line-height:1.4;margin-top:2px;">범용·지역(천안·아산·대세종)·친구 소구·대형 봉투(BULK30) 등 <strong style="color:var(--lime);">소구점별 10종</strong>으로 같은 머신러닝 풀에서 분기 학습</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 핵심 비교 표 — 일반 앱설치 vs Web2App (111일 동일 계정) -->
      <div class="chart-card" style="flex:none;display:flex;flex-direction:column;padding:14px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="chart-title" style="margin-bottom:0;">동일 기간·동일 계정 — 일반 앱설치 vs Web2App 브릿지</div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--sub);letter-spacing:.08em;">26.02.03~05.24 · 111일 · Meta omni_purchase</span>
        </div>
        <table style="width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;">
          <thead><tr>
            <th style="text-align:left;padding:7px 8px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;border-radius:6px 0 0 0;">구분</th>
            <th style="text-align:right;padding:7px 6px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;">광고비</th>
            <th style="text-align:right;padding:7px 6px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;">구매</th>
            <th style="text-align:right;padding:7px 6px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;">CPA</th>
            <th style="text-align:right;padding:7px 6px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;">CVR</th>
            <th style="text-align:right;padding:7px 8px;background:var(--ink);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#fff;border-radius:0 6px 0 0;">ROAS</th>
          </tr></thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--line-lt);">
              <td style="padding:9px 8px;font-size:11px;color:var(--text2);">일반 앱설치 <span style="color:var(--sub);font-size:9px;">(33개 캠페인)</span></td>
              <td style="text-align:right;padding:9px 6px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">₩529.2M</td>
              <td style="text-align:right;padding:9px 6px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">34,833건</td>
              <td style="text-align:right;padding:9px 6px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">₩15,191</td>
              <td style="text-align:right;padding:9px 6px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">11.01%</td>
              <td style="text-align:right;padding:9px 8px;font-size:11px;font-family:var(--font-mono);color:var(--text2);">1.65x</td>
            </tr>
            <tr style="background:#F4FBF7;border-bottom:1px solid var(--line-lt);">
              <td style="padding:9px 8px;font-size:11px;font-weight:800;color:var(--text);">★ Web2App 브릿지 <span style="color:var(--sub);font-size:9px;font-weight:500;">(9개)</span></td>
              <td style="text-align:right;padding:9px 6px;font-size:12px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">₩103.3M</td>
              <td style="text-align:right;padding:9px 6px;font-size:12px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">14,114건</td>
              <td style="text-align:right;padding:9px 6px;font-size:12px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">₩7,316</td>
              <td style="text-align:right;padding:9px 6px;font-size:12px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">22.34%</td>
              <td style="text-align:right;padding:9px 8px;font-size:12px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">3.42x</td>
            </tr>
            <tr>
              <td style="padding:9px 8px;font-size:11px;font-weight:800;color:var(--text);">개선</td>
              <td style="text-align:right;padding:7px 6px;"><span style="display:inline-block;background:#EEF1FF;color:#1E29FF;font-family:var(--font-mono);font-size:10px;font-weight:800;padding:3px 6px;border-radius:10px;">1/5 예산</span></td>
              <td style="text-align:right;padding:7px 6px;font-size:10px;font-family:var(--font-mono);color:var(--sub);">—</td>
              <td style="text-align:right;padding:7px 6px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:10px;font-weight:800;padding:3px 6px;border-radius:10px;">-51.8%</span></td>
              <td style="text-align:right;padding:7px 6px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:10px;font-weight:800;padding:3px 6px;border-radius:10px;">+102.9%</span></td>
              <td style="text-align:right;padding:7px 8px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:10px;font-weight:800;padding:3px 6px;border-radius:10px;">+107.6%</span></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:auto;padding-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--text2);line-height:1.5;">
          ✅ 같은 머신러닝 풀·같은 계정에서 동시 운영된 두 그룹의 격차 → <strong style="color:var(--text);">브릿지 + 구매 최적화 격상의 효과</strong>. CPA·CVR은 <code style="font-family:var(--font-mono);font-size:10px;background:var(--cobalt-soft);padding:1px 4px;border-radius:3px;">omni_purchase</code> 기준, ROAS는 AOV ₩25,000 가정 환산.
        </div>
      </div>
    </div>
  </div>
  <div class="chrome"><span><b>04</b> / 16</span><span>Performance · Web2App · CPA -51.8% / CVR 2× / ROAS 2.1×</span></div>
</div>'''

slide_blocks["p10"] = WEB2APP_SLIDE


# 슬라이드 총수가 NEW_ORDER에 따라 결정되므로 "NN / MM" → "NN / TOTAL" 로 동적.
# (v26 source가 다른 deck 빌드(_patch_v26.py)로 17 슬라이드 형태가 되어도 호환)
TOTAL = len(NEW_ORDER)
TOTAL_STR = page2(TOTAL)
for sid, new_pos in NEW_ORDER:
    block = slide_blocks[sid]

    # (a) slide-num pill: NN / MM → new_pos / TOTAL
    block = re.sub(
        r'(<span class="slide-num">)\d{2} / \d{2}(</span>)',
        rf"\g<1>{page2(new_pos)} / {TOTAL_STR}\g<2>",
        block,
    )
    # (b) chrome page number: <b>NN</b> / MM → <b>new_pos</b> / TOTAL
    block = re.sub(
        r"(<b>)\d{2}(</b> / )\d{2}(</span>)",
        rf"\g<1>{page2(new_pos)}\g<2>{TOTAL_STR}\g<3>",
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
    "콘텐츠로 만든 4,520만 → 18.9억 · 40배",
)

# h1 — replace entire headline text. Match the inner of <h1 ...>...</h1>.
cover = sub_once(
    cover,
    r"풀 퍼널 그로스로<br>\s*<span style=\"color:var\(--lime\);\">월 매출 4,520만 → 18\.9억,</span><br>\s*<span style=\"color:var\(--lime\);\">40배 성장</span>을 주도한<br>\s*브랜드 엑셀러레이터 <span style=\"color:var\(--lime\);\">이도형</span>입니다\.",
    "기획·촬영·편집까지 1인 제작한 콘텐츠로<br>"
    "<span style=\"color:var(--lime);\">월 매출 4,520만 → 18.9억,</span><br>"
    "<span style=\"color:var(--lime);\">40배 성장</span>을 만든<br>"
    "브랜드 엑셀러레이터 <span style=\"color:var(--lime);\">이도형</span>입니다.",
)

cover = sub_once(
    cover,
    r"Growth Marketing Portfolio · 2024 – 2026",
    "Content Marketing Portfolio · 2024 – 2026",
)

cover = sub_once(
    cover,
    r"소재 단위부터 CRM · 퍼포먼스 · 팀 빌딩까지, 전 채널 그로스를 직접 설계·실행",
    "Premiere · After Effects · Photoshop · Illustrator · Figma — 페인포인트 직접 발굴해 광고·LP·CRM 콘텐츠를 1인 제작",
)

slide_blocks["p1"] = cover

# --------------------------------------------------------------------------
# 5. Profile rebrand (p2) — performance angle
# --------------------------------------------------------------------------
profile = slide_blocks["p2"]

profile = sub_once(
    profile,
    r"콘텐츠, 퍼포먼스, CRM,<br>데이터 분석, 팀빌딩<br>\s*<span style=\"color:var\(--lime\);\">한 사람이 끝내는</span> 그로스 마케팅",
    "기획·촬영·편집·LP·<br>알림톡 카피까지<br>"
    "<span style=\"color:var(--lime);\">한 사람이 풀스택으로 만드는</span> 콘텐츠 마케팅",
)

profile = sub_once(
    profile,
    r"5년 4개월, 4개 회사를 거치며 <b style=\"color:#fff;font-weight:700;\">매번 0을 1로</b> 만들어왔습니다\.",
    "5년 4개월, 4개 회사를 거치며 <b style=\"color:#fff;font-weight:700;\">페인포인트 한 줄</b>로 광고·LP·CRM 콘텐츠를 직접 만들어왔습니다.",
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

new_card_order = ["콘텐츠", "바이럴", "퍼포먼스", "그로스", "CRM", "AI 활용"]

# 콘텐츠 카드 desc 보강: 1인 제작 · 페인포인트 강조
content_card = cards_by_name["콘텐츠"]
content_card = sub_once(
    content_card,
    r"기획·촬영·편집·세팅까지 1인 제작\. 구매 이벤트 40,499건",
    "기획·촬영·편집·세팅까지 1인 제작 · 구매 40,499건 · 페인포인트 한 줄로 매출 40배",
)
cards_by_name["콘텐츠"] = content_card

# 퍼포먼스 카드는 콘텐츠 마케터 톤에서도 '광고 매체 직접 운용' 정도로 정리
perf_card = cards_by_name["퍼포먼스"]
perf_card = sub_once(
    perf_card,
    r"Web2App 브릿지 · T-ROAS 정적가치\. AOS CVR 19\.47%",
    "Web2App LP 10종 · 직접 기획·제작한 브릿지로 CPA -51.8% · CVR 2배",
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
    '<div class="eyebrow">Content Capability · Content-first</div>',
)

# Chrome rebrand (keep page no left intact, only change right description).
cap = sub_once(
    cap,
    r"Capability · 7 Domains · Revenue ×40",
    "Content Capability · 7 Domains · Revenue ×40",
)

slide_blocks["p3"] = cap

# --------------------------------------------------------------------------
# 6.5 p4 (M1 등급제) — 그로스 → CRM 재분류
# --------------------------------------------------------------------------
m1 = slide_blocks["p4"]

# 헤더의 cat-chip을 '그로스 · CRM' 하이브리드 (그라데이션) 으로 교체
m1 = sub_once(
    m1,
    r'<span class="cat-chip" style="background:var\(--ca-growth\);"><span class="ko">그로스</span><span class="en">Growth</span></span>',
    '<span class="cat-chip" style="background:linear-gradient(90deg,var(--ca-growth),var(--ca-crm));"><span class="ko">그로스 · CRM</span><span class="en">Growth · Retention</span></span>',
)

# 좌측 tag-row의 c-badge "Growth · CRM" → "Growth · CRM · Retention" 그라데이션
m1 = sub_once(
    m1,
    r'<span class="c-badge" style="background:var\(--ca-growth\);">Growth · CRM</span>',
    '<span class="c-badge" style="background:linear-gradient(90deg,var(--ca-growth),var(--ca-crm));">Growth · CRM · Retention</span>',
)

# 하단 chrome 텍스트
m1 = sub_once(
    m1,
    r"Growth · Retention · M1 \+41%p",
    "Growth · CRM · M1 +41%p",
)

slide_blocks["p4"] = m1


# --------------------------------------------------------------------------
# 6.6 p6 (D45 CVR) — 그로스 → '그로스 · CRM' 하이브리드 chip
#     알림톡(CRM)으로 CVR(그로스 지표) 개선한 사례이므로 두 카테고리 동시 표기
# --------------------------------------------------------------------------
cvr = slide_blocks["p6"]

cvr = sub_once(
    cvr,
    r'<span class="cat-chip" style="background:var\(--ca-growth\);"><span class="ko">그로스</span><span class="en">Growth</span></span>',
    '<span class="cat-chip" style="background:linear-gradient(90deg,var(--ca-growth),var(--ca-crm));"><span class="ko">그로스 · CRM</span><span class="en">Growth · Retention</span></span>',
)

# tag-row 의 'Growth · CRM' badge도 그라데이션으로
cvr = sub_once(
    cvr,
    r'<span class="c-badge" style="background:var\(--ca-growth\);">Growth · CRM</span>',
    '<span class="c-badge" style="background:linear-gradient(90deg,var(--ca-growth),var(--ca-crm));">Growth · CRM · Retention</span>',
)

# chrome 텍스트
cvr = sub_once(
    cvr,
    r"Growth · CVR · D45 \+231%",
    "Growth · CRM · CVR D45 +231%",
)

slide_blocks["p6"] = cvr

# --------------------------------------------------------------------------
# 7. Update <title>
# --------------------------------------------------------------------------
preamble = sub_once(
    preamble,
    r"<title>이도형 그로스 마케터 포트폴리오 v26 — Cobalt Edge</title>",
    "<title>이도형 콘텐츠 마케터 포트폴리오 v28 — Content Edition</title>",
)

# v15 17-슬라이드 comment → v28 16-슬라이드
preamble = preamble.replace(
    "  v15  17-슬라이드 — Notion 피드백 반영",
    "  v28  16-슬라이드 — 콘텐츠 마케터 직무 재구성",
    1,
)

# --------------------------------------------------------------------------
# 8. Reassemble file in new order
# --------------------------------------------------------------------------
ordered_slides = [slide_blocks[sid] for sid, _ in NEW_ORDER]
out = preamble + "\n\n".join(ordered_slides) + tail
DST.write_text(out, encoding="utf-8")
print(f"wrote {DST} ({len(out):,} bytes, {out.count(chr(10)):,} lines)")

# 사용자 친화적 한글 alias — URL에서 직무가 한눈에 보이게
ALIAS = DST.parent / "이도형_콘텐츠마케터_포트폴리오.html"
ALIAS.write_text(out, encoding="utf-8")
print(f"wrote alias {ALIAS}")
