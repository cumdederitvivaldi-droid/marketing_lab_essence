"""Build preview HTML containing a single 1920×1080 slide for the iOS ODM insight.
- Re-uses v26's <head>/<style> so the slide visually matches v26/v27 deck slides.
- Outputs to portfolio/preview-ios-odm-slide.html
- 1 slide → set <title> + the single .slide block.
"""
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "이도형_포트폴리오_v26.html"
DST = HERE / "preview-ios-odm-slide.html"

src = SRC.read_text(encoding="utf-8")
head_end = src.find("</style>") + len("</style>")
head = src[:head_end]
# preserve the body opening + class+wrapping that v26 uses
body_open_idx = src.find("<body>")
between = src[head_end:body_open_idx]

# Replace <title>
head = head.replace(
    "<title>이도형 그로스 마케터 포트폴리오 v26 — Cobalt Edge</title>",
    "<title>iOS ODM 연동으로 구매 유저 +86% — v26/v27 포트폴리오용 신규 슬라이드 미리보기</title>",
)

SLIDE = """<div class="slide" id="p_ios_odm">
  <div class="grid-bg light"></div>
  <div class="hd-tight">
    <div>
      <div class="cat-row">
        <span class="cat-chip" style="background:var(--ca-perf);"><span class="ko">퍼포먼스</span><span class="en">Performance · iOS UA</span></span>
        <span class="cat-meta"><b>NEW</b> · iOS ODM</span>
      </div>
      <div class="page-title">막혔던 구글애즈 iOS를 다시 연 <em>ODM 연동</em> — 구매 유저 <em>+86.5%</em> · 구글애즈 <em>×106배</em></div>
    </div>
    <span class="slide-num">NEW / 16</span>
  </div>

  <div class="body2">
    <div class="col-l">
      <div class="tag-row">
        <span class="c-badge" style="background:var(--ca-perf);">Performance · Google Ads · iOS UA</span>
        <span class="c-badge outline">커버링 · 2026.03 ODM 연동 · 변곡점 25.12 · 12개월 추세</span>
      </div>
      <div class="p-title">iOS는 AOS 대비 LTV 최대 <em>4.6배</em>인데<br>가장 큰 채널에서 한 명도 데려올 수 없었다</div>

      <div class="phase b1"><span class="ptag">병목</span>ATT 이후 IDFA 막힘 + 구글 ODM 미설정 — iOS 학습 신호 0</div>
      <div class="sec tight"><ul>
        <li>구글애즈 머신러닝이 학습할 <em>iOS 전환 신호</em>가 없어 <strong>iOS 모객 전면 불가</strong> · 매월 수천만원 기회손실</li>
        <li>마케팅 단독으로는 못 푸는 <strong>앱 단 개발 작업</strong>이라 백로그에 계속 밀림 → 손실 비용을 데이터로 제시해 개발·제품팀 설득</li>
      </ul></div>

      <div class="phase b2"><span class="ptag">실행</span>① ODM 정식 연동 + ② iOS 고효율 소재 핏</div>
      <div class="sec tight"><ul>
        <li><strong>① 구글애즈 ODM 연동 (2026.03)</strong> — 개발·제품팀 협업으로 정식 연동, 막혔던 구글애즈 iOS 캠페인 가동</li>
        <li><strong>② iOS 고효율 소재 핏 (25.09~)</strong> — 대형폐기물·가구·가전·엄마 소구를 채널 간 이식 · 30초 숏폼 위주 <strong>2주 단위 교체</strong></li>
        <li>준비/진행 중인 다음 레버 — ③ 측정 인프라(딥링크 포스트백·SKAN) · ④ ATT 동의 프리보딩 · ⑤ 유튜브 직접 컨택</li>
      </ul></div>

      <div class="phase b3"><span class="ptag">결과</span>변곡점(25.12) 전후 6개월 — 구매 유저 <b>+86.5%</b>, 구매 건수 <b>+82.3%</b></div>
      <div class="sec tight"><ul>
        <li>월평균 iOS 구매 유저 <strong>17,400 → 32,451명 (+86.5%)</strong> · 구매 건수 합계 <strong>251,539 → 458,460건 (+82.3%)</strong></li>
        <li>현재(26.05) <strong>41,833명 — 역대 최고치</strong> (출시 저점 9,280명 대비 4.5배), 계속 우상향</li>
        <li>같은 기간 신규 설치는 +36.3% → <strong>구매 유저가 설치보다 2.4배 빠르게</strong> 늘었다 (질이 함께 좋아짐)</li>
      </ul></div>

      <div class="result">
        <div class="kpi"><span class="kpi-num">+86.5%</span><span class="kpi-label">iOS 구매 유저 월평균 (17,400 → 32,451명)</span></div>
        <div class="kpi"><span class="kpi-num">×106</span><span class="kpi-label">구글애즈 iOS 구매 유저 (15 → 1,595명)</span></div>
        <div class="kpi"><span class="kpi-num">41,833명</span><span class="kpi-label">26.05 역대 최고치 · 저점 대비 4.5배</span></div>
      </div>
    </div>

    <div class="col-r">
      <!-- 상단: 12개월 막대 차트 (25.06 ~ 26.05) — 변곡점(25.12) 강조 -->
      <div class="chart-card" style="flex:none;display:flex;flex-direction:column;padding:14px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div class="chart-title" style="margin-bottom:0;">iOS 월별 구매 유저 — 25.06 9,280명 → 26.05 41,833명 · 4.5배 성장</div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--sub);letter-spacing:.06em;">★ 변곡점 25.12 · ODM 26.03</span>
        </div>
        <svg viewBox="0 0 720 280" width="100%" style="display:block;">
          <defs>
            <linearGradient id="b_pre" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8B95A6"/><stop offset="100%" stop-color="#C7CBE3"/></linearGradient>
            <linearGradient id="b_post" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1E29FF"/><stop offset="100%" stop-color="#7C90FF"/></linearGradient>
          </defs>
          <!-- y grid (max 45000, y range 30-230 = 200) -->
          <line x1="60" y1="30" x2="700" y2="30" stroke="#F1F4F9"/><text x="55" y="34" font-size="10" fill="#8B95A6" text-anchor="end" font-family="JetBrains Mono">45K</text>
          <line x1="60" y1="80" x2="700" y2="80" stroke="#F1F4F9"/><text x="55" y="84" font-size="10" fill="#8B95A6" text-anchor="end" font-family="JetBrains Mono">33K</text>
          <line x1="60" y1="130" x2="700" y2="130" stroke="#F1F4F9"/><text x="55" y="134" font-size="10" fill="#8B95A6" text-anchor="end" font-family="JetBrains Mono">22K</text>
          <line x1="60" y1="180" x2="700" y2="180" stroke="#F1F4F9"/><text x="55" y="184" font-size="10" fill="#8B95A6" text-anchor="end" font-family="JetBrains Mono">11K</text>
          <line x1="60" y1="230" x2="700" y2="230" stroke="#E2E6EF" stroke-width="1.5"/>

          <!-- variables: each bar width 38, gap 14, total 12 bars from x=70 to x=694
               y = 230 - val * (200/45000) = 230 - val * 0.004444
               25-06 9280 → y=188.7
               25-07 16519 → y=156.3
               25-08 18166 → y=149.3
               25-09 18531 → y=147.6
               25-10 20943 → y=136.9
               25-11 20960 → y=136.8
               25-12 25387 → y=117.1 (★ 변곡점)
               26-01 26915 → y=110.3
               26-02 28821 → y=101.8
               26-03 33993 → y=78.9 (ODM 연동)
               26-04 37755 → y=62.2
               26-05 41833 → y=44.1 -->
          <rect x="70" y="188.7" width="38" height="41.3" rx="3" fill="url(#b_pre)"/>
          <rect x="122" y="156.3" width="38" height="73.7" rx="3" fill="url(#b_pre)"/>
          <rect x="174" y="149.3" width="38" height="80.7" rx="3" fill="url(#b_pre)"/>
          <rect x="226" y="147.6" width="38" height="82.4" rx="3" fill="url(#b_pre)"/>
          <rect x="278" y="136.9" width="38" height="93.1" rx="3" fill="url(#b_pre)"/>
          <rect x="330" y="136.8" width="38" height="93.2" rx="3" fill="url(#b_pre)"/>
          <!-- 변곡점 25-12 -->
          <rect x="382" y="117.1" width="38" height="112.9" rx="3" fill="url(#b_post)"/>
          <rect x="434" y="110.3" width="38" height="119.7" rx="3" fill="url(#b_post)"/>
          <rect x="486" y="101.8" width="38" height="128.2" rx="3" fill="url(#b_post)"/>
          <!-- ODM 연동 26-03 -->
          <rect x="538" y="78.9" width="38" height="151.1" rx="3" fill="url(#b_post)"/>
          <rect x="590" y="62.2" width="38" height="167.8" rx="3" fill="url(#b_post)"/>
          <rect x="642" y="44.1" width="38" height="185.9" rx="3" fill="#0F19D8"/>

          <!-- vertical markers -->
          <line x1="376" y1="26" x2="376" y2="230" stroke="#B3DA1C" stroke-width="1.4" stroke-dasharray="3,4"/>
          <rect x="334" y="9" width="84" height="16" rx="3" fill="#0A0F2E"/>
          <text x="376" y="21" font-size="10" fill="#D6FF3D" font-weight="800" text-anchor="middle" font-family="JetBrains Mono">★ 25.12 변곡점</text>
          <line x1="532" y1="26" x2="532" y2="230" stroke="#1E29FF" stroke-width="1.4" stroke-dasharray="3,4"/>
          <rect x="492" y="9" width="80" height="16" rx="3" fill="#1E29FF"/>
          <text x="532" y="21" font-size="10" fill="#fff" font-weight="800" text-anchor="middle" font-family="JetBrains Mono">↑ 26.03 ODM</text>

          <!-- value labels (key bars) -->
          <text x="89" y="184" font-size="9" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">9.3K</text>
          <text x="349" y="132" font-size="9" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">21K</text>
          <text x="401" y="112" font-size="10.5" fill="#0F19D8" font-weight="900" text-anchor="middle" font-family="JetBrains Mono">25.4K</text>
          <text x="557" y="73" font-size="10.5" fill="#0F19D8" font-weight="900" text-anchor="middle" font-family="JetBrains Mono">34.0K</text>
          <text x="661" y="38" font-size="12" fill="#0F19D8" font-weight="900" text-anchor="middle" font-family="JetBrains Mono">41.8K ★</text>

          <!-- x labels -->
          <text x="89" y="248" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">25.06</text>
          <text x="141" y="248" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">07</text>
          <text x="193" y="248" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">08</text>
          <text x="245" y="248" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">09</text>
          <text x="297" y="248" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">10</text>
          <text x="349" y="248" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">11</text>
          <text x="401" y="248" font-size="10" fill="#0F172A" font-weight="800" text-anchor="middle" font-family="JetBrains Mono">25.12</text>
          <text x="453" y="248" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">26.01</text>
          <text x="505" y="248" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">02</text>
          <text x="557" y="248" font-size="10" fill="#0F172A" font-weight="800" text-anchor="middle" font-family="JetBrains Mono">03</text>
          <text x="609" y="248" font-size="10" fill="#5B6675" text-anchor="middle" font-family="JetBrains Mono">04</text>
          <text x="661" y="248" font-size="10" fill="#0F19D8" font-weight="800" text-anchor="middle" font-family="JetBrains Mono">05</text>

          <!-- bottom legend -->
          <rect x="60" y="258" width="640" height="18" rx="4" fill="#0A0F2E"/>
          <text x="380" y="271" font-size="11" fill="#D6FF3D" text-anchor="middle" font-family="JetBrains Mono" font-weight="800">★ 가속 전 6개월 평균 17,400명 → 가속 후 6개월 평균 32,451명 (+86.5%) · 신규 설치는 +36% 만큼만 → 질이 함께 좋아짐</text>
        </svg>
      </div>

      <!-- 하단: 채널별 비교 표 — ODM 효과의 또렷한 증거 -->
      <div class="chart-card" style="flex:1;min-height:0;display:flex;flex-direction:column;padding:14px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="chart-title" style="margin-bottom:0;">채널별 iOS 구매 유저 — 변곡점 전후 6개월 (Airbridge 실측)</div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--sub);letter-spacing:.08em;">25.06~11 vs 25.12~26.05</span>
        </div>
        <table style="width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;">
          <thead><tr>
            <th style="text-align:left;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;border-radius:6px 0 0 0;">채널 (iOS)</th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;">가속 전 6개월</th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;">가속 후 6개월</th>
            <th style="text-align:right;padding:8px 10px;background:var(--ink);font-family:var(--font-mono);font-size:11px;font-weight:700;color:#fff;border-radius:0 6px 0 0;">증감</th>
          </tr></thead>
          <tbody>
            <tr style="background:#F4FBF7;border-bottom:1px solid var(--line-lt);">
              <td style="padding:9px 10px;font-size:13px;font-weight:800;color:var(--text);">★ 구글애즈 <span style="font-size:11px;color:var(--sub);font-weight:500;">(ODM 연동)</span></td>
              <td style="text-align:right;padding:9px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">15명</td>
              <td style="text-align:right;padding:9px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">1,595명</td>
              <td style="text-align:right;padding:9px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">×106 (약 106배)</span></td>
            </tr>
            <tr style="border-bottom:1px solid var(--line-lt);">
              <td style="padding:9px 10px;font-size:13px;color:var(--text);">애플 서치애즈 (ASA)</td>
              <td style="text-align:right;padding:9px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">3,398명</td>
              <td style="text-align:right;padding:9px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">9,660명</td>
              <td style="text-align:right;padding:9px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">+184%</span></td>
            </tr>
            <tr style="border-bottom:1px solid var(--line-lt);">
              <td style="padding:9px 10px;font-size:13px;color:var(--text);">인스타그램</td>
              <td style="text-align:right;padding:9px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">172명</td>
              <td style="text-align:right;padding:9px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text2);">1,578명</td>
              <td style="text-align:right;padding:9px 10px;"><span style="display:inline-block;background:#E3F7ED;color:#0E9E76;font-family:var(--font-mono);font-size:11px;font-weight:800;padding:3px 8px;border-radius:11px;">+817%</span></td>
            </tr>
            <tr>
              <td style="padding:9px 10px;font-size:13px;color:var(--text);">메타 (페이스북)</td>
              <td style="text-align:right;padding:9px 10px;font-size:11px;font-family:var(--font-mono);color:var(--sub);">비교 제한*</td>
              <td style="text-align:right;padding:9px 10px;font-size:13px;font-family:var(--font-mono);font-weight:800;color:#0E9E76;">13,516명</td>
              <td style="text-align:right;padding:9px 10px;font-size:11px;font-family:var(--font-mono);color:var(--sub);">—</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:auto;padding-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--text2);line-height:1.5;">
          ✅ <strong style="color:var(--text);">ODM은 "광고를 더 쓴 것"이 아니라 "쓸 수 없던 채널을 쓸 수 있게 만든" 액션.</strong> 메타 단일 의존 → 4채널 분산. <span style="color:var(--sub);">*메타 페이스북은 매체 정책상 180일 이전 데이터가 0으로 집계되어 전 기간 비교 불가.</span>
        </div>
      </div>
    </div>
  </div>
  <div class="chrome"><span><b>NEW</b> / 16</span><span>Performance · iOS UA · ODM · 구매 유저 +86.5% · 구글애즈 ×106</span></div>
</div>"""

out = head + between + "<body>\n" + SLIDE + "\n</body>\n</html>\n"
DST.write_text(out, encoding="utf-8")
print(f"wrote {DST} ({len(out):,} chars, {out.count(chr(10)):,} lines)")
