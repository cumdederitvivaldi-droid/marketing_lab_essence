/**
 * 신규 서비스 지역 추가 (2026-03-30)
 * 세종, 청주, 대전 지역 추가
 *
 * 사용법:
 *   npx tsx tools/channeltalk-ai/add-new-service-areas-20260330.ts
 */

import { createClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

const NEW_AREAS = [
  {
    province: "충청도",
    city: "세종",
    pickup_days: "화 금 일",
    unavailable_dongs: "양소면, 전의면, 전동면, 연서면, 장군면, 금남면, 부강면, 연기면",
    available_dongs: "조치원읍, 부강면, 한솔동, 도담동, 아름동, 종촌동, 고운동, 보람동, 새롬동, 대평동, 소담동, 다정동, 해밀동, 반곡동, 나성동, 어진동",
    note: "지역/요일 동시 확장",
    opened_at: "2026-03-30",
  },
  {
    province: "청주시",
    city: "상당구",
    pickup_days: "월 수 금 일",
    unavailable_dongs: "낭성면, 미원면, 가덕면, 남일면, 문의면",
    available_dongs: "중앙동, 성안동, 탑대성동, 영운동, 금천동, 용담명암산성동, 용암1동, 용암2동",
    note: "지역/요일 동시 확장",
    opened_at: "2026-03-30",
  },
  {
    province: "청주시",
    city: "서원구",
    pickup_days: "월 수 금 일",
    unavailable_dongs: "남이면, 현도면",
    available_dongs: "사직1동, 사직2동, 사창동, 모충동, 수곡1동, 수곡2동, 산남동, 분평동, 성화개신죽림",
    note: "지역/요일 동시 확장",
    opened_at: "2026-03-30",
  },
  {
    province: "청주시",
    city: "흥덕구",
    pickup_days: "화 금 일",
    unavailable_dongs: "장수면",
    available_dongs: "오송읍, 강내면, 운천신봉동, 복대1동, 복대2동, 가경동, 봉명1동, 봉명2송정동, 강서1동, 강서2동",
    note: "지역/요일 동시 확장",
    opened_at: "2026-03-30",
  },
  {
    province: "청주시",
    city: "청원구",
    pickup_days: "월 목 토",
    unavailable_dongs: "북이면",
    available_dongs: "오창읍, 우암동, 내덕1동, 내덕2동, 율량사천동, 오근장동",
    note: "지역/요일 동시 확장",
    opened_at: "2026-03-30",
  },
  {
    province: "대전 광역시",
    city: "서구",
    pickup_days: "화 목 토 일",
    unavailable_dongs: "기성동",
    available_dongs: "복수동, 도마1동, 도마2동, 정림동, 변동, 용문동, 탄방동, 둔산1동, 둔산2동, 둔산3동, 괴정동, 가장동, 내동, 갈마1동, 갈마2동, 월평1동, 월평2동, 월평3동, 만년동, 가수원동, 도안동, 관저1동, 관저2동",
    note: "지역/요일 동시 확장",
    opened_at: "2026-03-30",
  },
  {
    province: "대전 광역시",
    city: "유성구",
    pickup_days: "월 수 금 일",
    unavailable_dongs: "진잠동",
    available_dongs: "학하동, 원신흥동, 상대동, 온천1동, 온천2동, 노은1동, 노은2동, 노은3동, 신성동, 전민동, 구즉동, 관평동",
    note: "지역/요일 동시 확장",
    opened_at: "2026-03-30",
  },
  {
    province: "대전 광역시",
    city: "동구",
    pickup_days: "월 수 목 토",
    unavailable_dongs: "",
    available_dongs: "중앙동, 신인동, 효동, 판암1동, 판암2동, 용운동, 대동, 자양동, 가양1동, 가양2동, 용전동, 성남동, 홍도동, 삼성동",
    note: "지역/요일 동시 확장",
    opened_at: "2026-03-30",
  },
  {
    province: "대전 광역시",
    city: "중구",
    pickup_days: "화 목 토 일",
    unavailable_dongs: "유성동",
    available_dongs: "은행선화동, 목동, 중촌동, 대흥동, 문창동, 석교동, 대사동, 부사동, 용두동, 오류동, 태평1동, 태평2동, 유천1동, 유천2동, 문화1동, 문화2동",
    note: "지역/요일 동시 확장",
    opened_at: "2026-03-30",
  },
  {
    province: "대전 광역시",
    city: "대덕구",
    pickup_days: "월 수 목 토",
    unavailable_dongs: "",
    available_dongs: "전 지역",
    note: "지역/요일 동시 확장",
    opened_at: "2026-03-30",
  },
];

async function main() {
  console.log("🌱 신규 서비스 지역 추가 시작 (2026-03-30)");
  console.log(`총 ${NEW_AREAS.length}개 지역\n`);

  for (const area of NEW_AREAS) {
    // 중복 체크
    const { data: existing } = await supabase
      .from("service_areas")
      .select("id")
      .eq("province", area.province)
      .eq("city", area.city)
      .limit(1);

    if (existing && existing.length > 0) {
      // 이미 존재 → 업데이트
      const { error } = await supabase
        .from("service_areas")
        .update({
          pickup_days: area.pickup_days,
          unavailable_dongs: area.unavailable_dongs,
          available_dongs: area.available_dongs,
          note: area.note,
          opened_at: area.opened_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing[0].id);

      if (error) {
        console.error(`  ❌ ${area.province} ${area.city}: ${error.message}`);
      } else {
        console.log(`  🔄 ${area.province} ${area.city} (업데이트)`);
      }
    } else {
      // 신규 삽입
      const { error } = await supabase
        .from("service_areas")
        .insert(area);

      if (error) {
        console.error(`  ❌ ${area.province} ${area.city}: ${error.message}`);
      } else {
        console.log(`  ✅ ${area.province} ${area.city} (신규)`);
      }
    }
  }

  // 결과 확인
  const { data: all } = await supabase
    .from("service_areas")
    .select("province, city, pickup_days")
    .eq("is_active", true)
    .order("province");

  console.log(`\n📊 전체 서비스 지역: ${all?.length ?? 0}개`);
  console.log("✅ 완료!");
}

main().catch(console.error);
