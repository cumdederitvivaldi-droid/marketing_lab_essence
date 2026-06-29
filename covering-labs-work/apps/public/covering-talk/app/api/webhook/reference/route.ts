// [CS-EXT-019] 사용자 메타정보 수신 (해피톡 메타 webhook 진입점)
//
// 해피톡 도메인 등록 spec 에 따라 path 가 `/reference` 로 자동 호출됨.
// 우리 베이스 도메인이 `https://.../api/webhook` 로 등록돼 있어 자동으로 이 라우트가 받음.
//
// 기존 `/api/webhook/metadata` 는 옛 진입점이라 호환을 위해 같은 동작을 한 번 더 정의.
import { POST as metadataPOST } from "../metadata/route";

export const POST = metadataPOST;
