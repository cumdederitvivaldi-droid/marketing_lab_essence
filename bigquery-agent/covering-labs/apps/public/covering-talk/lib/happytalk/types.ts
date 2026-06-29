// 해피톡 카카오 상담톡 웹훅 v3 타입 정의

// ─────────────────────────────────────────
// Webhook 수신 타입 (해피톡 → 내 서버)
// ─────────────────────────────────────────

export interface IncomingMessage {
  user_key: string;
  sender_key: string;
  time: number;
  serial_number: number;
  type: "text" | "photo" | "video" | "audio" | "file";
  contents: (string | { url: string; comment?: string })[];
  attachment?: {
    url: string;
  };
  extra?: string;
  session_id: string;
}

export interface IncomingMetaReference {
  extra?: string | null;
  text?: string | null;
  appUserId?: string | null;
}

export interface IncomingMetadata {
  user_key: string;
  sender_key: string;
  session_id: string;
  time?: number;
  // 채팅 진입 직전 referrer 정보 (해피톡이 상담연결 버튼 메타로 받아 우리 서버로 전달).
  // 보통 reference.extra 에 "이전 페이지: <url>" 형태 텍스트가 들어옴.
  reference?: IncomingMetaReference | null;
  last_reference?: (IncomingMetaReference & { bot?: string; bot_event?: string; created_at?: string | number }) | null;
  app_user_id?: string | null;
  [key: string]: unknown;
}

export interface IncomingSessionEnd {
  user_key: string;
  sender_key: string;
  session_id: string;
  end_type?: string;
}

// ─────────────────────────────────────────
// Plain 메시지 발송 타입 (내 서버 → 해피톡)
// ─────────────────────────────────────────

export type ChatBubbleType = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE";

export interface SendPlainMessageParams {
  user_key: string;
  sender_key: string;
  serial_number: string;
  chat_bubble_type: ChatBubbleType;
  message?: string;
  attachment?: {
    image?: { img_url: string; img_link?: string };
    file?: { file_url: string; file_name?: string; file_size?: number };
  };
}

export interface HappyTalkResponse {
  code: string;
  created_at?: string;
  message?: string;
}

// ─────────────────────────────────────────
// 내부 사용 타입
// ─────────────────────────────────────────

export type IntentType = "AUTO_REPLY" | "NEED_HUMAN" | "CANCEL";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface SessionHistory {
  user_key: string;
  session_id: string;
  messages: ChatMessage[];
  created_at: number;
  updated_at: number;
}
