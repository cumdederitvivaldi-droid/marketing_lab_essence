/**
 * ProcessContext: 요청 단위 DB 캐시
 *
 * Webhook 요청 하나를 처리하는 동안 conversationStore.getById()를
 * 최소화하기 위한 인메모리 캐시. 요청 시작 시 생성, 요청 끝나면 GC.
 */

import { conversationStore, Conversation } from "@/lib/store/conversations";

export class ProcessContext {
  private cache: Map<string, Conversation> = new Map();

  /** DB에서 조회 (캐시 우선) */
  async getConversation(sessionId: string): Promise<Conversation | undefined> {
    const cached = this.cache.get(sessionId);
    if (cached) return cached;

    const conv = await conversationStore.getById(sessionId);
    if (conv) this.cache.set(sessionId, conv);
    return conv;
  }

  /** DB 쓰기 후 로컬 캐시도 동기화 */
  updateLocal(sessionId: string, updates: Partial<Conversation>): void {
    const cached = this.cache.get(sessionId);
    if (cached) {
      Object.assign(cached, updates);
    }
  }

  /** 캐시 무효화 (DB 쓰기 후 최신 데이터가 필요할 때) */
  invalidate(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  /** 캐시에 직접 세팅 (upsertMessage 등 이미 conversation을 반환하는 경우) */
  setConversation(sessionId: string, conv: Conversation): void {
    this.cache.set(sessionId, conv);
  }
}
