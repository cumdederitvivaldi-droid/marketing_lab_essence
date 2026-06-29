# -*- coding: utf-8 -*-
"""
디버그 크롬에 CDP로 붙어 Meta(인스타 광고 인박스) 댓글을 '개별 댓글 단위'로 수집한다.

Meta 모델 (라이브 검증):
  - 인박스 'Instagram 댓글' 좌측 = 게시물(광고) 단위 행. 클릭하면 우측에 그 게시물의 댓글 스레드 전체.
  - 각 댓글 컨테이너: 작성자 a[role=link] + abbr.livetimestamp(시간) + '답글 달기' + 좋아요 button(16px).
  - '답글 보기(N)'을 펼치면 대댓글(답글)이 들여쓰기되어 보인다 → covering__official 답글 여부 판별.

출력 out/comments.json: 미답글(커버링이 아직 답글 안 단) 댓글만, 게시물별로.

사용:
  python scrape_comments.py
  python scrape_comments.py --snapshot   # 디버그 덤프
"""
import sys, os, time, json, hashlib, argparse
_usersite = os.path.join(os.environ.get("APPDATA", ""), "Python", "Python312", "site-packages")
if os.path.isdir(_usersite) and _usersite not in sys.path:
    sys.path.insert(0, _usersite)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cdp
import config

BRAND = config.CFG["brand_handle"]            # 우리 계정 핸들 (Meta/인스타)
TT_BRAND = config.CFG["tiktok_brand_handle"]  # 우리 계정 핸들 (TikTok)

META_URL_HINT = "business.facebook.com"
META_URL = config.CFG["meta_inbox_url"]
TIKTOK_URL_HINT = "tiktok.com"
TIKTOK_URL = config.CFG["tiktok_comments_url"]

SEL_META_REPLY_BOX = 'textarea[placeholder="댓글 달기..."]'

# 좌측 게시물 행 박스
JS_META_ROW_BOXES = r"""
() => {
  const cells = [...document.querySelectorAll('[role="gridcell"][aria-label="완료로 이동"]')];
  const boxes = [];
  for (const c of cells) { let row=c;
    for (let d=0; d<8 && row; d++){ row=row.parentElement;
      if (row && row.getBoundingClientRect().width > 300) break; }
    const r = row ? row.getBoundingClientRect() : null;
    if (r && r.width>300 && r.height>30) boxes.push({x:r.x,y:r.y,w:r.width,h:r.height}); }
  boxes.sort((a,b)=>a.y-b.y);
  const uniq=[]; for(const b of boxes) if(!uniq.some(u=>Math.abs(u.y-b.y)<10)) uniq.push(b);
  return uniq;
}
"""

# 좌측 대화목록(가상 스크롤) 한 단계 아래로 스크롤. {scrolled, atBottom} 반환.
JS_SCROLL_LIST = r"""
() => {
  const cell = document.querySelector('[role="gridcell"][aria-label="완료로 이동"]');
  let el = cell;
  while (el) {
    const s = getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) break;
    el = el.parentElement;
  }
  if (!el) return {scrolled:false, atBottom:true};
  const before = el.scrollTop;
  el.scrollTop = before + Math.round(el.clientHeight * 0.8);
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 5;
  return {scrolled: el.scrollTop > before + 2, atBottom};
}
"""

# '답글 보기' 펼치기 (여러 번 호출). 실제 토글은 role 없는 <button>(span 자식) 형태.
JS_EXPAND_REPLIES = r"""
() => {
  const re=/^(답글\s*\d+개\s*(모두\s*)?보기|답글 보기\(\d+\)|이전 답글 보기|View all \d+ replies|View \d+ replies|View replies)$/;
  const els=[...document.querySelectorAll('button,span,div[role="button"],a')]
    .filter(e=>e.querySelectorAll('*').length<=2 && re.test((e.textContent||'').trim()));
  let n=0;
  els.forEach(e=>{ try{e.click(); n++;}catch(_){} });
  return n;
}
"""

# 우측 스레드에서 '지금보다 댓글 많이 보기(N개)' 등 더 불러오기 클릭 (대형 게시물용)
JS_LOAD_MORE_COMMENTS = r"""
() => {
  const re=/(지금보다 댓글 많이 보기|이전 댓글 보기|댓글 더 보기|댓글 \d+개 더 보기|View (more|previous) comments|Show more comments)/;
  const els=[...document.querySelectorAll('button,span,div[role="button"],a')]
    .filter(e=>e.querySelectorAll('*').length<=2 && re.test((e.textContent||'').trim()));
  let n=0; els.forEach(e=>{ try{e.click(); n++;}catch(_){} });
  return n;
}
"""

