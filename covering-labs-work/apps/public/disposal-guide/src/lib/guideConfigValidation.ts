import { createHash } from 'crypto';
import { DEFAULT_GUIDE_CONFIG, DEFAULT_RECOMMENDATION_COPY } from '../data/defaultGuideConfig';
import type {
  Category,
  DisposalGuideChoices,
  DisposalGuideConfig,
  HazardousCategory,
  HazardousMatch,
  LengthRange,
  PerceivedWeight,
  Recommendation,
  RecommendationAction,
  RecommendationCondition,
  RecommendationCopy,
  RecommendationRule,
  StepChoice,
  WeightRange,
} from '../types';

export type GuideConfigMode = 'default' | 'supabase_optional' | 'supabase_strict';
export type GuideConfigSource = 'supabase' | 'sheet' | 'fallback';
export type GuideConfigValidationStatus = 'valid' | 'fallback' | 'invalid';
export type TableStatus = 'success' | 'fetch_failed';

export interface TableRows<T> {
  status: TableStatus;
  rows: T[];
  errorCode?: string;
}

export interface StepChoiceRow {
  step: 'category' | 'weight' | 'perceived_weight' | 'splittable';
  choice_id: string;
  label: string;
  description: string | null;
  sort_order: number;
}

export interface HazardousKeywordRow {
  keyword: string;
  category: HazardousCategory;
  sort_order: number;
}

export interface RecommendationRuleRow {
  rule_id: string;
  priority: number;
  condition: unknown;
  action: string;
}

export interface RecommendationCopyRow {
  recommendation: string;
  title: string;
  description: string;
  cta: string;
  sort_order?: number;
}

export interface SupabaseGuideConfigRows {
  choices: TableRows<StepChoiceRow>;
  rules: TableRows<RecommendationRuleRow>;
  copy: TableRows<RecommendationCopyRow>;
  hazardous: TableRows<HazardousKeywordRow>;
}

export interface GuideConfigDiagnostics {
  ok: boolean;
  requestedMode: GuideConfigMode;
  resolvedSource: GuideConfigSource;
  hazardousSource?: GuideConfigSource;
  validationStatus: GuideConfigValidationStatus;
  rowCounts: Record<keyof SupabaseGuideConfigRows, number>;
  validRowCounts: Record<keyof SupabaseGuideConfigRows, number>;
  configChecksum?: string;
  fallbackReasonCode?: string;
  validationErrorCodes: string[];
  validatedAt: string;
}

export interface GuideConfigLoadResult {
  config: DisposalGuideConfig;
  diagnostics: GuideConfigDiagnostics;
}

const VALID_CATEGORIES: Category[] = [
  'GENERAL_FOOD_RECYCLE',
  'APPLIANCE_FURNITURE',
  'BEDDING_CLOTHES_MISC',
  'ETC',
];
const VALID_LENGTHS: LengthRange[] = [
  'UNDER_80',
  'AROUND_80',
  'OVER_80_UNDER_140',
  'OVER_140_UNDER_150',
  'OVER_150',
];
const VALID_WEIGHTS: WeightRange[] = [
  'UNDER_15',
  'OVER_15_UNDER_25',
  'OVER_25',
  'UNKNOWN',
];
const VALID_PERCEIVED_WEIGHTS: PerceivedWeight[] = [
  'EASY_TO_LIFT',
  'HARD_TO_HOLD_LONG',
  'HARD_TO_LIFT',
];
const VALID_RECOMMENDATIONS: Recommendation[] = [
  'VISIT_PICKUP',
  'LARGE_COVERING_BAG',
  'GENERAL_BAG_MULTIPLE',
  'GENERAL_BAG_SINGLE',
];
const VALID_ACTIONS: RecommendationAction[] = [
  ...VALID_RECOMMENDATIONS,
  'HEAVY_SPLIT_DECISION',
];
const VALID_HAZARDOUS_CATEGORIES: HazardousCategory[] = [
  'PHARMACEUTICAL',
  'HAZARDOUS_WASTE',
];
const REQUIRED_CHOICE_IDS: Record<StepChoiceRow['step'], string[]> = {
  category: VALID_CATEGORIES,
  weight: VALID_WEIGHTS,
  perceived_weight: VALID_PERCEIVED_WEIGHTS,
  splittable: ['CAN_SPLIT', 'CANNOT_SPLIT', 'UNKNOWN'],
};
const VALID_CONDITION_KEYS = new Set([
  'categoryMode',
  'lengthIn',
  'weightIn',
  'perceivedWeightIn',
  'bagAcceptableLength',
  'anyOf',
  'allOf',
  'not',
]);

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

