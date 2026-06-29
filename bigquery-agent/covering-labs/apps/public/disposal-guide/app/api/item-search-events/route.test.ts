import { handleItemSearchEvent } from '@/src/server/itemSearchEvents';
import { POST } from './route';

jest.mock('@/src/server/itemSearchEvents', () => ({
  handleItemSearchEvent: jest.fn(),
}));

const handleItemSearchEventMock = handleItemSearchEvent as jest.MockedFunction<typeof handleItemSearchEvent>;

describe('item search events route', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('passes parsed JSON payloads to the server handler without blocking the response', async () => {
    handleItemSearchEventMock.mockResolvedValue({ ok: true, status: 'stored' });

    const request = new Request('https://public-labs.covering.app/disposal-guide/api/item-search-events', {
      method: 'POST',
      body: JSON.stringify({ item_search_keyword: '겨울 이불' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(handleItemSearchEventMock).toHaveBeenCalledWith({ item_search_keyword: '겨울 이불' });
  });

  it('returns 204 even when the server handler rejects', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    handleItemSearchEventMock.mockRejectedValue(new Error('db down'));

    const request = new Request('https://public-labs.covering.app/disposal-guide/api/item-search-events', {
      method: 'POST',
      body: JSON.stringify({ item_search_keyword: '겨울 이불' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(handleItemSearchEventMock).toHaveBeenCalledWith({ item_search_keyword: '겨울 이불' });
    expect(console.error).toHaveBeenCalledWith('disposal-guide item search event handler failed', {
      error: 'db down',
    });
  });

  it('drops oversized payloads before calling the server handler', async () => {
    const request = new Request('https://public-labs.covering.app/disposal-guide/api/item-search-events', {
      method: 'POST',
      headers: { 'Content-Length': String(32 * 1024 + 1) },
      body: JSON.stringify({ item_search_keyword: '겨울 이불' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(handleItemSearchEventMock).not.toHaveBeenCalled();
  });
});
