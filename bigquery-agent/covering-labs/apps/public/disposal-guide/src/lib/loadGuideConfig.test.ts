import { loadDisposalGuideConfigWithDiagnostics } from './loadGuideConfig';

const originalEnv = process.env;
const originalFetch = global.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function csvResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/csv' },
  });
}

describe('loadDisposalGuideConfig', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      NEXT_PUBLIC_HAZARDOUS_SHEET_CSV_URL: 'https://example.com/hazardous.csv',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses default mode unless Supabase mode is explicitly requested', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('disposal_guide_recommendation_rules')) {
        return jsonResponse([
          {
            rule_id: 'db-default',
            priority: 1,
            condition: {},
            action: 'GENERAL_BAG_SINGLE',
          },
        ]);
      }

      if (url.includes('disposal_guide_hazardous_keywords')) {
        return jsonResponse([]);
      }

      if (url.includes('hazardous.csv')) {
        return csvResponse('keyword,category,enabled\n락스,HAZARDOUS_WASTE,TRUE\n');
      }

      return jsonResponse([]);
    }) as jest.MockedFunction<typeof fetch>;

    const { config, diagnostics } = await loadDisposalGuideConfigWithDiagnostics({ forceRefresh: true });

    expect(diagnostics.requestedMode).toBe('default');
    expect(config.dataSource).toBe('sheet');
    expect(config.hazardousKeywords).toContainEqual({
      keyword: '락스',
      category: 'HAZARDOUS_WASTE',
    });
  });

  it('reports fallback source when a configured hazardous sheet returns no usable keywords', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('hazardous.csv')) {
        return csvResponse('keyword,category,enabled\n,HAZARDOUS_WASTE,TRUE\n');
      }

      return jsonResponse([]);
    }) as jest.MockedFunction<typeof fetch>;

    const { config, diagnostics } = await loadDisposalGuideConfigWithDiagnostics({ forceRefresh: true });

    expect(diagnostics.requestedMode).toBe('default');
    expect(config.dataSource).toBe('fallback');
    expect(diagnostics.hazardousSource).toBe('fallback');
  });

  it('falls back in optional mode when Supabase recommendation rules are malformed', async () => {
    process.env.GUIDE_CONFIG_MODE = 'supabase_optional';
    delete process.env.NEXT_PUBLIC_HAZARDOUS_SHEET_CSV_URL;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('disposal_guide_recommendation_rules')) {
        return jsonResponse([
          {
            rule_id: 'malformed',
            priority: 1,
            condition: { typoWeight: ['OVER_25'] },
            action: 'VISIT_PICKUP',
          },
        ]);
      }

      return jsonResponse([]);
    }) as jest.MockedFunction<typeof fetch>;

    const { config, diagnostics } = await loadDisposalGuideConfigWithDiagnostics({ forceRefresh: true });

    expect(diagnostics).toMatchObject({
      ok: true,
      requestedMode: 'supabase_optional',
      validationStatus: 'fallback',
      fallbackReasonCode: 'supabase_invalid',
    });
    expect(config.recommendationRules).not.toContainEqual(
      expect.objectContaining({ id: 'malformed' }),
    );
  });
});
