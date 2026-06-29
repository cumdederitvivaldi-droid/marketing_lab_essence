type EventName =
  // ROUTE - 화면 진입
  | "[ROUTE] SpotHomeScreen"
  | "[ROUTE] SpotBookingScreen"
  | "[ROUTE] SpotBookingCompleteScreen"
  | "[ROUTE] SpotBookingManageScreen"
  | "[ROUTE] SpotPhoneScreen"
  // CLICK - 유저 액션
  | "[CLICK] SpotHomeScreen_cta"
  | "[CLICK] SpotHomeScreen_carousel"
  | "[CLICK] SpotHomeScreen_priceTab"
  | "[CLICK] SpotHomeScreen_bookingBtn"
  | "[CLICK] SpotHomeScreen_faqOpen"
  | "[CLICK] SpotHomeScreen_phoneSubmit"
  | "[CLICK] SpotHomeScreen_phoneNav"
  | "[CLICK] SpotBookingScreen_kakaoBtn"
  | "[CLICK] SpotBookingScreen_nextStep"
  | "[CLICK] SpotBookingScreen_selectItem"
  | "[CLICK] SpotBookingScreen_uploadPhoto"
  | "[CLICK] SpotBookingScreen_submit"
  | "[CLICK] SpotBookingEditScreen_submit"
  | "[CLICK] SpotBookingManageScreen_cancel"
  | "[CLICK] SpotBookingManageScreen_confirm"
  | "[CLICK] SpotBookingManageScreen_edit"
  | "[CLICK] SpotBookingManageScreen_reschedule"
  // VIEW - 노출
  | "[VIEW] SpotBookingScreen_quotePreview"
  | "[VIEW] SpotBookingScreen_step"
  | "[VIEW] SpotScrollDepth"
  | "[VIEW] SpotHomeScreen_compareSection"
  // EVENT - 결과
  | "[EVENT] SpotBookingComplete"
  | "[EVENT] SpotBookingCancel"
  | "[EVENT] SpotBookingSearchResult"
  | "[EVENT] SpotBookingUserConfirm"
  | "[EVENT] SpotPhoneLeadSubmit"
  // EVENT - 날짜/시간 선택
  | "[EVENT] SpotBookingDateSelected"
  | "[EVENT] SpotBookingTimeSelected";

interface EventProps {
  "[CLICK] SpotHomeScreen_cta": { location:
    | "hero"
    | "price"
    | "floating"
    | "bottom"
    | "nav"
    | "funnel"
    | "consult"
    | "after_consult" };
  "[CLICK] SpotBookingScreen_kakaoBtn": { location: "funnel" };
  "[CLICK] SpotHomeScreen_bookingBtn": { location: "hero" | "price" | "floating" | "bottom" };
  "[CLICK] SpotHomeScreen_carousel": { type: "scroll" | "arrow" | "dot"; direction?: "left" | "right" };
  "[CLICK] SpotHomeScreen_priceTab": { item: string };
  "[CLICK] SpotHomeScreen_faqOpen": { question: string; index: number };
  "[CLICK] SpotBookingScreen_nextStep": { step: number; stepName: string };
  "[CLICK] SpotBookingScreen_selectItem": { category: string; name: string; price: number };
  "[CLICK] SpotBookingScreen_uploadPhoto": { count: number };
  "[CLICK] SpotBookingScreen_submit": { itemCount: number; estimatedTotal: number };
  "[CLICK] SpotBookingEditScreen_submit": { itemCount: number; estimatedTotal: number };
  "[CLICK] SpotBookingManageScreen_confirm": { bookingId: string };
  "[CLICK] SpotBookingManageScreen_cancel": { bookingId: string; reason?: string };
  "[CLICK] SpotBookingManageScreen_edit": { bookingId: string };
  "[EVENT] SpotBookingUserConfirm": { bookingId: string };
  "[CLICK] SpotBookingManageScreen_reschedule": { bookingId: string };
  "[VIEW] SpotBookingScreen_quotePreview": { itemCount: number; total: number };
  "[VIEW] SpotBookingScreen_step": { step: number; stepName: string };
  "[VIEW] SpotScrollDepth": { depth: 25 | 50 | 75 | 100 };
  "[EVENT] SpotBookingComplete": { bookingId: string };
  "[EVENT] SpotBookingCancel": { bookingId: string; reason?: string };
  "[EVENT] SpotBookingSearchResult": { found: number };
  "[EVENT] SpotBookingDateSelected": { date: string };
  "[EVENT] SpotBookingTimeSelected": { time: string; date: string };
  "[CLICK] SpotHomeScreen_phoneSubmit": {
    hasItemsNote: boolean;
    hasMemo: boolean;
  };
  "[EVENT] SpotPhoneLeadSubmit": {
    hasItemsNote: boolean;
    hasMemo: boolean;
  };
  "[CLICK] SpotHomeScreen_phoneNav": {
    location: "hero" | "floating" | "nav" | "success_card";
  };
}

declare global {
  interface Window {
    mixpanel?: {
      __loaded?: boolean;
      track: (event: string, props?: object) => void;
      identify: (userId: string) => void;
      people?: { set: (props: object) => void };
    };
  }
}

function getExperimentVariant(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const result: Record<string, string> = {};
  const matches = document.cookie.matchAll(/ab_([^=]+)=([^;]+)/g);
  for (const match of matches) {
    result[`experiment_${match[1]}`] = match[2];
  }
  return result;
}

export function track<T extends EventName>(
  event: T,
  properties?: T extends keyof EventProps ? EventProps[T] : never
) {
  if (typeof window === "undefined") return;

  // 세션 소스 (Airbridge ad_group → 배너 유입 식별)
  let spotSource: string | undefined;
  try {
    spotSource = sessionStorage.getItem("spot_source") ?? undefined;
  } catch { /* sessionStorage 접근 실패 무시 */ }

  // 세션 ID (유니크 유저 집계용, sessionStorage 기반)
  let sessionId: string | undefined;
  try {
    const KEY = "spot_sid";
    sessionId = sessionStorage.getItem(KEY) ?? undefined;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(KEY, sessionId);
    }
  } catch {
    sessionId = `anon_${Math.random().toString(36).slice(2)}`;
  }

  const props = {
    ...properties,
    session_id: sessionId,
    ...(spotSource ? { source: spotSource } : {}),
    ...getExperimentVariant(),
    timestamp: Date.now(),
    url: window.location.href,
  };

  // Mixpanel
  try {
    if (window.mixpanel?.__loaded) {
      window.mixpanel.track(event, props);
    }
  } catch { /* Mixpanel 초기화 경쟁 조건 등 오류 무시 */ }
}

export function identify(userId: string, props?: { phone?: string; name?: string }) {
  if (typeof window === "undefined") return;
  try {
    if (window.mixpanel) {
      window.mixpanel.identify(userId);
      if (props) {
        window.mixpanel.people?.set({
          ...(props.phone && { $phone: props.phone }),
          ...(props.name && { $name: props.name }),
        });
      }
    }
  } catch { /* Mixpanel 오류 무시 */ }
}
