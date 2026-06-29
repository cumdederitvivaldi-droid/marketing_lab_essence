import { NextResponse } from 'next/server';
import {
  FeedbackSubmissionError,
  handleFeedbackSubmission,
} from '@/src/server/feedback';

export const runtime = 'nodejs';

/**
 * Accepts a feedback submission from the result screen and returns a safe status payload.
 */
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 });
  }

  try {
    const result = await handleFeedbackSubmission(body, {
      userAgent: request.headers.get('user-agent') ?? undefined,
      referer: request.headers.get('referer') ?? undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FeedbackSubmissionError) {
      return NextResponse.json({ ok: false, code: error.code }, { status: error.status });
    }

    console.error('disposal-guide feedback submission failed', error);
    return NextResponse.json(
      { ok: false, code: 'feedback_submission_failed' },
      { status: 500 },
    );
  }
}
