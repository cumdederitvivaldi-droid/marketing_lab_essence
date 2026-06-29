/**
 * 서비스 지역 조회 모듈
 *
 * 고객 주소(동/구/도로명)로 서비스 가능 여부 확인.
 * 도로명/지번 주소는 Haiku로 행정동 변환 후 DB 매칭.
 */

import { createMessage } from "@/lib/ai/ai-client";
import { supabase } from "@/lib/supabase/client";

export interface ServiceAreaResult {
  found: boolean;
  available: boolean;
  province?: string;
  city?: string;
  pickup_days?: string;
  matched_dong?: string;
  normalized_address?: string;
  message: string;
}

interface ServiceAreaRow {
  id: number;
  province: string;
  city: string;
  pickup_days: string;
  unavailable_dongs: string;
  available_dongs: string;
  note: string;
}

/**
 * Sonnet으로 주소를 행정동/구 형태로 정규화
 * 법정동→행정동 변환도 포함 (예: 송정동→상대동)
 */
async function normalizeAddress(
  rawAddress: string
): Promise<{ province: string; city: string; dong: string } | null> {
  try {
    const resp = await createMessage({
      model: "sonnet",
      max_tokens: 300,
      system: "",
      messages: [
        {
          role: "user",
          content: `한국 주소를 행정구역으로 변환해줘. 도로명/지번/법정동/행정동 등 다양한 형태가 올 수 있어.

입력: "${rawAddress}"

⭐ 중요: 법정동과 행정동이 다른 경우가 많아. 반드시 행정동으로 변환해줘.
예시:
- 대전 유성구 송정동 → 행정동은 "전민동" (송정동은 법정동)
- 대전 유성구 봉명동 → 행정동은 "온천1동" 또는 "온천2동"
- 대전 유성구 궁동 → 행정동은 "온천2동"
- 대전 유성구 장대동 → 행정동은 "온천1동"
- 대전 유성구 도룡동 → 행정동은 "전민동"
- 대전 유성구 용계동 → 행정동은 "진잠동" (용계동은 법정동)
- 대전 유성구 가정동 → 행정동은 "진잠동"
- 대전 유성구 세동 → 행정동은 "진잠동"
- 대전 유성구 원내동 → 행정동은 "진잠동"
- 대전 유성구 교촌동 → 행정동은 "진잠동"
- 대전 유성구 성북동 → 행정동은 "진잠동"
- 서울 강남구 역삼동 → 행정동도 "역삼동" (동일)
- 성남시 분당구 수내동 → 행정동도 "수내동" (동일)

아래 JSON 형식으로만 응답해. 설명 없이 JSON만.
- province: 도/광역시/특별시. DB 매칭용이니 아래 형식 정확히 따를 것:
  서울 → "서울 특별시"
  경기 → "경기도"
  인천 → "인천 광역시"
  대전 → "대전 광역시"
  세종 → "충청도"
  충북/충남 → "충청도"
  청주 → "청주시" (province에 "청주시" 넣기)
- city: 시/구 (예: "강남구", "수원시", "천안", "유성구", "상당구", "세종")
- dong: 행정동 (법정동이 아닌 행정동으로 변환. 예: "전민동", "온천1동"). 모르면 빈 문자열.
- 동 이름에서 "동" 빼지 말 것.

{"province":"","city":"","dong":""}`,
        },
      ],
    });

    const text = resp.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      province: parsed.province?.trim() || "",
      city: parsed.city?.trim() || "",
      dong: parsed.dong?.trim() || "",
    };
  } catch (err) {
    console.error("[service-area] address normalize error:", err);
    return null;
  }
}

/**
 * 서비스 지역 조회 메인 함수
 */
