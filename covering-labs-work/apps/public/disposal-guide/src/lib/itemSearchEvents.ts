'use client';

import type { AppState, HazardousCategory } from '../types';
import { BASE_PATH } from '../utils/basePath';
import { normalizeItemSearchKeyword } from './itemSearchKeyword';

const SESSION_KEY = 'disposal_guide_sid';
const CONTEXT_KEYS = [
  'source',
  'surface',
  'campaign',
  'variant',
  'from',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;
const USER_ID_QUERY_KEYS = ['app_user_id', 'user_id', 'uid', 'appUserId'] as const;

type ItemSearchEventOptions = {
  eventName: 'item_description_submitted' | 'restricted_item_detected';
  isRestrictedItem?: boolean;
  hazardousCategory?: HazardousCategory;
  hazardousKeyword?: string;
};

function compactProps(props: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

function getSessionId() {
  if (typeof window === 'undefined') return undefined;

  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;

    const next =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `anon_${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return `anon_${Math.random().toString(36).slice(2)}`;
  }
}

function firstQueryValue(params: URLSearchParams, keys: readonly string[]) {
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) return value;
  }

  return undefined;
}

function queryContext() {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const context: Record<string, unknown> = {
    session_id: getSessionId(),
    app_user_id: firstQueryValue(params, USER_ID_QUERY_KEYS),
    view_path: window.location.pathname,
  };

  CONTEXT_KEYS.forEach((key) => {
    const value = params.get(key)?.trim();
    if (value) {
      context[key === 'from' ? 'referrer_from' : key] = value;
    }
  });

  return context;
}

export function buildItemSearchEventPayload(
  state: AppState,
  options: ItemSearchEventOptions,
) {
  const itemSearchKeyword = normalizeItemSearchKeyword(state.itemDescription);
  if (!itemSearchKeyword) return null;

  return compactProps({
    ...queryContext(),
    event_name: options.eventName,
    item_search_keyword: itemSearchKeyword,
    item_description_length: state.itemDescription.trim().length,
    categories: state.categories,
    category_count: state.categories.length,
    has_food_waste: state.hasFoodWaste,
    length_cm: state.lengthCm,
    length_range: state.lengthRange,
    weight_range: state.weightRange,
    perceived_weight: state.perceivedWeight,
    splittable_status: state.splittableStatus,
    recommendation: state.resultId,
    is_restricted_item: Boolean(options.isRestrictedItem),
    hazardous_category: options.hazardousCategory,
    hazardous_keyword: options.hazardousKeyword,
  });
}

export function saveItemSearchEvent(state: AppState, options: ItemSearchEventOptions) {
  if (typeof window === 'undefined') return;

  const payload = buildItemSearchEventPayload(state, options);
  if (!payload) return;

  void fetch(`${BASE_PATH}/api/item-search-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Search logging must never block the recommendation flow.
  });
}