# 선택된 게시물의 개별 댓글 파싱 (들여쓰기로 부모/답글 구분, 커버링 답글 여부 판별)
JS_META_PARSE_POST = r"""
(BRAND) => {
  // 댓글 컨테이너 후보: '답글 달기'를 품고 작성자 링크가 있는 최소 블록
  const replyEls=[...document.querySelectorAll('*')].filter(
    e=>e.childElementCount===0 && (e.innerText||'').trim()==='답글 달기');
  const seen=new Set(), comments=[];
  for(const r of replyEls){
    let c=r;
    for(let d=0; d<8 && c; d++){ c=c.parentElement;
      if(c && c.querySelector('a[role="link"]') && c.querySelector('abbr')) break; }
    if(!c || seen.has(c)) continue; seen.add(c);
    const a=c.querySelector('a[role="link"]');
    const ab=c.querySelector('abbr');
    if(!a) continue;
    const author=a.innerText.trim();
    const rect=a.getBoundingClientRect();
    // 본문 정제: 줄바꿈→공백 후, 작성자 핸들/시간/버튼/더보기 토큰 제거.
    //   (텍스트가 줄바꿈 없이 뭉친 컨테이너도 깨끗한 컨테이너와 같은 결과가 되어 중복 자동 병합)
    let s=(c.innerText||'').replace(/\s+/g,' ').trim();
    while(author && s.startsWith(author)) s=s.slice(author.length).trim();
    const metaRe=/(좋아요\s*[\d,]+개|답글 달기|답글 보기\(\d+\)|답글\s*\d+개\s*(모두\s*)?보기|지금보다 댓글 많이 보기\(\d+\)|이전 답글 보기|Send message|Message|관리|더 보기|[0-9]+\s*(초|분|시간|일|주|개월|년)\s*전?|어제|그제|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2})/g;
    s=s.replace(metaRe,' ').replace(/\s+/g,' ').trim();
    if(ab){ const at=ab.getAttribute('aria-label')||'', it=ab.innerText.trim();
            if(at) s=s.split(at).join(' '); if(it) s=s.split(it).join(' ');
            s=s.replace(/\s+/g,' ').trim(); }
    const text=s.slice(0,300);
    // 좋아요(하트) 버튼: 컨테이너 내 16~20px 정도의 button
    let likeBtn=false;
    for(const b of c.querySelectorAll('button')){ const br=b.getBoundingClientRect();
      if(br.width>0 && br.width<=22 && br.height<=22){ likeBtn=true; break; } }
    comments.push({author, text, time: ab?ab.getAttribute('aria-label'):'',
                   indentX: Math.round(rect.x), y: Math.round(rect.y),
                   hasLikeBtn: likeBtn});
  }
  // y 정렬 후 들여쓰기로 부모/답글 그룹핑
  comments.sort((p,q)=>p.y-q.y);
  if(comments.length===0) return [];
  const minX=Math.min(...comments.map(c=>c.indentX));
  const out=[]; let cur=null;
  for(const c of comments){
    const isTop = c.indentX <= minX+12;
    if(isTop){ cur={...c, replies:[]}; out.push(cur); }
    else if(cur){ cur.replies.push(c); }
  }
  // 커버링 답글 여부
  for(const t of out){
    t.coveringReplied = t.replies.some(r=>r.author===BRAND) || t.author===BRAND;
  }
  return out.filter(t=>t.author!==BRAND);  // 우리 글 자체는 제외
}
"""


# ── TikTok (business-suite/comments) ─────────────────────
# 댓글 UI는 iframe(@.../video/...) 안에 있고 data-e2e 마커가 안정적이다.
TT_SEL_INPUT = '[data-e2e="comment-input"]'
TT_SEL_POST = '[data-e2e="comment-post"]'

# 'TikTok 댓글 프레임' = comment-input 을 가진 프레임
def tt_frame(page):
    for f in page.frames:
        try:
            if f.query_selector(TT_SEL_INPUT):
                return f
        except Exception:
            continue
    return None

# 접힌 답글 펼치기
JS_TT_EXPAND = r"""
() => {
  const re=/^(답글 보기|답글\s*\d+개\s*(더\s*)?보기|이전 답글|View \d+ repl|View replies)/;
  const els=[...document.querySelectorAll('p,span,div[role="button"],button,a')]
    .filter(e=>e.querySelectorAll('*').length<=2 && re.test((e.textContent||'').trim()));
  let n=0; els.forEach(e=>{ try{e.click(); n++;}catch(_){} });
  return n;
}
"""

