import { getRingQuizCtaType, postRingQuizCtaMessage } from './ringQuizCtaBridge';

describe('ringQuizCtaBridge', () => {
  it('maps both general bag recommendations to COVERING_BAG', () => {
    expect(getRingQuizCtaType('GENERAL_BAG_SINGLE')).toBe('COVERING_BAG');
    expect(getRingQuizCtaType('GENERAL_BAG_MULTIPLE')).toBe('COVERING_BAG');
  });

  it('sends the required FlutterChannel JSON message', () => {
    const postMessage = jest.fn();

    const sent = postRingQuizCtaMessage('LARGE_COVERING_BAG', {
      FlutterChannel: { postMessage },
    });

    expect(sent).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        action: 'RING_QUIZ_CTA',
        ctaType: 'LARGE_COVERING_BAG',
      }),
    );
  });

  it('uses VISIT_PICKUP for the quote CTA', () => {
    const postMessage = jest.fn();

    postRingQuizCtaMessage('VISIT_PICKUP', {
      FlutterChannel: { postMessage },
    });

    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        action: 'RING_QUIZ_CTA',
        ctaType: 'VISIT_PICKUP',
      }),
    );
  });

  it('returns false when FlutterChannel is unavailable or fails', () => {
    expect(postRingQuizCtaMessage('GENERAL_BAG_SINGLE', {})).toBe(false);
    expect(
      postRingQuizCtaMessage('GENERAL_BAG_SINGLE', {
        FlutterChannel: {
          postMessage: () => {
            throw new Error('bridge unavailable');
          },
        },
      }),
    ).toBe(false);
  });
});
