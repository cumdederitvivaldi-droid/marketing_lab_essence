import {
  buildItemSearchEventRow,
  handleItemSearchEvent,
} from './itemSearchEvents';

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

function clearSupabaseEnv() {
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.COVERING_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  delete process.env.COVERING_SUPABASE_KEY;
  delete process.env.DISPOSAL_GUIDE_ITEM_SEARCH_EVENTS_TABLE;
}

describe('item search events', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    clearSupabaseEnv();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  it('redacts and bounds the stored keyword row', () => {
    const row = buildItemSearchEventRow({
      event_name: 'item_description_submitted',
      item_search_keyword: `소파 test@example.com 010-1234-5678 ${'가'.repeat(90)}`,
      item_description_length: 140,
      categories: ['APPLIANCE_FURNITURE', 'BAD'],
      category_count: 2,
      has_food_waste: false,
      source: 'qa',
    });

    expect(row).toMatchObject({
      event_name: 'item_description_submitted',
      item_description_length: 140,
      categories: ['APPLIANCE_FURNITURE'],
      category_count: 2,
      has_food_waste: false,
      source: 'qa',
    });
    expect(String(row?.item_search_keyword)).toContain('[redacted_email]');
    expect(String(row?.item_search_keyword)).toContain('[redacted_phone]');
    expect(String(row?.item_search_keyword)).toHaveLength(80);
  });

  it('skips invalid or unconfigured payloads without throwing', async () => {
    await expect(handleItemSearchEvent({ item_search_keyword: '' })).resolves.toEqual({
      ok: false,
      status: 'invalid_payload',
    });
    await expect(handleItemSearchEvent({ item_search_keyword: '겨울 이불' })).resolves.toEqual({
      ok: false,
      status: 'skipped_missing_config',
    });
  });

  it('stores through Supabase service role aliases only', async () => {
    process.env.COVERING_SUPABASE_URL = 'https://covering-supabase.example';
    process.env.COVERING_SUPABASE_KEY = 'service-role-key';

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://covering-supabase.example/rest/v1/disposal_guide_item_search_events');
      expect(init?.headers).toMatchObject({
        apikey: 'service-role-key',
        Authorization: 'Bearer service-role-key',
        Prefer: 'return=minimal',
      });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        event_name: 'restricted_item_detected',
        item_search_keyword: '폐페인트',
        is_restricted_item: true,
        hazardous_category: 'HAZARDOUS_WASTE',
      });

      return new Response(null, { status: 201 });
    }) as jest.MockedFunction<typeof fetch>;

    global.fetch = fetchMock;

    await expect(
      handleItemSearchEvent({
        event_name: 'restricted_item_detected',
        item_search_keyword: '폐페인트',
        is_restricted_item: true,
        hazardous_category: 'HAZARDOUS_WASTE',
      }),
    ).resolves.toEqual({ ok: true, status: 'stored' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
