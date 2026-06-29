'use client';

import { useEffect } from 'react';

const TRACKING_PARAMS = [
  'airbridge_referrer',
  'utm_source',
  'utm_campaign',
  'utm_medium',
  'utm_content',
  'utm_term',
];

// Airbridge 단축링크 redirect 시 자동으로 붙는 트래킹 query를 제거한다.
// Mixpanel SDK는 페이지 로드 시점에 utm을 super property로 캡처하므로
// 분석 데이터는 보존되며, 사용자가 보는 주소창 URL만 깔끔하게 정리된다.
export default function UrlCleanup() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Mixpanel SDK init + trackInviterView 등 다른 컴포넌트의 useEffect가
    // URL의 utm/airbridge_referrer를 먼저 캡처할 수 있도록 다음 task로 미룬다.
    // 그렇지 않으면 sibling mount 순서상 cleanup이 먼저 일어나 분석 이벤트에
    // utm 정보가 누락된다.
    const timeoutId = setTimeout(() => {
      const url = new URL(window.location.href);
      let cleaned = false;
      TRACKING_PARAMS.forEach((p) => {
        if (url.searchParams.has(p)) {
          url.searchParams.delete(p);
          cleaned = true;
        }
      });
      if (cleaned) {
        window.history.replaceState(window.history.state, '', url.toString());
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  return null;
}
