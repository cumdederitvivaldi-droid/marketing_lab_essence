# -*- coding: utf-8 -*-
"""
승인된 답글(out/drafts_approved.json)만 실제로 게시한다 (+ 하트/좋아요).

흐름: 게시물별로 좌측 행 클릭 → 답글 펼침 → 승인 댓글을 (작성자+본문)으로 찾아
      그 댓글의 '답글 달기' 클릭 → 답장창에 입력 → Enter 전송 → 좋아요(하트) 클릭.

안전장치:
  - 기본 dry-run (입력만, 전송/하트 안 함). 실게시는 --commit.
  - 답글 사이 8~25초 랜덤 지연 / 1회 최대 --limit(기본 10)건
  - 성공분은 state/replied.json 기록 → 재처리 금지

drafts_approved.json: [{ "platform":"meta", "comment_id":"...", "author":"...",
                         "comment_text":"...", "draft_reply":"...", "post_index":N }, ...]
"""
import sys, os, time, argparse, random
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
import scrape_comments as sc

# 댓글을 (작성자+본문)으로 찾아 '답글 달기' 클릭 + 하트버튼 좌표 반환
JS_FIND_AND_OPEN_REPLY = r"""
(arg) => {
  const {author, prefix} = arg;
  const replyEls=[...document.querySelectorAll('*')].filter(
    e=>e.childElementCount===0 && (e.innerText||'').trim()==='답글 달기');
  for(const r of replyEls){
    let c=r;
    for(let d=0; d<8 && c; d++){ c=c.parentElement;
      if(c && c.querySelector('a[role="link"]') && c.querySelector('abbr')) break; }
    if(!c) continue;
    const a=c.querySelector('a[role="link"]');
    if(!a || a.innerText.trim()!==author) continue;
    if(prefix && !(c.innerText||'').includes(prefix)) continue;
    // 하트 버튼: 시간(abbr) 근처의 작은 button
    const ab=c.querySelector('abbr'); const ay = ab? ab.getBoundingClientRect().y : null;
    let like=null, best=1e9;
    for(const b of c.querySelectorAll('button')){
      const br=b.getBoundingClientRect();
      if(br.width>0 && br.width<=22 && br.height<=22){
        const dist = ay!==null ? Math.abs(br.y-ay) : 0;
        if(dist<best){ best=dist; like={x:br.x+br.width/2, y:br.y+br.height/2}; }
      }
    }
    r.click();   // 답글 입력창 포커스
    return {found:true, like};
  }
  return {found:false};
}
"""


def human_delay():
    time.sleep(random.uniform(8, 25))


def _reply_and_like(page, d, commit, done):
    """현재 게시물에 열린 상태에서 d(승인 답글)를 찾아 답장+하트."""
    reply = d["draft_reply"].strip()
    prefix = (d.get("comment_text", "") or "")[:15]
    res = page.evaluate(JS_FIND_AND_OPEN_REPLY, {"author": d["author"], "prefix": prefix})
    if not res.get("found"):
        return False
    page.wait_for_timeout(800)
    ta = page.locator(sc.SEL_META_REPLY_BOX)
    if ta.count() == 0:
        return False
    ta.first.click()
    ta.first.fill(reply)
    page.wait_for_timeout(600)
    if not commit:
        ta.first.fill("")
        print(f"    [DRY] {d['author']}: {reply[:38]} (하트={'O' if res.get('like') else 'X'})")
        return True
    ta.first.press("Enter")                       # 답글 전송
    page.wait_for_timeout(1500)
    if res.get("like"):                            # 하트(좋아요)
        page.mouse.click(res["like"]["x"], res["like"]["y"])
        page.wait_for_timeout(600)
    print(f"    [OK] {d['author']}: {reply[:38]} +하트")
    done.append(d["comment_id"])
    cdp.add_replied([d["comment_id"]])             # 즉시 기록(크래시 대비 중복방지)
    return True


def _process_visible(page, by_cid, commit, limit, done):
    """현재 화면에 보이는 게시물 행들을 돌며 매칭 답글 게시. 처리한 건수 반환."""
    posted = 0
    boxes = page.evaluate(sc.JS_META_ROW_BOXES)
    for b in boxes:
        if len(done) >= limit:
            break
        page.mouse.click(b["x"] + min(150, b["w"] / 3), b["y"] + b["h"] / 2)
        page.wait_for_timeout(1200)
        # 대형 게시물: 댓글 더 불러오기 + 답글 펼치기를 반복하며 매칭분 게시
        for _ in range(12):
            if len(done) >= limit:
                break
            parsed = page.evaluate(sc.JS_META_PARSE_POST, sc.BRAND)
            for c in parsed:
                if len(done) >= limit:
                    break
                key = sc.cid("meta", c["author"], c["text"])
                d = by_cid.get(key)
                if not d or key in done:
                    continue
                try:
                    if _reply_and_like(page, d, commit, done):
                        posted += 1
                        if commit:
                            human_delay()
                except Exception as e:
                    print(f"    · 오류 {d['author']}: {e}")
            more = page.evaluate(sc.JS_LOAD_MORE_COMMENTS)
            exp = page.evaluate(sc.JS_EXPAND_REPLIES)
            if more == 0 and exp == 0:
                break
            page.wait_for_timeout(1200)
    return posted


