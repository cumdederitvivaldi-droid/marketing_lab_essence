#!/usr/bin/env node
// 일괄 등록 스크립트 — day_01.csv ~ day_20.csv 를 source 캠페인 템플릿으로 복제 등록.
//   Supabase service role 로 DB 직접 처리 — 세션 쿠키 / API 호출 불필요.
//   .env.local 의 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 자동 로드.
//
// 사용법 (프로젝트 루트에서):
//   SOURCE_CAMPAIGN_ID=<uuid> node tools/brand-message/clone-days.mjs
//
// 옵션:
//   LABEL_PREFIX='4일차 A그룹 D' (기본)
//   GROUP_TAG='4day-A' (기본)
//   CSV_DIR='/Users/wonbinkim/Desktop/chatingbot' (기본)
//   DAYS='1-20' (기본)
//   DRY_RUN=1   미리보기만 (DB 안 건드림)
//   INCLUDE_DUPES=1  이미 발송된 phone 도 등록 (기본은 dedup)
//   CREATED_BY='김원빈' (기본)

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// ── .env.local 수동 로드 (dotenv 의존성 없이) ───────
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (m && process.env[m[1]] === undefined) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}

const SOURCE_CAMPAIGN_ID = process.env.SOURCE_CAMPAIGN_ID;
const LABEL_PREFIX = process.env.LABEL_PREFIX ?? "4일차 A그룹 D";
const GROUP_TAG = process.env.GROUP_TAG ?? "4day-A";
const CSV_DIR = process.env.CSV_DIR ?? "/Users/wonbinkim/Desktop/chatingbot";
const DAYS_RANGE = process.env.DAYS ?? "1-20";
const DRY_RUN = process.env.DRY_RUN === "1";
const INCLUDE_DUPES = process.env.INCLUDE_DUPES === "1";
const CREATED_BY = process.env.CREATED_BY ?? "김원빈";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SOURCE_CAMPAIGN_ID) {
  console.error("[ERR] SOURCE_CAMPAIGN_ID 필수 — /lab/brand-message 에서 4일차 A그룹 캠페인 클릭 후 URL 의 UUID 복사");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[ERR] .env.local 에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 유틸 ───────────────────────────────────────
function parseRange(spec) {
  const [a, b] = spec.split("-").map((s) => parseInt(s.trim(), 10));
  if (!a || !b || a > b) return [];
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function normalizePhone(raw) {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  const candidate = digits.length === 10 ? `0${digits}` : digits;
  if (!/^010\d{8}$/.test(candidate)) return null;
  return candidate;
}

function readCsvPhones(path) {
  const txt = readFileSync(path, "utf-8");
  const lines = txt.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const phoneIdx = header.findIndex((h) => h.toLowerCase() === "phone");
  if (phoneIdx < 0) throw new Error(`phone 컬럼 없음: ${path}`);
  const phones = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const p = (cols[phoneIdx] ?? "").trim();
    if (p) phones.push(p);
  }
  return phones;
}

function generateMsgid(shortId, idx) {
  // sweettracker msgid 패턴 — campaign 단축 id + 인덱스
  return `${shortId}_${String(idx).padStart(6, "0")}`;
}

// ── 메인 처리 ───────────────────────────────────
async function loadTemplate() {
  const { data: campaign, error: cErr } = await supabase
    .from("brand_message_campaigns")
    .select("*")
    .eq("id", SOURCE_CAMPAIGN_ID)
    .single();
  if (cErr || !campaign) throw new Error(`source 캠페인 조회 실패: ${cErr?.message ?? "not found"}`);

  const { data: tmplRows, error: tErr } = await supabase
    .from("brand_message_recipients")
    .select("message, image_url, image_link, buttons, coupon")
    .eq("campaign_id", SOURCE_CAMPAIGN_ID)
    .limit(1);
  if (tErr) throw new Error(`템플릿 조회 실패: ${tErr.message}`);
  if (!tmplRows || tmplRows.length === 0) throw new Error("source 캠페인에 recipient 없음");

  return { campaign, tmpl: tmplRows[0] };
}

async function fetchAlreadySent(phones) {
  if (phones.length === 0) return new Set();
  const sent = new Set();
  const CHUNK = 1000;
  for (let i = 0; i < phones.length; i += CHUNK) {
    const chunk = phones.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("brand_message_recipients")
      .select("phone")
      .in("phone", chunk)
      .not("sent_at", "is", null)
      .in("result_code", ["K000", "M000"]);
    if (error) throw new Error(`dedup 조회 실패: ${error.message}`);
    for (const r of data ?? []) if (r.phone) sent.add(r.phone);
  }
  return sent;
}

async function processDay(dayNum, phones, sourceCampaign, tmpl) {
  const label = `${LABEL_PREFIX}${String(dayNum).padStart(2, "0")}`;

  // 1) phones 정규화 + 입력 내 중복 제거
  const seen = new Set();
  const normalized = [];
  let invalid = 0;
  for (const p of phones) {
    const n = normalizePhone(p);
    if (!n) { invalid++; continue; }
    if (seen.has(n)) continue;
    seen.add(n);
    normalized.push(n);
  }

  // 2) 이미 발송된 phone 제외
  const alreadySent = INCLUDE_DUPES ? new Set() : await fetchAlreadySent(normalized);
  const finalPhones = normalized.filter((p) => !alreadySent.has(p));
  const skipped = normalized.length - finalPhones.length;

  if (DRY_RUN) {
    console.log(`[DRY] day=${dayNum} label="${label}" input=${phones.length} invalid=${invalid} already_sent=${skipped} → register=${finalPhones.length}`);
    return;
  }

  if (finalPhones.length === 0) {
    console.warn(`[SKIP] day=${dayNum} label="${label}" — 등록할 phone 0건 (모두 이미 발송됨)`);
    return;
  }

  // 3) 캠페인 생성
  const { data: campaign, error: cErr } = await supabase
    .from("brand_message_campaigns")
    .insert({
      label,
      group_tag: GROUP_TAG,
      message_type: sourceCampaign.message_type,
      created_by: CREATED_BY,
      excel_filename: `clone:day_${String(dayNum).padStart(2, "0")}.csv`,
      notes: `auto from day_${String(dayNum).padStart(2, "0")}.csv (${phones.length}건 입력 / ${finalPhones.length}건 등록)`,
      total_count: finalPhones.length,
    })
    .select()
    .single();
  if (cErr || !campaign) {
    console.error(`[FAIL] day=${dayNum} 캠페인 생성: ${cErr?.message}`);
    return;
  }

  // 4) 수신자 bulk insert (1000 단위)
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
    const { error } = await supabase.from("brand_message_recipients").insert(chunk);
    if (error) {
      console.error(`[FAIL] day=${dayNum} bulk insert (chunk ${i}): ${error.message}`);
      return;
    }
  }

  console.log(`[OK] day=${dayNum} label="${label}" id=${campaign.id} input=${phones.length} invalid=${invalid} already_sent=${skipped} registered=${finalPhones.length}`);
}