function invalidCondition(): RecommendationCondition {
  return { __invalid: true };
}

function isInvalidCondition(condition: RecommendationCondition): boolean {
  return condition.__invalid === true;
}

function parseEnumArray<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length === 0) return undefined;
  const parsed = value.filter((item): item is T => isOneOf(item, allowed));
  return parsed.length === value.length ? parsed : undefined;
}

function parseCondition(value: unknown, depth = 0): RecommendationCondition {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 5) {
    return invalidCondition();
  }

  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => !VALID_CONDITION_KEYS.has(key))) {
    return invalidCondition();
  }

  const condition: RecommendationCondition = {};

  if ('categoryMode' in source) {
    if (!isOneOf(source.categoryMode, ['GENERAL_ONLY', 'SPLITTABLE_ONLY'] as const)) {
      return invalidCondition();
    }
    condition.categoryMode = source.categoryMode;
  }

  if ('lengthIn' in source) {
    const lengthIn = parseEnumArray(source.lengthIn, VALID_LENGTHS);
    if (!lengthIn) return invalidCondition();
    condition.lengthIn = lengthIn;
  }

  if ('weightIn' in source) {
    const weightIn = parseEnumArray(source.weightIn, VALID_WEIGHTS);
    if (!weightIn) return invalidCondition();
    condition.weightIn = weightIn;
  }

  if ('perceivedWeightIn' in source) {
    const perceivedWeightIn = parseEnumArray(source.perceivedWeightIn, VALID_PERCEIVED_WEIGHTS);
    if (!perceivedWeightIn) return invalidCondition();
    condition.perceivedWeightIn = perceivedWeightIn;
  }

  if ('bagAcceptableLength' in source) {
    if (source.bagAcceptableLength !== true) return invalidCondition();
    condition.bagAcceptableLength = true;
  }

  if ('anyOf' in source) {
    if (!Array.isArray(source.anyOf) || source.anyOf.length === 0) return invalidCondition();
    const anyOf = source.anyOf.map((item) => parseCondition(item, depth + 1));
    if (anyOf.some(isInvalidCondition)) return invalidCondition();
    condition.anyOf = anyOf;
  }

  if ('allOf' in source) {
    if (!Array.isArray(source.allOf) || source.allOf.length === 0) return invalidCondition();
    const allOf = source.allOf.map((item) => parseCondition(item, depth + 1));
    if (allOf.some(isInvalidCondition)) return invalidCondition();
    condition.allOf = allOf;
  }

  if ('not' in source) {
    const not = parseCondition(source.not, depth + 1);
    if (isInvalidCondition(not)) return invalidCondition();
    condition.not = not;
  }

  return condition;
}

function isChoiceForStep(row: StepChoiceRow): boolean {
  if (!row.choice_id || !row.label) return false;
  if (row.step === 'category') return isOneOf(row.choice_id, VALID_CATEGORIES);
  if (row.step === 'weight') return isOneOf(row.choice_id, VALID_WEIGHTS);
  if (row.step === 'perceived_weight') {
    return isOneOf(row.choice_id, VALID_PERCEIVED_WEIGHTS);
  }
  return ['CAN_SPLIT', 'CANNOT_SPLIT', 'UNKNOWN'].includes(row.choice_id);
}

function choiceFromRow(row: StepChoiceRow): StepChoice {
  return {
    id: row.choice_id,
    label: row.label,
    description: row.description ?? undefined,
  };
}

function mergeChoices(rows: StepChoiceRow[]): DisposalGuideChoices {
  const byStep = rows
    .filter(isChoiceForStep)
    .sort((a, b) => a.sort_order - b.sort_order)
    .reduce<Record<StepChoiceRow['step'], StepChoice[]>>(
      (acc, row) => {
        acc[row.step].push(choiceFromRow(row));
        return acc;
      },
      {
        category: [],
        weight: [],
        perceived_weight: [],
        splittable: [],
      },
    );

  return {
    categories: byStep.category,
    weights: byStep.weight,
    perceivedWeights: byStep.perceived_weight,
    splittable: byStep.splittable,
  };
}

