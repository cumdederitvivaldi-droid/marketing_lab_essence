// [CS-LAB-018] 기존 캠페인을 템플릿으로 복제 + phones 배열로 새 캠페인 생성 (실험실 — 김원빈/강성진 전용)
//   기존 sweettracker Excel 파이프라인은 행마다 메시지/이미지/버튼이 다른 케이스 — 같은 템플릿을
//   대규모로 반복 발송하는 시나리오에 비효율적. 이 엔드포인트는 source 의 첫 recipient row 를
//   템플릿으로 삼아 phones[] 만으로 새 캠페인을 생성한다.
//
// 추가로:
//   - 입력 phones 정규화 (10자리 → 0 prepend)
//   - 잘못된 포맷 스킵
//   - 다른 캠페인에서 이미 발송된 phone 자동 제외 (중복 발송 방지)
import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import {
  createCampaign,
  getCampaignById,
  updateCampaign,
} from "@/lib/store/brand-message";
import { supabaseAdmin } from "@/lib/supabase/client";
import { generateMsgid } from "@/lib/sweettracker/msgid";

export const maxDuration = 60;

function normalizePhone(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  // 10자리(010 누락된 모바일) → 0 prepend
  const candidate = digits.length === 10 ? `0${digits}` : digits;
  // 11자리 010 으로 시작하는 케이스만 인정
  if (!/^010\d{8}$/.test(candidate)) return null;
  return candidate;
}

interface ClonePayload {
  source_campaign_id: string;
  label: string;
  group_tag?: string | null;
  notes?: string | null;
  phones: unknown[];
  /** 발송 이력 dedup 옵션 — 기본 true. false 면 phone 중복 무시하고 다 등록 */
  exclude_already_sent?: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let user;
  try {
    user = await requireLabAccess();
  } catch (e) {
    if (e instanceof LabForbiddenError) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ClonePayload;
  try {
    body = (await req.json()) as ClonePayload;
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }

  const { source_campaign_id, label, group_tag, notes, phones } = body;
  const exclude_already_sent = body.exclude_already_sent ?? true;

  if (!source_campaign_id) {
    return NextResponse.json({ error: "source_campaign_id 필수" }, { status: 400 });
  }
  if (!label?.trim()) {
    return NextResponse.json({ error: "label 필수" }, { status: 400 });
  }
  if (!Array.isArray(phones) || phones.length === 0) {
    return NextResponse.json({ error: "phones 배열 필수 (1건 이상)" }, { status: 400 });
  }

  // 1) source 캠페인 + 템플릿 row 조회
  const source = await getCampaignById(source_campaign_id);
  if (!source) {
    return NextResponse.json({ error: "source_campaign_id 캠페인을 찾을 수 없음" }, { status: 404 });
  }
  const { data: tmplRows, error: tmplErr } = await supabaseAdmin
    .from("brand_message_recipients")
    .select("message, image_url, image_link, buttons, coupon")
    .eq("campaign_id", source_campaign_id)
    .limit(1);
  if (tmplErr) {
    return NextResponse.json({ error: `템플릿 조회 실패: ${tmplErr.message}` }, { status: 500 });
  }
  if (!tmplRows || tmplRows.length === 0) {
    return NextResponse.json({ error: "source 캠페인에 recipient 없음 — 템플릿 추출 불가" }, { status: 400 });
  }
  const tmpl = tmplRows[0];

  // 2) 입력 phones 정규화 + dedup (입력 내부 중복 제거)
  const normalized: string[] = [];
  let invalidCount = 0;
  const seen = new Set<string>();
  for (const raw of phones) {
    const n = normalizePhone(raw);
    if (!n) { invalidCount++; continue; }
    if (seen.has(n)) continue;
    seen.add(n);
    normalized.push(n);
  }

  if (normalized.length === 0) {
    return NextResponse.json({
      error: "유효한 전화번호가 없습니다",
      summary: { total_input: phones.length, invalid: invalidCount, valid: 0 },
    }, { status: 400 });
  }

  // 3) 다른 캠페인에서 이미 발송된 phone 제거 (sent_at not null & 성공 코드)
  const alreadySentSet = new Set<string>();
  if (exclude_already_sent) {
    const CHUNK = 1000;
    for (let i = 0; i < normalized.length; i += CHUNK) {
      const chunk = normalized.slice(i, i + CHUNK);
      const { data: sentRows } = await supabaseAdmin
        .from("brand_message_recipients")
        .select("phone")
        .in("phone", chunk)
        .not("sent_at", "is", null)
        .in("result_code", ["K000", "M000"]);
      for (const r of sentRows ?? []) {
        if (r.phone) alreadySentSet.add(r.phone);
      }
    }
  }

  const finalPhones = normalized.filter((p) => !alreadySentSet.has(p));
  const skippedAlreadySent = normalized.length - finalPhones.length;

  if (finalPhones.length === 0) {
    return NextResponse.json({
      error: "dedup 후 등록 가능한 전화번호가 0건입니다 (모두 이미 발송됨)",
      summary: {
        total_input: phones.length,
        invalid: invalidCount,
        already_sent: skippedAlreadySent,
        valid: 0,
      },
    }, { status: 400 });
  }

  // 4) 새 캠페인 생성
  const campaign = await createCampaign({
    label,
    group_tag: group_tag ?? undefined,
    message_type: source.message_type,
    created_by: user.name,
    excel_filename: `clone:${source_campaign_id.slice(0, 8)}`,
    notes: notes ?? `template clone from ${source.label}`,
    total_count: finalPhones.length,
  });

  // 5) bulk insert (template 적용)
  const shortId = campaign.id.replace(/-/g, "").slice(0, 8);
  const records = finalPhones.map((phone, idx) => ({
    campaign_id: campaign.id,
    phone,
    msgid: generateMsgid(shortId, idx),
    message: tmpl.message,
    image_url: tmpl.image_url ?? null,
    image_link: tmpl.image_link ?? null,
    buttons: tmpl.buttons ?? null,
    coupon: tmpl.coupon ?? null,
  }));

  const CHUNK = 1000;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin.from("brand_message_recipients").insert(chunk);
    if (error) {
      return NextResponse.json({
        error: `recipient bulk insert 실패: ${error.message}`,
        campaign_id: campaign.id,
        inserted_so_far: i,
      }, { status: 500 });
    }
  }
  await updateCampaign(campaign.id, { total_count: finalPhones.length });

  return NextResponse.json({
    campaign_id: campaign.id,
    summary: {
      total_input: phones.length,
      invalid: invalidCount,
      already_sent: skippedAlreadySent,
      registered: finalPhones.length,
    },
    template_preview: {
      message: tmpl.message?.slice(0, 80) + (tmpl.message && tmpl.message.length > 80 ? "…" : ""),
      has_image: !!tmpl.image_url,
      has_buttons: Array.isArray(tmpl.buttons) ? tmpl.buttons.length > 0 : false,
      has_coupon: !!tmpl.coupon,
    },
  }, { status: 201 });
}
