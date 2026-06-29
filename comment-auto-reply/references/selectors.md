# Meta / TikTok 댓글 화면 셀렉터 메모

> Meta/TikTok은 클래스명이 난독화(해시)되고 UI가 자주 바뀐다.
> `python scripts/scrape_comments.py --snapshot` 으로 `out/debug_meta.html` /
> `out/debug_tiktok.html` 를 떠서, 실제 DOM을 보고 아래 셀렉터를 보정한다.
> 보정한 값은 scrape_comments.py 의 `SEL_*`, post_replies.py 의 `SEL_*` 에 반영.

## 셀렉터 찾는 팁
- 가능하면 `data-*`, `aria-label`, `role`, `dir="auto"` 같이 **안정적인 속성**으로 잡는다.
- 난독화된 `class="x1y2z3"` 같은 건 곧 바뀌므로 피한다.
- 텍스트 기반(`:has-text("답글")`)이 클래스보다 오래 버틸 때가 많다.

## Meta (인스타 광고 인박스) — ✅ 라이브 검증 완료
구조: 좌측에 대화행이 세로로 나열(가상 스크롤). 행 클릭 → 우측에 해당 댓글 + 답장창 렌더.
- **대화행**: `[role="gridcell"][aria-label="완료로 이동"]` 을 품은 조상(폭>300px) = 한 행.
  (scrape_comments.py `JS_META_ROW_BOXES` 에서 박스 좌표 추출 후 mouse.click 으로 선택)
- **선택 댓글 읽기**: 답장창(textarea) 위로 올라가 `답글 달기` 포함 블록의 innerText 라인 파싱.
  라인 = [작성자, 본문…, 시간, "답글 달기", "Send message", "관리"]. (`JS_META_SELECTED`)
  잡음 줄: `좋아요 N개`, `…댓글 보기`, `(요일) 오전/오후 …`, `covering__official`(자기 게시물) → 필터.
- **답장 입력창(SEL_META_REPLY_BOX)**: `textarea[placeholder="댓글 달기..."]` (선택된 대화에 1개)
- **전송**: 입력창에서 **Enter** 로 게시(파란 화살표 버튼도 옆에 있음). 명시적 send aria-label 없음.
- 주의: listitem 20개 = 좌측 앱 네비(댓글 아님). role=row 22개 = 행별 호버 액션버튼(완료/후속조치).
- 남은 보정: 댓글 매우 많은 게시물(예 183개)은 스레드 스크롤 안 해서 ~20개만 수집(부분 커버리지).

### 개별 댓글 / 커버링 답글 / 하트 (✅ 검증)
- **개별 댓글 컨테이너**: `답글 달기`(자식없는 요소) → 상위로 올라가 `a[role=link]`(작성자)+`abbr`(시간) 가진 최소 블록.
- **작성자**: 컨테이너 내 `a[role="link"]`. **시간**: `abbr[aria-label]`(예 "7주 전") / `abbr.livetimestamp`.
- **하트(좋아요) 버튼**: 컨테이너 내 `<button>` 중 16~22px 크기, abbr(시간) 옆에 위치. aria-label 없음.
- **답글 펼치기('답글 보기(N)')**: role 없는 `<button>`(span 자식). 셀렉터는 `button` 포함 + textContent 매칭 필수.
- **커버링 답글 감지**: 펼친 뒤 작성자 링크 x좌표로 들여쓰기 판별 — 최상위 x≈571, 답글 x≈620(+49px).
  최상위 댓글의 답글 중 author=`covering__official` 있으면 기답글 → 제외. (post 작성자도 covering__official이라 단순 텍스트매칭 금지, 반드시 들여쓰기 그룹핑)
- **답장 전송**: '답글 달기' 클릭 → textarea 포커스 → 입력 → **Enter**.

## TikTok (business-suite/comments) — ⏳ 로그인 대기
- 현재 전용 프로필에서 TikTok 미로그인(`/login`, `/signup/policy-confirm` 으로 리다이렉트).
- 로그인 완료 후 `scrape_comments.py --snapshot` 으로 out/debug_tiktok.html 떠서 보정 예정.
- 댓글 항목/작성자/본문/답글버튼/입력창/전송: _기입 대기_

## 변경 이력
- 2026-06-22 Meta 라이브 검증 완료(댓글 12건 읽기 성공, 답장창 입력 확인). TikTok 로그인 대기.