function validateChoiceCompleteness(rows: StepChoiceRow[]): string[] {
  const errors: string[] = [];
  const idsByStep: Record<StepChoiceRow['step'], Set<string>> = {
    category: new Set(),
    weight: new Set(),
    perceived_weight: new Set(),
    splittable: new Set(),
  };
  const seen = new Set<string>();

  for (const row of rows.filter(isChoiceForStep)) {
    const key = `${row.step}:${row.choice_id}`;
    if (seen.has(key)) {
      errors.push('choices_duplicate_choice');
    }
    seen.add(key);
    idsByStep[row.step].add(row.choice_id);
  }

  for (const [step, ids] of Object.entries(REQUIRED_CHOICE_IDS) as Array<[StepChoiceRow['step'], string[]]>) {
    for (const id of ids) {
      if (!idsByStep[step].has(id)) {
        errors.push(`choices_missing_${step}_${id.toLowerCase()}`);
      }
    }
  }

  return Array.from(new Set(errors));
}

function rulesFromRows(rows: RecommendationRuleRow[]) {
  const valid: RecommendationRule[] = [];
  const seenRuleIds = new Set<string>();
  let malformed = 0;

  for (const row of rows) {
    if (!row.rule_id || seenRuleIds.has(row.rule_id) || !isOneOf(row.action, VALID_ACTIONS)) {
      malformed += 1;
      continue;
    }
    seenRuleIds.add(row.rule_id);

    const condition = parseCondition(row.condition);
    if (isInvalidCondition(condition)) {
      malformed += 1;
      continue;
    }

    valid.push({
      id: row.rule_id,
      priority: row.priority,
      condition,
      action: row.action as RecommendationAction,
    });
  }

  return {
    rows: valid.sort((a, b) => a.priority - b.priority),
    malformed,
  };
}

function copyFromRows(rows: RecommendationCopyRow[]) {
  const copy = { ...DEFAULT_RECOMMENDATION_COPY };
  const validRecommendations = new Set<Recommendation>();
  let malformed = 0;

  for (const row of rows) {
    if (!isOneOf(row.recommendation, VALID_RECOMMENDATIONS) || !row.title || !row.description || !row.cta) {
      malformed += 1;
      continue;
    }

    validRecommendations.add(row.recommendation);
    copy[row.recommendation] = {
      recommendation: row.recommendation,
      title: row.title,
      description: row.description,
      cta: row.cta,
    };
  }

  return {
    copy,
    validRecommendations,
    malformed,
  };
}

function hazardousFromRows(rows: HazardousKeywordRow[]) {
  const valid = rows
    .map((row) => ({
      keyword: row.keyword.trim(),
      category: row.category,
      sort_order: row.sort_order,
    }))
    .filter((row) => row.keyword.length > 0 && isOneOf(row.category, VALID_HAZARDOUS_CATEGORIES))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({
      keyword: row.keyword,
      category: row.category,
    }));

  return {
    rows: valid,
    malformed: rows.length - valid.length,
  };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stable(item)]),
  );
}

