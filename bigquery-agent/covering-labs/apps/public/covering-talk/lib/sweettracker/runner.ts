// 브랜드메시지 분산 발송 헬퍼 — send-now / scheduler / resume 공통 사용
import {
  getCampaignById,
  updateCampaign,
  getPendingRecipients,
  markRecipientResult,
} from "@/lib/store/brand-message";
import { sendBatch } from "@/lib/sweettracker/client";
import { supabaseAdmin } from "@/lib/supabase/client";
import type { BrandMessage, BrandMessageButton } from "@/lib/sweettracker/types";

export interface RunSendBatchResult {
  processed: number;
  remaining: number;
  completed: boolean;
  skipped?: boolean;  // 다른 invocation 이 진행 중이라 skip 한 경우
}

const LOCK_STALE_MINUTES = 2;

// Atomic lock — 다른 invocation 이 in_flight=true 가 아니거나 stale 일 때만 진입 허용.
// 동일 캠페인을 send-now / cron / resume 이 동시 호출해도 1번만 발송 진행됨.
//
// 동작:
// 1. fresh row (in_flight=false, default) → 첫 시도: in_flight=false → 성공
// 2. active row (in_flight=true, last_invocation_at 최근) → skip
// 3. stale row (in_flight=true, last_invocation_at < 2분 전) → 두 번째 시도로 stale 회수
async function tryAcquireLock(campaignId: string): Promise<boolean> {
  const cutoffIso = new Date(Date.now() - LOCK_STALE_MINUTES * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // 1차 시도: in_flight=false 인 경우 (default + 정상 종료 후)
  const r1 = await supabaseAdmin
    .from("brand_message_campaigns")
    .update({ in_flight: true, last_invocation_at: nowIso })
    .eq("id", campaignId)
    .eq("in_flight", false)
    .select("id");

  if (r1.error) {
    console.error("[runner.tryAcquireLock] r1 error:", r1.error.message);
    return false;
  }
  if ((r1.data?.length ?? 0) > 0) return true;

  // 2차 시도: stale lock 회수 — in_flight=true 이지만 last_invocation_at < cutoff
  const r2 = await supabaseAdmin
    .from("brand_message_campaigns")
    .update({ in_flight: true, last_invocation_at: nowIso })
    .eq("id", campaignId)
    .eq("in_flight", true)
    .lt("last_invocation_at", cutoffIso)
    .select("id");

  if (r2.error) {
    console.error("[runner.tryAcquireLock] r2 error:", r2.error.message);
    return false;
  }
  if ((r2.data?.length ?? 0) > 0) {
    console.log(`[runner.tryAcquireLock] ${campaignId} stale lock 회수`);
    return true;
  }

  return false;
}

async function refreshLock(campaignId: string): Promise<void> {
  await supabaseAdmin
    .from("brand_message_campaigns")
    .update({ last_invocation_at: new Date().toISOString() })
    .eq("id", campaignId);
}

async function releaseLock(campaignId: string): Promise<void> {
  await supabaseAdmin
    .from("brand_message_campaigns")
    .update({ in_flight: false })
    .eq("id", campaignId);
}

/**
 * 최대 maxRecipients 건을 100건씩 순차 발송.
 * - 진입 시 campaign.status 를 'sending' 으로 변경 (started_at IS NULL 이면 함께 set).
 * - pending 소진 → status='completed'. 남은 건 있음 → status='sending' 유지.
 * - 에러 발생 → status='failed' set 후 throw.
 */
export async function runSendBatchOnce(
  campaignId: string,
  maxRecipients = 1000
): Promise<RunSendBatchResult> {
  const profileKey = process.env.SWEETTRACKER_PROFILE_KEY;
  if (!profileKey) throw new Error("SWEETTRACKER_PROFILE_KEY 미설정");

  const campaign = await getCampaignById(campaignId);
  if (!campaign) throw new Error("캠페인을 찾을 수 없습니다");

  // ⛔ atomic lock 시도 — 다른 invocation (send-now/cron/resume) 이 이미 진행 중이면 skip
  const acquired = await tryAcquireLock(campaignId);
  if (!acquired) {
    console.log(`[runSendBatchOnce] ${campaignId} 다른 invocation 진행 중 → skip (race 방지)`);
    return { processed: 0, remaining: -1, completed: false, skipped: true };
  }

  // sending 상태로 전환 (started_at 이 null 인 경우만 set)
  if (campaign.status !== "sending") {
    await updateCampaign(campaignId, {
      status: "sending",
      ...(campaign.started_at == null ? { started_at: new Date().toISOString() } : {}),
    });
  } else if (campaign.started_at == null) {
    await updateCampaign(campaignId, { started_at: new Date().toISOString() });
  }

  const CHUNK = 100;
  let processed = 0;

  try {
    while (processed < maxRecipients) {
      // 매 iteration 시작 시 status 재조회 — cancelled 면 즉시 중단 (사용자 즉시 중단 버튼 효과)
      const fresh = await getCampaignById(campaignId);
      if (!fresh || fresh.status === "cancelled" || fresh.status === "failed") {
        console.log(`[runSendBatchOnce] ${campaignId} status=${fresh?.status} → 중단`);
        break;
      }

      const pending = await getPendingRecipients(campaignId, CHUNK);
      if (pending.length === 0) break;

      const messages: BrandMessage[] = pending.map((r) => {
        const buttons = r.buttons as BrandMessageButton[] | null;
        return {
          msgid: r.msgid,
          message_type: campaign.message_type as "FT" | "FI" | "FW",
          profile_key: profileKey,
          receiver_num: r.phone,
          message: r.message,
          reserved_time: "00000000000000",
          // 광고주 마수동 유저 (채널 친구 무관) — 발신프로필 화이트리스트 승인 받음
          targeting: "M",
          image_url: r.image_url ?? undefined,
          image_link: r.image_link ?? undefined,
          button1: buttons?.[0] ?? undefined,
          button2: buttons?.[1] ?? undefined,
          button3: buttons?.[2] ?? undefined,
          button4: buttons?.[3] ?? undefined,
          button5: buttons?.[4] ?? undefined,
          coupon: r.coupon as BrandMessage["coupon"] ?? undefined,
        };
      });

      // 순차 처리 — Promise.all 절대 금지
      const results = await sendBatch(messages);
      const now = new Date().toISOString();

      for (let i = 0; i < pending.length; i++) {
        const result = results[i];
        await markRecipientResult(pending[i].id, {
          sent_at: now,
          result_code: result?.result_code ?? "ERR",
          result_message: result?.result_message ?? undefined,
          origin_code: result?.origin_code ?? undefined,
          origin_error: result?.origin_error ?? undefined,
        });
      }

      processed += pending.length;

      // lock heartbeat — stale auto-release (2분) 안 되도록 매 100건 처리 후 갱신
      await refreshLock(campaignId);

      // 이번 chunk 가 CHUNK 보다 작으면 pending 소진
      if (pending.length < CHUNK) break;
    }

    // 남은 pending count (count:exact head:true — 행 로드 없음)
    const { count: remaining } = await supabaseAdmin
      .from("brand_message_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .is("sent_at", null);

    const rem = remaining ?? 0;

    if (rem === 0) {
      await updateCampaign(campaignId, {
        status: "completed",
        completed_at: new Date().toISOString(),
      });
    }
    // rem > 0 → status 는 'sending' 유지 (다음 cron 또는 resume 으로 이어짐)

    return { processed, remaining: rem, completed: rem === 0 };
  } catch (err) {
    await updateCampaign(campaignId, { status: "failed" }).catch(() => {});
    throw err;
  } finally {
    // ✅ lock 해제 — 정상 종료 / 에러 / break 모두 케이스 보장
    await releaseLock(campaignId).catch((e) =>
      console.error("[runSendBatchOnce] releaseLock 실패:", e)
    );
  }
}
