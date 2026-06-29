// [CS-EXT-020] 채팅 세션 종료 (camelCase alias) — 해피톡 spec 의 /sessionEnd path 와 일치.
// 기존 /api/webhook/session-end 와 동일 동작.
import { POST as sessionEndPOST } from "../session-end/route";

export const POST = sessionEndPOST;
