import type {
  Category,
  HazardousCategory,
  LengthRange,
  PerceivedWeight,
  Recommendation,
  SplittableStatus,
  WeightRange,
} from '../types';
import { normalizeItemSearchKeyword } from '../lib/itemSearchKeyword';

const DEFAULT_TABLE = 'disposal_guide_item_search_events';
const REQUEST_TIMEOUT_MS = 5000;
const TEXT_LIMIT = 160;

const EVENT_NAMES = ['item_description_submitted', 'restricted_item_detected'] as const;
const CATEGORIES: Category[] = [
  'GENERAL_FOOD_RECYCLE',
  'APPLIANCE_FURNITURE',
  'BEDDING_CLOTHES_MISC',
  'ETC',
];
const LENGTH_RANGES: LengthRange[] = [
  'UNDER_80',
  'AROUND_80',
  'OVER_80_UNDER_140',
  'OVER_140_UNDER_150',
  'OVER_150',
];
const WEIGHT_RANGES: WeightRange[] = ['UNDER_15', 'OVER_15_UNDER_25', 'OVER_25', 'UNKNOWN'];
const PERCEIVED_WEIGHTS: PerceivedWeight[] = ['EASY_TO_LIFT', 'HARD_TO_HOLD_LONG', 'HARD_TO_LIFT'];
const SPLITTABLE_STATUSES: SplittableStatus[] = ['CAN_SPLIT', 'CANNOT_SPLIT', 'UNKNOWN'];
const RECOMMENDATIONS: Recommendation[] = [
  'VISIT_PICKUP',
  'LARGE_COVERING_BAG',
  'GENERAL_BAG_MULTIPLE',
  'GENERAL_BAG_SINGLE',
];
const HAZARDOUS_CATEGORIES: HazardousCategory[] = ['PHARMACEUTICAL', 'HAZARDOUS_WASTE'];

type EventName = (typeof EVENT_NAMES)[number];

type SupabaseConfig = {
  url: string;
  key: string;
  table: string;
};

export type ItemSearchEventResult =
  | { ok: true; status: 'stored' }
  | { ok: false; status: 'invalid_payload' | 'skipped_missing_config' | 'insert_failed' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function includesValue<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

function cleanString(value: unknown, maxLength = TEXT_LIMIT) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function cleanNumber(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function cleanBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function cleanCategories(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((category): category is Category => includesValue(CATEGORIES, category));
}

function compactRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = cleanString(
    process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.COVERING_SUPABASE_URL,
    1000,
  );
  const key = cleanString(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.COVERING_SUPABASE_KEY,
    4000,
  );
  const table = cleanString(process.env.DISPOSAL_GUIDE_ITEM_SEARCH_EVENTS_TABLE, 80) || DEFAULT_TABLE;

  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key, table };
}

function supabaseHeaders(config: SupabaseConfig) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function buildItemSearchEventRow(input: unknown) {
  if (!isRecord(input)) return null;

  const itemSearchKeyword = normalizeItemSearchKeyword(cleanString(input.item_search_keyword, 500) ?? '');
  if (!itemSearchKeyword) return null;

  const row = compactRow({
    event_name: includesValue(EVENT_NAMES, input.event_name)
      ? input.event_name
      : ('item_description_submitted' satisfies EventName),
    session_id: cleanString(input.session_id, 120),
    app_user_id: cleanString(input.app_user_id, 160),
    item_search_keyword: itemSearchKeyword,
    item_description_length: cleanNumber(input.item_description_length, 0, 500),
    categories: cleanCategories(input.categories),
    category_count: cleanNumber(input.category_count, 0, CATEGORIES.length),
    has_food_waste: cleanBoolean(input.has_food_waste),
    length_cm: cleanNumber(input.length_cm, 0, 300),
    length_range: includesValue(LENGTH_RANGES, input.length_range) ? input.length_range : undefined,
    weight_range: includesValue(WEIGHT_RANGES, input.weight_range) ? input.weight_range : undefined,
    perceived_weight: includesValue(PERCEIVED_WEIGHTS, input.perceived_weight)
      ? input.perceived_weight
      : undefined,
    splittable_status: includesValue(SPLITTABLE_STATUSES, input.splittable_status)
      ? input.splittable_status
      : undefined,
    recommendation: includesValue(RECOMMENDATIONS, input.recommendation) ? input.recommendation : undefined,
    is_restricted_item: cleanBoolean(input.is_restricted_item) ?? false,
    hazardous_category: includesValue(HAZARDOUS_CATEGORIES, input.hazardous_category)
      ? input.hazardous_category
      : undefined,
    hazardous_keyword: cleanString(input.hazardous_keyword, 80),
    source: cleanString(input.source),
    surface: cleanString(input.surface),
    campaign: cleanString(input.campaign),
    variant: cleanString(input.variant),
    referrer_from: cleanString(input.referrer_from),
    utm_source: cleanString(input.utm_source),
    utm_medium: cleanString(input.utm_medium),
    utm_campaign: cleanString(input.utm_campaign),
    utm_content: cleanString(input.utm_content),
    utm_term: cleanString(input.utm_term),
    view_path: cleanString(input.view_path, 300),
  });

  return row;
}

export async function handleItemSearchEvent(input: unknown): Promise<ItemSearchEventResult> {
  const row = buildItemSearchEventRow(input);
  if (!row) return { ok: false, status: 'invalid_payload' };

  const config = getSupabaseConfig();
  if (!config) return { ok: false, status: 'skipped_missing_config' };

  try {
    const response = await fetchWithTimeout(`${config.url}/rest/v1/${config.table}`, {
      method: 'POST',
      headers: supabaseHeaders(config),
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      console.error(`disposal-guide item search event insert failed: ${response.status}`);
      return { ok: false, status: 'insert_failed' };
    }

    return { ok: true, status: 'stored' };
  } catch (error) {
    const message = error instanceof Error ? error.name : 'unknown';
    console.error(`disposal-guide item search event transport failed: ${message}`);
    return { ok: false, status: 'insert_failed' };
  }
}