def post_meta(page, drafts, commit, limit, done):
    """대화목록을 자동 스크롤하며 모든 게시물의 매칭 답글을 (작성자+본문)으로 찾아 답장+하트."""
    by_cid = {d["comment_id"]: d for d in drafts}
    page.wait_for_timeout(2000)
    page.evaluate("() => { const c=document.querySelector('[role=\"gridcell\"][aria-label=\"완료로 이동\"]'); if(c) c.scrollIntoView(); }")
    no_progress = 0
    round_i = 0
    while len(done) < limit and no_progress < 3:
        round_i += 1
        before = len(done)
        _process_visible(page, by_cid, commit, limit, done)
        sc_res = page.evaluate(sc.JS_SCROLL_LIST)
        page.wait_for_timeout(1500)
        gained = len(done) - before
        print(f"  · [스크롤 {round_i}] 이번 라운드 +{gained}건 (누적 {len(done)}) atBottom={sc_res.get('atBottom')}")
        if gained == 0 and (sc_res.get("atBottom") or not sc_res.get("scrolled")):
            no_progress += 1
        else:
            no_progress = 0


def post_tiktok(page, drafts, commit, limit, done):
    """TikTok 댓글 프레임에서 (작성자+본문) 매칭 → 답글 입력+전송+하트."""
    by_cid = {d["comment_id"]: d for d in drafts}
    # 댓글 페이지로 보장 이동 후 iframe(댓글 프레임) 로딩 대기
    if "business-suite/comments" not in (page.url or ""):
        page.goto(sc.TIKTOK_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(3000)
    frame = None
    for _ in range(8):
        frame = sc.tt_frame(page)
        if frame:
            break
        page.wait_for_timeout(1500)
    if not frame:
        print("  · TikTok 댓글 프레임 없음(로그인/로딩 확인)")
        return
    for _ in range(3):
        try:
            if frame.evaluate(sc.JS_TT_EXPAND) == 0:
                break
        except Exception:
            break
        page.wait_for_timeout(800)

    parsed = frame.evaluate(sc.JS_TT_PARSE, sc.TT_BRAND)
    for c in parsed:
        if len(done) >= limit:
            break
        key = sc.cid("tiktok", c["author"], c["text"])
        d = by_cid.get(key)
        if not d or key in done:
            continue
        reply = d["draft_reply"].strip()
        prefix = (d.get("comment_text", "") or "")[:12]
        try:
            res = frame.evaluate(sc.JS_TT_OPEN_REPLY, {"author": d["author"], "prefix": prefix})
            if not res.get("found"):
                print(f"    · 못 찾음: {d['author']}: {prefix}")
                continue
            page.wait_for_timeout(900)
            if not commit:
                print(f"    [DRY] {d['author']}: {reply[:34]} (하트={'O' if res.get('like') else 'X'})")
                continue
            frame.click(sc.TT_SEL_INPUT)                 # 입력창 포커스
            page.wait_for_timeout(400)
            page.keyboard.type(reply, delay=40)          # 답글 입력
            page.wait_for_timeout(500)
            frame.click(sc.TT_SEL_POST)                  # 전송
            page.wait_for_timeout(1500)
            if res.get("like"):                          # 댓글 하트
                page.mouse.click(res["like"]["x"], res["like"]["y"])
                page.wait_for_timeout(500)
            print(f"    [OK] {d['author']}: {reply[:34]} +하트")
            done.append(key)
            cdp.add_replied([key])
            human_delay()
        except Exception as e:
            print(f"    · 오류 {d['author']}: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="실제 게시+하트 (미지정 시 dry-run)")
    ap.add_argument("--limit", type=int, default=10)
    args = ap.parse_args()

    approved = cdp.load_json(cdp.DRAFTS_APPROVED_JSON, [])
    if not approved:
        raise SystemExit("out/drafts_approved.json 이 비어있습니다.")
    approved = [d for d in approved if d.get("draft_reply", "").strip()]
    # 이미 처리한 댓글(state/replied.json)은 중복 게시 방지로 제외
    already = cdp.load_replied()
    skipped = [d for d in approved if d["comment_id"] in already]
    approved = [d for d in approved if d["comment_id"] not in already]
    if skipped:
        print(f"(이미 처리됨 {len(skipped)}건 제외)")
    print(f"{'[실게시+하트]' if args.commit else '[DRY-RUN]'} 승인 {len(approved)}건 (limit={args.limit})\n")

    pw, browser = cdp.connect()
    ctx = cdp.get_context(browser)
    done = []
    try:
        meta = [d for d in approved if d.get("platform") == "meta"]
        if meta:
            print("[Meta] 게시 중...")
            page = sc.find_page(ctx, sc.META_URL_HINT, sc.META_URL, must_contain="inbox")
            post_meta(page, meta, args.commit, args.limit, done)
        tiktok = [d for d in approved if d.get("platform") == "tiktok"]
        if tiktok:
            print("[TikTok] 게시 중...")
            tt_page = sc.find_page(ctx, sc.TIKTOK_URL_HINT, sc.TIKTOK_URL)
            post_tiktok(tt_page, tiktok, args.commit, args.limit, done)

        if args.commit and done:
            cdp.add_replied(done)
            print(f"\n게시 완료 {len(done)}건 → state/replied.json 기록")
        elif not args.commit:
            print("\nDRY-RUN 종료. 이상 없으면 --commit 으로 소량(--limit 2~3)부터 실게시하세요.")
    finally:
        pw.stop()


if __name__ == "__main__":
    main()