export function checksumGuideConfig(config: DisposalGuideConfig): string {
  const json = JSON.stringify(stable({
    choices: config.choices,
    hazardousKeywords: config.hazardousKeywords,
    recommendationCopy: config.recommendationCopy,
    recommendationRules: config.recommendationRules,
  }));
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

function emptyRowCounts(): Record<keyof SupabaseGuideConfigRows, number> {
  return {
    choices: 0,
    rules: 0,
    copy: 0,
    hazardous: 0,
  };
}

export function buildFallbackGuideConfigResult(
  requestedMode: GuideConfigMode,
  options: {
    dataSource?: GuideConfigSource;
    resolvedSource?: GuideConfigSource;
    hazardousSource?: GuideConfigSource;
    hazardousKeywords?: HazardousMatch[];
    fallbackReasonCode?: string;
    validationErrorCodes?: string[];
    ok?: boolean;
    validationStatus?: GuideConfigValidationStatus;
  } = {},
): GuideConfigLoadResult {
  const dataSource = options.dataSource ?? 'fallback';
  const config: DisposalGuideConfig = {
    ...DEFAULT_GUIDE_CONFIG,
    hazardousKeywords: options.hazardousKeywords ?? DEFAULT_GUIDE_CONFIG.hazardousKeywords,
    dataSource,
  };

  return {
    config,
    diagnostics: {
      ok: options.ok ?? true,
      requestedMode,
      resolvedSource: options.resolvedSource ?? dataSource,
      hazardousSource: options.hazardousSource ?? dataSource,
      validationStatus: options.validationStatus ?? 'valid',
      rowCounts: emptyRowCounts(),
      validRowCounts: emptyRowCounts(),
      configChecksum: checksumGuideConfig(config),
      fallbackReasonCode: options.fallbackReasonCode,
      validationErrorCodes: options.validationErrorCodes ?? [],
      validatedAt: new Date().toISOString(),
    },
  };
}

function hasCatchAllRule(rules: RecommendationRule[]): boolean {
  return rules.some((rule) => Object.keys(rule.condition).length === 0);
}

function hasDuplicatePriority(rules: RecommendationRule[]): boolean {
  const priorities = new Set<number>();
  for (const rule of rules) {
    if (priorities.has(rule.priority)) return true;
    priorities.add(rule.priority);
  }
  return false;
}

function buildRowCounts(rows: SupabaseGuideConfigRows): Record<keyof SupabaseGuideConfigRows, number> {
  return {
    choices: rows.choices.rows.length,
    rules: rows.rules.rows.length,
    copy: rows.copy.rows.length,
    hazardous: rows.hazardous.rows.length,
  };
}

export function validateSupabaseGuideConfig(
  rows: SupabaseGuideConfigRows,
  requestedMode: GuideConfigMode,
): GuideConfigLoadResult {
  const validationErrorCodes: string[] = [];
  const rowCounts = buildRowCounts(rows);

  (Object.keys(rows) as Array<keyof SupabaseGuideConfigRows>).forEach((table) => {
    if (rows[table].status === 'fetch_failed') {
      validationErrorCodes.push(`${table}_fetch_failed`);
    }
    if (rows[table].rows.length === 0) {
      validationErrorCodes.push(`${table}_empty`);
    }
  });

  const choices = mergeChoices(rows.choices.rows);
  const ruleResult = rulesFromRows(rows.rules.rows);
  const copyResult = copyFromRows(rows.copy.rows);
  const hazardousResult = hazardousFromRows(rows.hazardous.rows);

  if (rows.choices.rows.length !== Object.values(choices).flat().length) {
    validationErrorCodes.push('choices_malformed_rows');
  }
  validationErrorCodes.push(...validateChoiceCompleteness(rows.choices.rows));
  if (choices.categories.length === 0) validationErrorCodes.push('choices_missing_category');
  if (choices.weights.length === 0) validationErrorCodes.push('choices_missing_weight');
  if (choices.perceivedWeights.length === 0) validationErrorCodes.push('choices_missing_perceived_weight');
  if (choices.splittable.length === 0) validationErrorCodes.push('choices_missing_splittable');
  if (ruleResult.malformed > 0) validationErrorCodes.push('rules_malformed_rows');
  if (!hasCatchAllRule(ruleResult.rows)) validationErrorCodes.push('rules_missing_catch_all');
  if (hasDuplicatePriority(ruleResult.rows)) validationErrorCodes.push('rules_duplicate_priority');
  if (copyResult.malformed > 0) validationErrorCodes.push('copy_malformed_rows');
  for (const recommendation of VALID_RECOMMENDATIONS) {
    if (!copyResult.validRecommendations.has(recommendation)) {
      validationErrorCodes.push(`copy_missing_${recommendation.toLowerCase()}`);
    }
  }
  if (hazardousResult.malformed > 0) validationErrorCodes.push('hazardous_malformed_rows');

  const validRowCounts: Record<keyof SupabaseGuideConfigRows, number> = {
    choices: Object.values(choices).flat().length,
    rules: ruleResult.rows.length,
    copy: copyResult.validRecommendations.size,
    hazardous: hazardousResult.rows.length,
  };

  const isValid = validationErrorCodes.length === 0;
  if (!isValid) {
    const fallback = buildFallbackGuideConfigResult(requestedMode, {
      fallbackReasonCode: 'supabase_invalid',
      validationErrorCodes,
      ok: requestedMode !== 'supabase_strict',
      validationStatus: requestedMode === 'supabase_strict' ? 'invalid' : 'fallback',
    });
    return {
      config: fallback.config,
      diagnostics: {
        ...fallback.diagnostics,
        rowCounts,
        validRowCounts,
      },
    };
  }

  const config: DisposalGuideConfig = {
    choices,
    recommendationRules: ruleResult.rows,
    recommendationCopy: copyResult.copy,
    hazardousKeywords: hazardousResult.rows,
    dataSource: 'supabase',
  };

  return {
    config,
    diagnostics: {
      ok: true,
      requestedMode,
      resolvedSource: 'supabase',
      hazardousSource: 'supabase',
      validationStatus: 'valid',
      rowCounts,
      validRowCounts,
      configChecksum: checksumGuideConfig(config),
      validationErrorCodes: [],
      validatedAt: new Date().toISOString(),
    },
  };
}
