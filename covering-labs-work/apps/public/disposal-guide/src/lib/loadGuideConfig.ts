import { FALLBACK_HAZARDOUS_KEYWORDS } from '../data/hazardousKeywords';
import { loadHazardousKeywordsWithSource } from './loadHazardousKeywords';
import type { DisposalGuideConfig, HazardousMatch } from '../types';
import {
  buildFallbackGuideConfigResult,
  checksumGuideConfig,
  validateSupabaseGuideConfig,
  type GuideConfigLoadResult,
  type GuideConfigMode,
  type GuideConfigValidationStatus,
  type HazardousKeywordRow,
  type RecommendationCopyRow,
  type RecommendationRuleRow,
  type StepChoiceRow,
  type SupabaseGuideConfigRows,
  type TableRows,
} from './guideConfigValidation';

const REVALIDATE_SECONDS = 3600;
const REQUEST_TIMEOUT_MS = 5000;
const DIAGNOSTICS_TTL_MS = 60_000;

let cachedLoadResult: { expiresAt: number; result: GuideConfigLoadResult } | null = null;

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;
  return {
    url: url.replace(/\/$/, ''),
    key,
  };
}

export function guideConfigMode(): GuideConfigMode {
  const raw = (process.env.GUIDE_CONFIG_MODE ?? 'default').trim().toLowerCase();
  if (raw === 'supabase_optional' || raw === 'supabase-optional') return 'supabase_optional';
  if (raw === 'supabase_strict' || raw === 'supabase-strict') return 'supabase_strict';
  return 'default';
}

async function fetchSupabaseRows<T>(pathAndQuery: string): Promise<TableRows<T>> {
  const config = supabaseConfig();
  if (!config) {
    return {
      status: 'fetch_failed',
      rows: [],
      errorCode: 'supabase_env_missing',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${config.url}/rest/v1/${pathAndQuery}`, {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[disposalGuideConfig] Supabase fetch failed: ${res.status}`);
      return {
        status: 'fetch_failed',
        rows: [],
        errorCode: `http_${res.status}`,
      };
    }

    return {
      status: 'success',
      rows: (await res.json()) as T[],
    };
  } catch {
    console.warn('[disposalGuideConfig] Supabase fetch error, using fallback');
    return {
      status: 'fetch_failed',
      rows: [],
      errorCode: 'fetch_error',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRuntimeFallbackResult(
  mode: GuideConfigMode,
  options: {
    fallbackReasonCode?: string;
    validationErrorCodes?: string[];
    ok?: boolean;
    validationStatus?: GuideConfigValidationStatus;
    rowCounts?: GuideConfigLoadResult['diagnostics']['rowCounts'];
    validRowCounts?: GuideConfigLoadResult['diagnostics']['validRowCounts'];
  } = {},
): Promise<GuideConfigLoadResult> {
  const hazardousResult = await loadHazardousKeywordsWithSource();
  const hazardousKeywords: HazardousMatch[] =
    hazardousResult.keywords.length > 0 ? hazardousResult.keywords : FALLBACK_HAZARDOUS_KEYWORDS;
  const dataSource = hazardousResult.source;
  const result = buildFallbackGuideConfigResult(mode, {
    dataSource,
    resolvedSource: 'fallback',
    hazardousSource: dataSource,
    hazardousKeywords,
    fallbackReasonCode: options.fallbackReasonCode,
    validationErrorCodes: options.validationErrorCodes,
    ok: options.ok,
    validationStatus: options.validationStatus,
  });

  return {
    config: result.config,
    diagnostics: {
      ...result.diagnostics,
      rowCounts: options.rowCounts ?? result.diagnostics.rowCounts,
      validRowCounts: options.validRowCounts ?? result.diagnostics.validRowCounts,
      configChecksum: checksumGuideConfig(result.config),
    },
  };
}

async function fetchSupabaseGuideRows(): Promise<SupabaseGuideConfigRows> {
  const [choices, rules, copy, hazardous] = await Promise.all([
    fetchSupabaseRows<StepChoiceRow>(
      'disposal_guide_step_choices?is_active=eq.true&select=step,choice_id,label,description,sort_order&order=step.asc,sort_order.asc',
    ),
    fetchSupabaseRows<RecommendationRuleRow>(
      'disposal_guide_recommendation_rules?is_active=eq.true&select=rule_id,priority,condition,action&order=priority.asc',
    ),
    fetchSupabaseRows<RecommendationCopyRow>(
      'disposal_guide_result_copy?is_active=eq.true&select=recommendation,title,description,cta,sort_order&order=sort_order.asc',
    ),
    fetchSupabaseRows<HazardousKeywordRow>(
      'disposal_guide_hazardous_keywords?is_active=eq.true&select=keyword,category,sort_order&order=sort_order.asc,keyword.asc',
    ),
  ]);

  return {
    choices,
    rules,
    copy,
    hazardous,
  };
}

export async function loadDisposalGuideConfigWithDiagnostics(
  options: { forceRefresh?: boolean } = {},
): Promise<GuideConfigLoadResult> {
  if (!options.forceRefresh && cachedLoadResult && cachedLoadResult.expiresAt > Date.now()) {
    return cachedLoadResult.result;
  }

  const mode = guideConfigMode();
  let result: GuideConfigLoadResult;

  if (mode === 'default') {
    result = await loadRuntimeFallbackResult(mode);
  } else if (!supabaseConfig()) {
    result = await loadRuntimeFallbackResult(mode, {
      fallbackReasonCode: 'supabase_env_missing',
      validationErrorCodes: ['supabase_env_missing'],
      ok: mode !== 'supabase_strict',
      validationStatus: mode === 'supabase_strict' ? 'invalid' : 'fallback',
    });
  } else {
    const rows = await fetchSupabaseGuideRows();
    const validated = validateSupabaseGuideConfig(rows, mode);
    result =
      validated.config.dataSource === 'supabase'
        ? validated
        : await loadRuntimeFallbackResult(mode, {
            fallbackReasonCode: validated.diagnostics.fallbackReasonCode,
            validationErrorCodes: validated.diagnostics.validationErrorCodes,
            ok: validated.diagnostics.ok,
            validationStatus: validated.diagnostics.validationStatus,
            rowCounts: validated.diagnostics.rowCounts,
            validRowCounts: validated.diagnostics.validRowCounts,
          });
  }

  cachedLoadResult = {
    expiresAt: Date.now() + DIAGNOSTICS_TTL_MS,
    result,
  };
  return result;
}

export async function loadDisposalGuideConfig(): Promise<DisposalGuideConfig> {
  const { config } = await loadDisposalGuideConfigWithDiagnostics();
  return config;
}
