import { resolveKeyboardOffset } from './useKeyboardOffset';

describe('resolveKeyboardOffset', () => {
  it('keeps the raw visualViewport keyboard offset in the normal case', () => {
    expect(
      resolveKeyboardOffset({
        innerHeight: 800,
        visualViewportHeight: 500,
        visualViewportOffsetTop: 0,
        floatingElementHeight: 96,
        topMargin: 8,
      }),
    ).toBe(300);
  });

  it('clamps an overestimated offset so the floating element top stays visible', () => {
    const offset = resolveKeyboardOffset({
      innerHeight: 800,
      visualViewportHeight: 40,
      visualViewportOffsetTop: 0,
      floatingElementHeight: 96,
      topMargin: 8,
    });

    expect(offset).toBe(696);
    expect(800 - offset - 96).toBe(8);
  });

  it('keeps the floating element top below visualViewport offsetTop plus margin', () => {
    const offset = resolveKeyboardOffset({
      innerHeight: 800,
      visualViewportHeight: 10,
      visualViewportOffsetTop: 40,
      floatingElementHeight: 100,
      topMargin: 24,
    });

    expect(offset).toBe(636);
    expect(800 - offset - 100).toBe(64);
  });

  it('does not return a negative offset when the floating element is taller than the viewport', () => {
    expect(
      resolveKeyboardOffset({
        innerHeight: 800,
        visualViewportHeight: 0,
        visualViewportOffsetTop: 0,
        floatingElementHeight: 900,
      }),
    ).toBe(0);
  });

  it('uses visualViewport offsetTop in the same layout viewport coordinate space', () => {
    expect(
      resolveKeyboardOffset({
        innerHeight: 800,
        visualViewportHeight: 500,
        visualViewportOffsetTop: 80,
        floatingElementHeight: 96,
        topMargin: 8,
      }),
    ).toBe(220);
  });

  it('preserves legacy raw offset behavior when no floating element height is provided', () => {
    expect(
      resolveKeyboardOffset({
        innerHeight: 800,
        visualViewportHeight: 40,
        visualViewportOffsetTop: 0,
      }),
    ).toBe(760);
  });

  it('normalizes invalid viewport values without returning NaN or negative offsets', () => {
    expect(
      resolveKeyboardOffset({
        innerHeight: Number.NaN,
        visualViewportHeight: 500,
        visualViewportOffsetTop: -20,
        floatingElementHeight: 96,
      }),
    ).toBe(0);

    expect(
      resolveKeyboardOffset({
        innerHeight: 800,
        visualViewportHeight: Number.NaN,
        visualViewportOffsetTop: 0,
        floatingElementHeight: 96,
      }),
    ).toBe(0);

    expect(
      resolveKeyboardOffset({
        innerHeight: 800,
        visualViewportHeight: 900,
        visualViewportOffsetTop: 0,
        floatingElementHeight: 96,
      }),
    ).toBe(0);
  });
});
