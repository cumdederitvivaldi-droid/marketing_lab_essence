const MIXPANEL_TOKEN = "b39d7d89c68e7ebf1d5ff67d396f4802";
const MIXPANEL_URL = "https://api.mixpanel.com/track";

/**
 * Mixpanel 서버사이드 이벤트 전송 (fire-and-forget)
 *
 * @param event - 이벤트명 (예: "[EVENT] SpotBookingComplete")
 * @param properties - 이벤트 속성 (sessionId 필수)
 * @param insertId - 중복 방지용 ID (기본: sessionId_event)
 */
export function trackEvent(
  event: string,
  properties: Record<string, unknown>,
  insertId?: string,
): void {
  const sessionId = (properties.sessionId as string) ?? "unknown";

  fetch(MIXPANEL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/plain" },
    body: JSON.stringify([
      {
        event,
        properties: {
          token: MIXPANEL_TOKEN,
          time: Math.floor(Date.now() / 1000),
          distinct_id: sessionId,
          $insert_id: insertId ?? `${sessionId}_${event}`,
          source: "covering_talk",
          ...properties,
        },
      },
    ]),
  }).catch(() => {});
}
