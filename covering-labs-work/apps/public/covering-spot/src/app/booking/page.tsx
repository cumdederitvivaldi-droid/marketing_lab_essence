import { redirect } from "next/navigation";
import { KAKAO_BRIDGE_PATH } from "@/lib/constants";

export default function BookingPage() {
  redirect(KAKAO_BRIDGE_PATH);
}