export async function lookupServiceArea(
  address: string
): Promise<ServiceAreaResult> {
  // 1. 주소 정규화 (Haiku)
  const normalized = await normalizeAddress(address);
  if (!normalized || (!normalized.province && !normalized.city)) {
    return {
      found: false,
      available: false,
      message: `"${address}" 주소를 인식하지 못했습니다. 동/구/시 이름으로 다시 알려주시면 확인해 드릴게요 😊`,
    };
  }

  // 2. DB에서 매칭
  const { data: rows } = await supabase
    .from("service_areas")
    .select("id, province, city, pickup_days, unavailable_dongs, available_dongs, note")
    .eq("is_active", true) as { data: ServiceAreaRow[] | null };

  if (!rows || rows.length === 0) {
    return {
      found: false,
      available: false,
      message: "서비스 지역 데이터가 아직 준비되지 않았습니다.",
    };
  }

  // 3. province + city 매칭 (공백 제거하여 비교: "대전광역시" = "대전 광역시")
  const norm = (s: string) => s.replace(/\s/g, "");
  const matched = rows.filter((r) => {
    const provMatch =
      !normalized.province ||
      norm(r.province).includes(norm(normalized.province)) ||
      norm(normalized.province).includes(norm(r.province));

    const cityMatch =
      r.city === "전지역" ||
      norm(r.city).includes(norm(normalized.city)) ||
      norm(normalized.city).includes(norm(r.city));

    return provMatch && cityMatch;
  });

  if (matched.length === 0) {
    return {
      found: false,
      available: false,
      normalized_address: `${normalized.province} ${normalized.city} ${normalized.dong}`.trim(),
      message: `${normalized.province} ${normalized.city}${normalized.dong ? " " + normalized.dong : ""} 지역은 현재 커버링 서비스 지역이 아닙니다 😥\n서비스 확장 시 안내드리겠습니다!`,
    };
  }

  const area = matched[0];

  // 서울 전지역 같은 경우
  if (area.available_dongs === "전 지역" || area.available_dongs === "전지역") {
    return {
      found: true,
      available: true,
      province: area.province,
      city: area.city,
      pickup_days: area.pickup_days,
      matched_dong: normalized.dong || "전 지역",
      normalized_address: `${normalized.province} ${normalized.city} ${normalized.dong}`.trim(),
      message: `${area.province} ${area.city}${normalized.dong ? " " + normalized.dong : ""}은(는) 서비스 가능 지역입니다! 😊\n수거 가능 요일: ${area.pickup_days}`,
    };
  }

  // 동 단위 매칭 필요
  if (normalized.dong) {
    // 불가능 지역 체크
    if (isDongInList(normalized.dong, area.unavailable_dongs)) {
      return {
        found: true,
        available: false,
        province: area.province,
        city: area.city,
        matched_dong: normalized.dong,
        normalized_address: `${normalized.province} ${normalized.city} ${normalized.dong}`.trim(),
        message: `${area.province} ${area.city} ${normalized.dong}은(는) 현재 서비스 불가능 지역입니다 😥\n서비스 확장 시 안내드리겠습니다!`,
      };
    }

    // 가능 지역 체크
    if (isDongInList(normalized.dong, area.available_dongs)) {
      return {
        found: true,
        available: true,
        province: area.province,
        city: area.city,
        pickup_days: area.pickup_days,
        matched_dong: normalized.dong,
        normalized_address: `${normalized.province} ${normalized.city} ${normalized.dong}`.trim(),
        message: `${area.province} ${area.city} ${normalized.dong}은(는) 서비스 가능 지역입니다! 😊\n수거 가능 요일: ${area.pickup_days}`,
      };
    }

    // available/unavailable 어디에도 없지만 시/구가 매칭됨 → 서비스 가능으로 안내 (목록에 없는 법정동일 수 있음)
    return {
      found: true,
      available: true,
      province: area.province,
      city: area.city,
      pickup_days: area.pickup_days,
      matched_dong: normalized.dong,
      normalized_address: `${normalized.province} ${normalized.city} ${normalized.dong}`.trim(),
      message: `${area.province} ${area.city} ${normalized.dong}은(는) 서비스 가능 지역입니다! 😊\n수거 가능 요일: ${area.pickup_days}\n※ 일부 지역은 서비스가 제한될 수 있으니, 앱에서 정확한 서비스 가능 여부를 확인해주세요.`,
    };
  }

  // 동 정보 없이 시/구만 매칭
  return {
    found: true,
    available: true,
    province: area.province,
    city: area.city,
    pickup_days: area.pickup_days,
    normalized_address: `${normalized.province} ${normalized.city}`.trim(),
    message: `${area.province} ${area.city}은(는) 서비스 가능 지역입니다! 😊\n수거 가능 요일: ${area.pickup_days}\n※ 일부 행정동은 서비스 불가능할 수 있으니, 정확한 동 이름을 알려주시면 확인해 드릴게요!`,
  };
}

/**
 * 동 이름이 콤마 구분 리스트에 포함되는지 확인
 * "평내동" in "남양주시 평내동, 별내동, 퇴계원읍" → true
 */
function isDongInList(dong: string, dongList: string): boolean {
  if (!dongList || dongList === "-") return false;

  // 콤마/줄바꿈으로 분리 후 각 항목에 dong이 포함되는지 확인
  const items = dongList.split(/[,\n]/).map((s) => s.trim());
  const dongClean = dong.replace(/\s+/g, "");

  return items.some((item) => {
    const itemClean = item.replace(/\s+/g, "");
    // 정확 매칭 또는 포함 매칭
    return itemClean === dongClean || itemClean.includes(dongClean) || dongClean.includes(itemClean);
  });
}

/**
 * 서비스 지역 전체 목록 조회 (정책 참조용)
 */
export async function getAllServiceAreas(): Promise<string> {
  const { data: rows } = await supabase
    .from("service_areas")
    .select("province, city, pickup_days, available_dongs, unavailable_dongs")
    .eq("is_active", true)
    .order("province")
    .order("city");

  if (!rows || rows.length === 0) return "서비스 지역 정보가 없습니다.";

  return rows
    .map((r) => {
      const avail =
        r.available_dongs === "전 지역" || r.available_dongs === "전지역"
          ? "전 지역"
          : r.available_dongs;
      return `- ${r.province} ${r.city}: 수거 ${r.pickup_days} / 가능: ${avail}`;
    })
    .join("\n");
}