async function main() {
  const days = parseRange(DAYS_RANGE);
  if (days.length === 0) { console.error(`[ERR] DAYS 형식 오류: ${DAYS_RANGE}`); process.exit(1); }

  console.log(`▶ source=${SOURCE_CAMPAIGN_ID} days=${days[0]}-${days[days.length - 1]} dryRun=${DRY_RUN} includeDupes=${INCLUDE_DUPES}`);

  const { campaign: sourceCampaign, tmpl } = await loadTemplate();
  console.log(`✓ template loaded: "${sourceCampaign.label}" type=${sourceCampaign.message_type} hasImage=${!!tmpl.image_url} msg="${(tmpl.message ?? "").slice(0, 40)}…"`);

  for (const d of days) {
    const path = join(CSV_DIR, `day_${String(d).padStart(2, "0")}.csv`);
    if (!existsSync(path)) { console.warn(`[SKIP] ${path} 없음`); continue; }
    let phones;
    try { phones = readCsvPhones(path); }
    catch (err) { console.error(`[ERR] ${path}: ${err.message}`); continue; }
    if (phones.length === 0) { console.warn(`[SKIP] day=${d} phones 0건`); continue; }
    await processDay(d, phones, sourceCampaign, tmpl);
  }
  console.log("✔ 완료");
}

main().catch((e) => { console.error("[FATAL]", e); process.exit(1); });
