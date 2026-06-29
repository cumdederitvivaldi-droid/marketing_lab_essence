// 채널톡 UI 컴포넌트 공통 타입

export interface CTChat {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  userAvatarUrl?: string | null;
  state: "opened" | "closed" | "snoozed";
  tags: string[];
  assignee: string | null;
  assigneeAvatarUrl?: string | null;
  description?: string;
  lastMessage: string;
  lastMessagePersonType: string;
  lastMessageAt: number;
  unreadCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CTMessageFile {
  id: string;
  type: string;
  name: string;
  contentType: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

export interface CTMessage {
  id: string;
  chatId: string;
  role: "user" | "manager" | "bot";
  content: string;
  personId: string;
  senderName?: string;
  avatarUrl?: string;
  createdAt: number;
  isInternal?: boolean;
  files?: CTMessageFile[];
  formData?: Array<{ label: string; value: string }>;
  isWorkflowButton?: boolean;
  isRemoved?: boolean;
}