# 현재 프레임의 댓글 파싱 (comment-level 로 부모/대댓글 구분, 커버링 답글 여부 판별)
JS_TT_PARSE = r"""
(BRAND) => {
  const timeRe = /(초|분|시간|일|주|개월|년)\s*전|어제|그제|\d{4}-\d{1,2}-\d{1,2}/;
  const all=[]; const seen=new Set();
  for(const u of document.querySelectorAll('[data-e2e^="comment-username-"]')){
    let c=u; for(let d=0; d<6 && c; d++){ c=c.parentElement;
      if(c && c.querySelector('[data-e2e^="comment-reply-"]')) break; }
    if(!c || seen.has(c)) continue; seen.add(c);
    const author=u.innerText.trim();
    const lvlEl=c.querySelector('[data-e2e^="comment-level-"]');
    const level=lvlEl ? parseInt((lvlEl.getAttribute('data-e2e').split('-').pop())||'1') : 1;
    const lines=(c.innerText||'').split('\n').map(s=>s.trim()).filter(Boolean);
    let text='';
    for(let i=0;i<lines.length;i++){
      if(lines[i]===author) continue;
      if(timeRe.test(lines[i])) break;
      if(/^(답글|좋아요|[\d,]+)$/.test(lines[i])) continue;
      text=lines[i]; break;
    }
    all.push({author, text, level, y: Math.round(u.getBoundingClientRect().y)});
  }
  all.sort((a,b)=>a.y-b.y);
  // 부모(level1)에 후속 대댓글(level>1) 묶기
  const out=[]; let cur=null;
  for(const x of all){
    if(x.level<=1){ cur={...x, replies:[]}; out.push(cur); }
    else if(cur){ cur.replies.push(x); }
  }
  for(const t of out) t.coveringReplied = t.author===BRAND || t.replies.some(r=>r.author===BRAND);
  return out.filter(t=>t.author!==BRAND);
}
"""


# (작성자+본문)으로 댓글을 찾아 '답글' 버튼 클릭 + 댓글 하트 좌표 반환
JS_TT_OPEN_REPLY = r"""
(arg) => {
  const {author, prefix} = arg;
  for(const u of document.querySelectorAll('[data-e2e^="comment-username-"]')){
    if(u.innerText.trim() !== author) continue;
    let c=u; for(let d=0; d<6 && c; d++){ c=c.parentElement;
      if(c && c.querySelector('[data-e2e^="comment-reply-"]')) break; }
    if(!c) continue;
    if(prefix && !(c.innerText||'').includes(prefix)) continue;
    const uy = u.getBoundingClientRect().y;
    // 댓글 하트: username 행 근처(±40px)의 작은 svg (영상 좋아요 컨테이너 제외)
    let like=null, best=1e9;
    for(const s of c.querySelectorAll('svg')){
      if(s.closest('[class*="DivLikeContainer" i]')) continue;
      const r=s.getBoundingClientRect();
      if(r.width>0 && r.width<=18){
        const dist=Math.abs(r.y-uy);
        if(dist<best && dist<60){ best=dist; like={x:r.x+r.width/2, y:r.y+r.height/2}; }
      }
    }
    const rb=c.querySelector('[data-e2e^="comment-reply-"]');
    rb.click();
    return {found:true, like};
  }
  return {found:false};
}
"""


def cid(platform, author, text):
    h = hashlib.sha1(f"{platform}|{author}|{text}".encode("utf-8")).hexdigest()[:16]
    return f"{platform}:{h}"


def find_page(context, hint, fallback_url, must_contain=None):
    for p in context.pages:
        url = p.url or ""
        if hint in url and (must_contain is None or must_contain in url):
            return p
    p = context.new_page()
    p.goto(fallback_url, wait_until="domcontentloaded", timeout=60000)
    return p


def snapshot(page, name):
    try:
        page.wait_for_timeout(4000)
        (cdp.OUT_DIR / f"debug_{name}.html").write_text(page.content(), encoding="utf-8")
        page.screenshot(path=str(cdp.OUT_DIR / f"debug_{name}.png"), full_page=True)
        print(f"  · 덤프 저장: out/debug_{name}.html / .png")
    except Exception as e:
        print(f"  · [경고] {name} 스냅샷 실패: {e}")


