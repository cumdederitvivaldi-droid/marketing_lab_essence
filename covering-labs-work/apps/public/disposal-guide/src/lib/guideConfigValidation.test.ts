import { DEFAULT_GUIDE_CONFIG } from '../data/defaultGuideConfig';
import {
  buildFallbackGuideConfigResult,
  validateSupabaseGuideConfig,
  type SupabaseGuideConfigRows,
} from './guideConfigValidation';

const validRows: SupabaseGuideConfigRows = {
  choices: {
    status: 'success',
    rows: [
      { step: 'category', choice_id: 'GENERAL_FOOD_RECYCLE', label: '일반', description: null, sort_order: 10 },
      { step: 'category', choice_id: 'APPLIANCE_FURNITURE', label: '가전', description: null, sort_order: 20 },
      { step: 'category', choice_id: 'BEDDING_CLOTHES_MISC', label: '침구', description: null, sort_order: 30 },
      { step: 'category', choice_id: 'ETC', label: '기타', description: null, sort_order: 40 },
      { step: 'weight', choice_id: 'UNDER_15', label: '15kg 이하', description: null, sort_order: 10 },
      { step: 'weight', choice_id: 'OVER_15_UNDER_25', label: '15~25kg', description: null, sort_order: 20 },
      { step: 'weight', choice_id: 'OVER_25', label: '25kg 이상', description: null, sort_order: 30 },
      { step: 'weight', choice_id: 'UNKNOWN', label: '모름', description: null, sort_order: 40 },
      { step: 'perceived_weight', choice_id: 'EASY_TO_LIFT', label: '가벼움', description: null, sort_order: 10 },
      { step: 'perceived_weight', choice_id: 'HARD_TO_HOLD_LONG', label: '무거움', description: null, sort_order: 20 },
      { step: 'perceived_weight', choice_id: 'HARD_TO_LIFT', label: '못 듦', description: null, sort_order: 30 },
      { step: 'splittable', choice_id: 'CAN_SPLIT', label: '가능', description: null, sort_order: 10 },
      { step: 'splittable', choice_id: 'CANNOT_SPLIT', label: '불가', description: null, sort_order: 20 },
      { step: 'splittable', choice_id: 'UNKNOWN', label: '모름', description: null, sort_order: 30 },
    ],
  },
  rules: {
    status: 'success',
    rows: DEFAULT_GUIDE_CONFIG.recommendationRules.map((rule) => ({
      rule_id: rule.id,
      priority: rule.priority,
      condition: rule.condition,
      action: rule.action,
    })),
  },
  copy: {
    status: 'success',
    rows: Object.values(DEFAULT_GUIDE_CONFIG.recommendationCopy).map((copy, index) => ({
      recommendation: copy.recommendation,
      title: copy.title,
      description: copy.description,
      cta: copy.cta,
      sort_order: (index + 1) * 10,
    })),
  },
  hazardous: {
    status: 'success',
    rows: [
      { keyword: '수은체온계', category: 'HAZARDOUS_WASTE', sort_order: 10 },
      { keyword: '폐의약품', category: 'PHARMACEUTICAL', sort_order: 20 },
    ],
  },
};

function cloneRows(overrides: Partial<SupabaseGuideConfigRows> = {}): SupabaseGuideConfigRows {
  return {
    choices: { ...validRows.choices, rows: [...validRows.choices.rows] },
    rules: { ...validRows.rules, rows: [...validRows.rules.rows] },
    copy: { ...validRows.copy, rows: [...validRows.copy.rows] },
    hazardous: { ...validRows.hazardous, rows: [...validRows.hazardous.rows] },
    ...overrides,
  };
}

