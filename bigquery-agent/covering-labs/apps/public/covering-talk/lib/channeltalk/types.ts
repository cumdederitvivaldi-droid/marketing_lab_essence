// ─── 채널톡 API 타입 정의 ───

export interface ChannelTalkMessage {
  chatKey: string;
  id: string;
  channelId: string;
  chatType: string;
  chatId: string;
  personType: "bot" | "user" | "manager";
  personId: string;
  createdAt: number;
  updatedAt: number;
  plainText?: string;
  blocks?: MessageBlock[];
  files?: MessageFile[];
  options?: string[];
  workflow?: {
    id: string;
    revisionId: string;
    sectionId: string;
    actionIndex: number;
    buttonBotMessage: boolean;
  };
  form?: {
    type: string;
    inputs: Array<{
      type: string;
      dataType?: string;
      label: string;
      value?: string;
      required?: boolean;
      bindingKey?: string;
    }>;
    submittedAt?: number;
  };
  log?: {
    action: string;
    values?: string[];
    triggerType?: string;
    triggerId?: string;
  };
}

export interface MessageBlock {
  type: "text" | "code" | "bullets";
  value?: string;
  blocks?: MessageBlock[];
}

export interface MessageFile {
  id: string;
  type: string;
  name: string;
  size: number;
  contentType: string;
  width?: number;
  height?: number;
  key?: string;
  previewKey?: string;
}

export interface ChannelTalkUserChat {
  id: string;
  channelId: string;
  state: "opened" | "closed" | "snoozed";
  managed: boolean;
  userId: string;
  assigneeId?: string;
  tags?: string[];
  managerIds?: string[];
  name?: string;
  createdAt: number;
  openedAt?: number;
  closedAt?: number;
  updatedAt?: number;
  frontMessageId?: string;
  replyCount?: number;
  resolutionTime?: number;
  waitingTime?: number;
  avgReplyTime?: number;
  description?: string;
}

export interface ChannelTalkUser {
  id: string;
  memberId?: string;
  name?: string;
  mobileNumber?: string;
  email?: string;
  avatarUrl?: string;
  profile?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface ChannelTalkManager {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

// API 응답 타입
export interface UserChatsResponse {
  prev?: string;
  next?: string;
  userChats: ChannelTalkUserChat[];
  messages?: ChannelTalkMessage[];
  users?: ChannelTalkUser[];
  managers?: ChannelTalkManager[];
}

export interface MessagesResponse {
  prev?: string;
  next?: string;
  messages: ChannelTalkMessage[];
  bots?: { id: string; name: string; avatar?: string; color?: string }[];
}

// 웹훅 페이로드
export interface WebhookPayload {
  event: "upsert" | "update" | "push";
  type: "Message" | "UserChat" | "User";
  entity: ChannelTalkMessage | ChannelTalkUserChat | ChannelTalkUser;
  refers?: {
    manager?: ChannelTalkManager;
    message?: ChannelTalkMessage;
    user?: ChannelTalkUser;
  };
}

// 커버링톡 내부용 변환 타입
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
  lastMessageAt: number;
  lastMessagePersonType?: string;
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
  personName?: string;
  createdAt: number;
  isInternal?: boolean;
  files?: CTMessageFile[];
  formData?: Array<{ label: string; value: string }>;
}
