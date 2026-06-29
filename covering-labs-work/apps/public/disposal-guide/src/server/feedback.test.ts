import {
  buildFeedbackSubmissionPayload,
  type FeedbackSubmissionPayload,
} from '../lib/feedback';
import type { AppState } from '../types';
import {
  buildSlackText,
  FeedbackSubmissionError,
  handleFeedbackSubmission,
  normalizeFeedbackPayload,
} from './feedback';

const BASE_STATE: AppState = {
  screen: 'result',
  categories: ['APPLIANCE_FURNITURE'],
  hasFoodWaste: false,
  itemDescription: '개인정보가 담긴 품목명',
  lengthCm: 120,
  lengthRange: 'OVER_80_UNDER_140',
  weightRange: 'UNKNOWN',
  perceivedWeight: 'HARD_TO_LIFT',
  splittableStatus: 'CANNOT_SPLIT',
  resultId: 'LARGE_COVERING_BAG',
};

function createBasePayload(): FeedbackSubmissionPayload {
  return buildFeedbackSubmissionPayload('positive', 'LARGE_COVERING_BAG', BASE_STATE);
}

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

describe('disposal guide feedback', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  it('builds a client payload with a bounded item description for Slack', () => {
    const payload = createBasePayload();

    expect(payload.state.hasItemDescription).toBe(true);
    expect(payload.state.itemDescription).toBe(BASE_STATE.itemDescription);
    expect(payload.state.itemDescriptionLength).toBe(BASE_STATE.itemDescription.length);
  });

  it('rejects invalid feedback sentiment', () => {
    expect(() =>
      normalizeFeedbackPayload({
        ...createBasePayload(),
        sentiment: 'neutral',
      }),
    ).toThrow(FeedbackSubmissionError);
  });

  it('formats Slack text with recommendation and manually entered item text', () => {
    const text = buildSlackText(createBasePayload(), 'feedback-id');

    expect(text).toContain('링퀴즈 피드백: 만족해요');
    expect(text).toContain('추천 결과: 대형 커버링 봉투');
    expect(text).toContain(`수기 입력 물품: ${BASE_STATE.itemDescription}`);
    expect(text).toContain('피드백 ID: feedback-id');
  });

  it('stores feedback, posts Slack, and patches Slack status', async () => {
    process.env.SUPABASE_URL = 'https://supabase.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.SLACK_BOT_TOKEN = 'xoxb-token';
    process.env.DISPOSAL_GUIDE_FEEDBACK_SLACK_CHANNEL = 'C0B2TRG6DCK';

    const payload = { ...createBasePayload(), message: '수거 방법 안내가 명확했어요' };

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://supabase.example/rest/v1/disposal_guide_feedback') {
        const body = JSON.parse(String(init?.body));
        expect(body.message).toBe('수거 방법 안내가 명확했어요');
        expect(JSON.stringify(body)).not.toContain(BASE_STATE.itemDescription);

        return new Response(JSON.stringify([{ id: 'feedback-id' }]), { status: 201 });
      }

      if (url === 'https://slack.com/api/chat.postMessage') {
        const body = JSON.parse(String(init?.body));
        expect(body.channel).toBe('C0B2TRG6DCK');
        expect(body.text).toContain('피드백 ID: feedback-id');
        expect(body.text).toContain('추가 의견: 수거 방법 안내가 명확했어요');
        expect(body.text).toContain(`수기 입력 물품: ${BASE_STATE.itemDescription}`);

        return new Response(JSON.stringify({ ok: true, ts: '1778508212.545039' }), {
          status: 200,
        });
      }

      if (
        url ===
        'https://supabase.example/rest/v1/disposal_guide_feedback?id=eq.feedback-id'
      ) {
        expect(init?.method).toBe('PATCH');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          slack_status: 'sent',
          slack_ts: '1778508212.545039',
        });

        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as jest.MockedFunction<typeof fetch>;

    global.fetch = fetchMock;

    await expect(handleFeedbackSubmission(payload)).resolves.toEqual({
      ok: true,
      id: 'feedback-id',
      slack: {
        ok: true,
        status: 'sent',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://supabase.example/rest/v1/disposal_guide_feedback',
      'https://slack.com/api/chat.postMessage',
      'https://supabase.example/rest/v1/disposal_guide_feedback?id=eq.feedback-id',
    ]);
  });

  it('uses Covering Supabase aliases when standard feedback env names are absent', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.SLACK_BOT_TOKEN;
    process.env.COVERING_SUPABASE_URL = 'https://covering-supabase.example';
    process.env.COVERING_SUPABASE_KEY = 'covering-service-role-key';

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        apikey: 'covering-service-role-key',
        Authorization: 'Bearer covering-service-role-key',
      });

      if (url === 'https://covering-supabase.example/rest/v1/disposal_guide_feedback') {
        return new Response(JSON.stringify([{ id: 'feedback-id' }]), { status: 201 });
      }

      if (
        url ===
        'https://covering-supabase.example/rest/v1/disposal_guide_feedback?id=eq.feedback-id'
      ) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          slack_status: 'skipped_missing_config',
        });

        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as jest.MockedFunction<typeof fetch>;

    global.fetch = fetchMock;

    await expect(handleFeedbackSubmission(createBasePayload())).resolves.toEqual({
      ok: true,
      id: 'feedback-id',
      slack: {
        ok: false,
        status: 'skipped_missing_config',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('marks Slack as failed when Slack transport throws', async () => {
    process.env.SUPABASE_URL = 'https://supabase.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.SLACK_BOT_TOKEN = 'xoxb-token';
    process.env.DISPOSAL_GUIDE_FEEDBACK_SLACK_CHANNEL = 'C0B2TRG6DCK';

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://supabase.example/rest/v1/disposal_guide_feedback') {
        return new Response(JSON.stringify([{ id: 'feedback-id' }]), { status: 201 });
      }

      if (url === 'https://slack.com/api/chat.postMessage') {
        throw new Error('network down');
      }

      if (
        url ===
        'https://supabase.example/rest/v1/disposal_guide_feedback?id=eq.feedback-id'
      ) {
        expect(init?.method).toBe('PATCH');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          slack_status: 'failed',
          slack_error: 'slack_transport_network_down',
        });

        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as jest.MockedFunction<typeof fetch>;

    global.fetch = fetchMock;

    await expect(handleFeedbackSubmission(createBasePayload())).resolves.toEqual({
      ok: true,
      id: 'feedback-id',
      slack: {
        ok: false,
        status: 'failed',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('marks Slack as failed when Slack API responds ok false', async () => {
    process.env.SUPABASE_URL = 'https://supabase.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.SLACK_BOT_TOKEN = 'xoxb-token';
    process.env.DISPOSAL_GUIDE_FEEDBACK_SLACK_CHANNEL = 'C0B2TRG6DCK';

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://supabase.example/rest/v1/disposal_guide_feedback') {
        return new Response(JSON.stringify([{ id: 'feedback-id' }]), { status: 201 });
      }

      if (url === 'https://slack.com/api/chat.postMessage') {
        return new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }), {
          status: 200,
        });
      }

      if (
        url ===
        'https://supabase.example/rest/v1/disposal_guide_feedback?id=eq.feedback-id'
      ) {
        expect(init?.method).toBe('PATCH');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          slack_status: 'failed',
          slack_error: 'channel_not_found',
        });

        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as jest.MockedFunction<typeof fetch>;

    global.fetch = fetchMock;

    await expect(handleFeedbackSubmission(createBasePayload())).resolves.toEqual({
      ok: true,
      id: 'feedback-id',
      slack: {
        ok: false,
        status: 'failed',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