describe('guide config validation', () => {
  it('accepts complete Supabase rows in strict mode', () => {
    const result = validateSupabaseGuideConfig(cloneRows(), 'supabase_strict');

    expect(result.diagnostics).toMatchObject({
      ok: true,
      requestedMode: 'supabase_strict',
      resolvedSource: 'supabase',
      validationStatus: 'valid',
    });
    expect(result.diagnostics.configChecksum).toBeTruthy();
    expect(result.config.dataSource).toBe('supabase');
  });

  it('fails strict mode when one table fetch fails', () => {
    const result = validateSupabaseGuideConfig(
      cloneRows({
        rules: { status: 'fetch_failed', rows: [], errorCode: 'fetch_failed' },
      }),
      'supabase_strict',
    );

    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.validationErrorCodes).toContain('rules_fetch_failed');
    expect(result.config.dataSource).toBe('fallback');
  });

  it('fails strict mode when DB rows are partial', () => {
    const result = validateSupabaseGuideConfig(
      cloneRows({
        copy: { status: 'success', rows: [] },
      }),
      'supabase_strict',
    );

    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.validationErrorCodes).toContain('copy_empty');
    expect(result.config.dataSource).toBe('fallback');
  });

  it('fails strict mode when a required choice id is missing', () => {
    const result = validateSupabaseGuideConfig(
      cloneRows({
        choices: {
          status: 'success',
          rows: validRows.choices.rows.filter((row) => row.choice_id !== 'ETC'),
        },
      }),
      'supabase_strict',
    );

    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.validationErrorCodes).toContain('choices_missing_category_etc');
  });

  it('fails strict mode when a choice id is duplicated', () => {
    const duplicate = validRows.choices.rows[0];
    const result = validateSupabaseGuideConfig(
      cloneRows({
        choices: {
          status: 'success',
          rows: [...validRows.choices.rows, duplicate],
        },
      }),
      'supabase_strict',
    );

    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.validationErrorCodes).toContain('choices_duplicate_choice');
  });

  it('fails strict mode when a malformed rule would otherwise be dropped', () => {
    const result = validateSupabaseGuideConfig(
      cloneRows({
        rules: {
          status: 'success',
          rows: [
            ...validRows.rules.rows,
            {
              rule_id: 'malformed',
              priority: 5,
              condition: { typoWeight: ['OVER_25'] },
              action: 'VISIT_PICKUP',
            },
          ],
        },
      }),
      'supabase_strict',
    );

    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.validationErrorCodes).toContain('rules_malformed_rows');
  });

  it('fails strict mode when a rule id is duplicated', () => {
    const duplicate = validRows.rules.rows[0];
    const result = validateSupabaseGuideConfig(
      cloneRows({
        rules: {
          status: 'success',
          rows: [...validRows.rules.rows, duplicate],
        },
      }),
      'supabase_strict',
    );

    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.validationErrorCodes).toContain('rules_malformed_rows');
  });

  it('fails strict mode when a hazardous keyword is whitespace-only', () => {
    const result = validateSupabaseGuideConfig(
      cloneRows({
        hazardous: {
          status: 'success',
          rows: [
            ...validRows.hazardous.rows,
            { keyword: '   ', category: 'HAZARDOUS_WASTE', sort_order: 30 },
          ],
        },
      }),
      'supabase_strict',
    );

    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.validationErrorCodes).toContain('hazardous_malformed_rows');
  });

  it('allows optional mode to fall back when Supabase rows are invalid', () => {
    const result = validateSupabaseGuideConfig(
      cloneRows({
        rules: { status: 'fetch_failed', rows: [], errorCode: 'fetch_failed' },
      }),
      'supabase_optional',
    );

    expect(result.diagnostics).toMatchObject({
      ok: true,
      requestedMode: 'supabase_optional',
      resolvedSource: 'fallback',
      validationStatus: 'fallback',
      fallbackReasonCode: 'supabase_invalid',
    });
    expect(result.config.dataSource).toBe('fallback');
  });

  it('builds a default result without Supabase rows', () => {
    const result = buildFallbackGuideConfigResult('default');

    expect(result.diagnostics).toMatchObject({
      ok: true,
      requestedMode: 'default',
      resolvedSource: 'fallback',
      validationStatus: 'valid',
    });
    expect(result.config.dataSource).toBe('fallback');
  });
});
