import { GET, OPTIONS, POST } from './route';

const ORIGINAL_FETCH = global.fetch;

describe('mixpanel proxy route', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  it('forwards track requests with raw body, query, and content type', async () => {
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => {
      return new Response('1', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const request = new Request('https://public-labs.covering.app/disposal-guide/api/mixpanel/track/?verbose=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: 'private-cookie=1',
        Authorization: 'Bearer private-token',
      },
      body: 'data=abc',
    });

    const response = await POST(request, { params: { route: ['track'] } });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-js.mixpanel.com/track?verbose=1',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(ArrayBuffer),
        cache: 'no-store',
      }),
    );

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('authorization')).toBeNull();
    expect(Buffer.from(fetchMock.mock.calls[0][1]?.body as ArrayBuffer).toString('utf8')).toBe('data=abc');
  });

  it('rejects unsupported routes without calling upstream', async () => {
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const request = new Request('https://public-labs.covering.app/disposal-guide/api/mixpanel/flags/', {
      method: 'POST',
      body: 'data=abc',
    });
    const response = await POST(request, { params: { route: ['flags'] } });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows Mixpanel engage requests used by identify without opening other routes', async () => {
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => {
      return new Response('1', { status: 200 });
    }) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const request = new Request('https://public-labs.covering.app/disposal-guide/api/mixpanel/engage/?verbose=1', {
      method: 'POST',
      body: 'data=abc',
    });
    const response = await POST(request, { params: { route: ['engage'] } });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-js.mixpanel.com/engage?verbose=1',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects oversized payloads', async () => {
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const request = new Request('https://public-labs.covering.app/disposal-guide/api/mixpanel/track/', {
      method: 'POST',
      body: 'a'.repeat(256 * 1024 + 1),
    });
    const response = await POST(request, { params: { route: ['track'] } });

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports GET and OPTIONS', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('1', { status: 200 });
    }) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const getResponse = await GET(
      new Request('https://public-labs.covering.app/disposal-guide/api/mixpanel/track/?ip=1'),
      { params: { route: ['track'] } },
    );
    const optionsResponse = await OPTIONS();

    expect(getResponse.status).toBe(200);
    expect(optionsResponse.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-js.mixpanel.com/track?ip=1',
      expect.objectContaining({ method: 'GET', body: undefined }),
    );
  });
});
