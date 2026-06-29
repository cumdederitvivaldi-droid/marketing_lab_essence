import type { Order } from "@/lib/store/orders";

function getCoveringUrl() {
  const url = process.env.COVERING_SUPABASE_URL;
  if (!url) throw new Error("COVERING_SUPABASE_URL 환경변수가 설정되지 않았습니다");
  return url;
}

function getCoveringKey() {
  const key = process.env.COVERING_SUPABASE_KEY;
  if (!key) throw new Error("COVERING_SUPABASE_KEY 환경변수가 설정되지 않았습니다");
  return key;
}

function formatPhoneWithHyphen(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function parseSingleTime(raw: string, inheritPeriod?: string): string | null {
  const s = raw.trim();

  const hhmm = s.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) {
    let hour = parseInt(hhmm[1], 10);
    const min = hhmm[2];
    const period = s.match(/(오전|오후)/)?.[1] || inheritPeriod;
    if (period === "오후" && hour < 12) hour += 12;
    if (period === "오전" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${min}`;
  }

  const korMatch = s.match(/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (korMatch) {
    const period = korMatch[1] || inheritPeriod;
    let hour = parseInt(korMatch[2], 10);
    const min = korMatch[3] ? parseInt(korMatch[3], 10) : 0;
    if (period === "오후" && hour < 12) hour += 12;
    if (period === "오전" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  return null;
}

export function convertTimeSlot(timeSlot: string): string {
  if (!timeSlot) return "10:00";

  if (/^\d{1,2}:\d{2}(~\d{1,2}:\d{2})?$/.test(timeSlot.trim())) {
    return timeSlot.trim();
  }

  const parts = timeSlot.split(/[~～]/);
  if (parts.length === 2) {
    const periodMatch = parts[0].match(/(오전|오후)/);
    const period = periodMatch?.[1];
    const start = parseSingleTime(parts[0]);
    const end = parseSingleTime(parts[1], period);
    if (start && end) return `${start}~${end}`;
    if (start) return start;
  }

  const single = parseSingleTime(timeSlot);
  if (single) return single;

  return "10:00";
}

async function coveringFetch(path: string, options: RequestInit = {}) {
  const baseUrl = getCoveringUrl();
  const apiKey = getCoveringKey();
  const url = `${baseUrl}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return res;
}

// 방문수거 상담사 답변 시 외부 covering Supabase 로 order 동기화 (현재 유일 활성 경로)
export async function sendToCovering(
  order: Order
): Promise<{ id: string } | null> {
  const items = (order.items || []).map((it) => ({
    category: it.category,
    name: it.name,
    displayName: it.displayName,
    price: it.price,
    quantity: it.quantity,
    loadingCube: it.volume ?? 0,
  }));

  const body: Record<string, unknown> = {
    customer_name: order.customerName,
    phone: formatPhoneWithHyphen(order.phone),
    address: order.address,
    address_detail: order.floor ? `${order.floor}층` : "",
    date: order.date || "",
    time_slot: convertTimeSlot(order.timeSlot),
    area: "",
    items,
    total_price: order.totalPrice || 0,
    estimate_min: order.totalPrice || 0,
    estimate_max: order.totalPrice || 0,
    crew_size: order.crewSize || 1,
    status: "in_progress",
    has_elevator: order.hasElevator ?? false,
    has_parking: order.hasParking ?? false,
    has_ground_access: order.hasGroundAccess ?? true,
    need_ladder: order.needLadder ?? false,
    ladder_type: null,
    ladder_hours: null,
    ladder_price: order.ladderFee || 0,
    memo: order.memo || "",
    photos: order.photos || [],
    total_loading_cube: order.totalVolume || 0,
    final_price: order.totalPrice || 0,
    confirmed_time: convertTimeSlot(order.timeSlot) || null,
    source: "covering_talk",
    agreed_to_terms: true,
    agreed_to_privacy: true,
  };

  console.log(`[covering] sendToCovering → date="${body.date}", time_slot="${body.time_slot}", confirmed_time="${body.confirmed_time}"`);

  const res = await coveringFetch("bookings", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[covering] INSERT 실패:", res.status, errText);
    return null;
  }

  const data = await res.json();
  const row = Array.isArray(data) ? data[0] : data;
  console.log(`[covering] INSERT 성공: ${row.id}`);
  return { id: row.id };
}
