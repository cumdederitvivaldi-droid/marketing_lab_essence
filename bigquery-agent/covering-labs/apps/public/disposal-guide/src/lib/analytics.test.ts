const mixpanel = {
  init: jest.fn(),
  identify: jest.fn(),
  register: jest.fn(),
  track: jest.fn(),
};

jest.mock('mixpanel-browser', () => ({
  __esModule: true,
  default: mixpanel,
}));

function installWindow(search = '?source=qa&app_user_id=user-1') {
  const storage = new Map<string, string>();

  Object.defineProperty(global, 'window', {
    configurable: true,
    value: {
      location: {
        search,
        pathname: '/disposal-guide',
        origin: 'https://public-labs.covering.app',
      },
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      crypto: {
        randomUUID: () => 'session-id',
      },
    },
  });
}

describe('analytics', () => {
  beforeEach(() => {
    jest.resetModules();
    mixpanel.init.mockClear();
    mixpanel.identify.mockClear();
    mixpanel.register.mockClear();
    mixpanel.track.mockClear();
    installWindow();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, 'window');
  });

  it('builds stable event names', () => {
    const { clickEventName, routeEventName, viewEventName } = require('./analytics') as typeof import('./analytics');

    expect(routeEventName('result')).toBe('[ROUTE] GuideServiceRecommendationResultScreen');
    expect(clickEventName('step_weight', 'choice')).toBe(
      '[CLICK] GuideServiceRecommendationWeightScreen_choice',
    );
    expect(viewEventName('result', 'result')).toBe('[VIEW] GuideServiceRecommendationResultScreen_result');
  });

  it('initializes Mixpanel through the same-origin proxy', () => {
    const { initAnalytics } = require('./analytics') as typeof import('./analytics');

    initAnalytics();

    expect(mixpanel.init).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        api_host: '/api/mixpanel',
        api_routes: {
          track: 'track/',
          engage: 'engage/',
          groups: 'groups/',
          record: 'record/',
          flags: 'flags/',
          settings: 'settings/',
        },
        track_pageview: false,
        property_blacklist: ['$current_url'],
      }),
    );
    expect(mixpanel.identify).toHaveBeenCalledWith('user-1');
    expect(mixpanel.register).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'qa',
        session_id: 'session-id',
        app_user_id: 'user-1',
      }),
    );
  });

  it('tracks compact props with sanitized URL and item keyword', () => {
    const { track } = require('./analytics') as typeof import('./analytics');

    track('[CLICK] test', {
      item_search_keyword: '겨울 이불',
      empty: '',
      nil: null,
    });

    expect(mixpanel.track).toHaveBeenCalledWith(
      '[CLICK] test',
      expect.objectContaining({
        item_search_keyword: '겨울 이불',
        url: 'https://public-labs.covering.app/disposal-guide',
        session_id: 'session-id',
      }),
    );
    const props = mixpanel.track.mock.calls[0][1] as Record<string, unknown>;
    expect(props.empty).toBeUndefined();
    expect(props.nil).toBeUndefined();
  });
});