def scrape_meta(page):
    page.wait_for_timeout(2500)
    boxes = page.evaluate(JS_META_ROW_BOXES)
    print(f"  · 게시물 행 {len(boxes)}개")
    all_comments, seen = [], set()
    for i, b in enumerate(boxes):
        cx, cy = b["x"] + min(150, b["w"] / 3), b["y"] + b["h"] / 2
        try:
            page.mouse.click(cx, cy)
            page.wait_for_timeout(1200)
            # 접힌 답글 펼치기 (반복: 중첩 답글까지)
            for _ in range(4):
                n = page.evaluate(JS_EXPAND_REPLIES)
                if n == 0:
                    break
                page.wait_for_timeout(1100)
            comments = page.evaluate(JS_META_PARSE_POST, BRAND)
            post_url = page.url
            for c in comments:
                if not c["text"]:
                    continue
                key = cid("meta", c["author"], c["text"])
                if key in seen:
                    continue
                seen.add(key)
                all_comments.append({
                    "platform": "meta",
                    "comment_id": key,
                    "author": c["author"],
                    "text": c["text"],
                    "time": c.get("time", ""),
                    "covering_replied": c.get("coveringReplied", False),
                    "has_like_btn": c.get("hasLikeBtn", False),
                    "post_index": i,
                    "permalink": post_url,
                })
            n_new = sum(1 for c in comments if not c.get("coveringReplied"))
            print(f"    [게시물 {i}] 댓글 {len(comments)}개 (미답글 {n_new})")
        except Exception as e:
            print(f"    [게시물 {i}] 실패: {e}")
    return all_comments


def scrape_tiktok(page):
    url = page.url or ""
    if "/login" in url or "/signup" in url:
        print("  · [건너뜀] TikTok 로그인 필요")
        return []
    if "business-suite/comments" not in url:
        try:
            page.goto(TIKTOK_URL, wait_until="domcontentloaded", timeout=60000)
        except Exception:
            pass
    page.wait_for_timeout(3000)
    frame = None
    for _ in range(8):
        frame = tt_frame(page)
        if frame:
            break
        page.wait_for_timeout(1500)
    if not frame:
        print("  · [건너뜀] TikTok 댓글 프레임을 못 찾음(댓글 화면 로딩/로그인 확인)")
        return []
    # 접힌 답글 펼치기
    for _ in range(3):
        try:
            if frame.evaluate(JS_TT_EXPAND) == 0:
                break
        except Exception:
            break
        page.wait_for_timeout(900)
    try:
        parsed = frame.evaluate(JS_TT_PARSE, TT_BRAND)
    except Exception as e:
        print(f"  · TikTok 파싱 실패: {e}")
        return []
    out, seen = [], set()
    for c in parsed:
        if not c["text"]:
            continue
        key = cid("tiktok", c["author"], c["text"])
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "platform": "tiktok",
            "comment_id": key,
            "author": c["author"],
            "text": c["text"],
            "time": "",
            "covering_replied": c.get("coveringReplied", False),
            "has_like_btn": True,
            "post_index": 0,
            "permalink": frame.url,
        })
    n_new = sum(1 for c in parsed if not c.get("coveringReplied"))
    print(f"  · TikTok 댓글 {len(parsed)}개 (미답글 {n_new})")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", action="store_true")
    ap.add_argument("--include-replied", action="store_true",
                    help="커버링이 이미 답글한 댓글도 포함(기본은 제외)")
    args = ap.parse_args()

    pw, browser = cdp.connect()
    ctx = cdp.get_context(browser)
    try:
        meta_page = find_page(ctx, META_URL_HINT, META_URL, must_contain="inbox")
        tt_page = find_page(ctx, TIKTOK_URL_HINT, TIKTOK_URL)

        if args.snapshot:
            print("[스냅샷 모드]")
            snapshot(meta_page, "meta")
            snapshot(tt_page, "tiktok")
            return

        comments = []
        print("[Meta] 댓글 수집 중...")
        try:
            comments += scrape_meta(meta_page)
        except Exception as e:
            print(f"  [경고] Meta 실패: {e}")
        print("[TikTok] 댓글 수집 중...")
        try:
            comments += scrape_tiktok(tt_page)
        except Exception as e:
            print(f"  [경고] TikTok 실패: {e}")

        replied = cdp.load_replied()
        fresh = []
        for c in comments:
            if c["comment_id"] in replied:
                continue
            if c["covering_replied"] and not args.include_replied:
                continue   # 커버링이 이미 답글한 댓글 제외
            fresh.append(c)

        cdp.save_json(cdp.COMMENTS_JSON, fresh)
        n_total = len(comments)
        n_skip_cov = sum(1 for c in comments if c["covering_replied"])
        print(f"\n수집: 총 {n_total}건 / 커버링 기답글 {n_skip_cov}건 제외 / 처리대상 {len(fresh)}건 → out/comments.json")
    finally:
        pw.stop()


if __name__ == "__main__":
    main()
