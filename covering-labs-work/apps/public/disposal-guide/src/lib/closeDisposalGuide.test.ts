import {
  closeDisposalGuide,
  DISPOSAL_GUIDE_CLOSE_MESSAGE,
  DISPOSAL_GUIDE_CLOSE_MESSAGES,
  DISPOSAL_GUIDE_CLOSE_PAYLOAD,
} from './closeDisposalGuide';

describe('closeDisposalGuide', () => {
  it('sends native close messages and requests window close without using browser history', () => {
    const postMessage = jest.fn();
    const close = jest.fn();
    const back = jest.fn();
    const targetWindow = {
      ReactNativeWebView: { postMessage },
      close,
      history: { back, length: 3 },
    };

    closeDisposalGuide(targetWindow);

    DISPOSAL_GUIDE_CLOSE_MESSAGES.forEach((message, index) => {
      expect(postMessage).toHaveBeenNthCalledWith(index + 1, message);
    });
    expect(DISPOSAL_GUIDE_CLOSE_MESSAGE).toContain('"action":"close"');
    expect(postMessage).toHaveBeenCalledTimes(DISPOSAL_GUIDE_CLOSE_MESSAGES.length);
    expect(close).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('notifies WebKit and Flutter webview bridges when they are available', () => {
    const close = jest.fn();
    const webkitClose = { postMessage: jest.fn() };
    const webkitCloseWebView = { postMessage: jest.fn() };
    const callHandler = jest.fn();
    const targetWindow = {
      webkit: {
        messageHandlers: {
          close: webkitClose,
          closeWebView: webkitCloseWebView,
        },
      },
      flutter_inappwebview: { callHandler },
      close,
    };

    closeDisposalGuide(targetWindow);

    expect(webkitClose.postMessage).toHaveBeenCalledWith(DISPOSAL_GUIDE_CLOSE_PAYLOAD);
    expect(webkitClose.postMessage).toHaveBeenCalledWith('close');
    expect(webkitClose.postMessage).toHaveBeenCalledTimes(1 + DISPOSAL_GUIDE_CLOSE_MESSAGES.length);
    expect(webkitCloseWebView.postMessage).toHaveBeenCalledWith(DISPOSAL_GUIDE_CLOSE_PAYLOAD);
    expect(webkitCloseWebView.postMessage).toHaveBeenCalledWith('closeWebView');
    expect(webkitCloseWebView.postMessage).toHaveBeenCalledTimes(
      1 + DISPOSAL_GUIDE_CLOSE_MESSAGES.length,
    );
    expect(callHandler).toHaveBeenCalledWith('close', DISPOSAL_GUIDE_CLOSE_PAYLOAD);
    expect(callHandler).toHaveBeenCalledWith('closeWebView', DISPOSAL_GUIDE_CLOSE_PAYLOAD);
    expect(callHandler).toHaveBeenCalledWith('CloseWebView', DISPOSAL_GUIDE_CLOSE_PAYLOAD);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('calls Android-style JavaScript interfaces and global native close handlers', () => {
    const androidCloseWebView = jest.fn();
    const androidPostMessage = jest.fn();
    const nativeClose = jest.fn();
    const globalCloseWebView = jest.fn();
    const close = jest.fn();
    const targetWindow = {
      Android: {
        closeWebView: androidCloseWebView,
        postMessage: androidPostMessage,
      },
      NativeBridge: {
        CLOSE_WEBVIEW: nativeClose,
      },
      closeWebView: globalCloseWebView,
      close,
    };

    closeDisposalGuide(targetWindow);

    expect(androidCloseWebView).toHaveBeenNthCalledWith(1);
    expect(androidCloseWebView).toHaveBeenNthCalledWith(2, DISPOSAL_GUIDE_CLOSE_MESSAGE);
    expect(androidPostMessage).toHaveBeenCalledWith(DISPOSAL_GUIDE_CLOSE_MESSAGE);
    expect(androidPostMessage).toHaveBeenCalledWith('close');
    expect(androidPostMessage).toHaveBeenCalledTimes(DISPOSAL_GUIDE_CLOSE_MESSAGES.length);
    expect(nativeClose).toHaveBeenNthCalledWith(1);
    expect(nativeClose).toHaveBeenNthCalledWith(2, DISPOSAL_GUIDE_CLOSE_MESSAGE);
    expect(globalCloseWebView).toHaveBeenNthCalledWith(1);
    expect(globalCloseWebView).toHaveBeenNthCalledWith(2, DISPOSAL_GUIDE_CLOSE_MESSAGE);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('calls nested Android postMessage bridges when available', () => {
    const androidCloseWebViewPostMessage = jest.fn();
    const close = jest.fn();
    const targetWindow = {
      Android: {
        closeWebView: { postMessage: androidCloseWebViewPostMessage },
      },
      close,
    };

    closeDisposalGuide(targetWindow);

    DISPOSAL_GUIDE_CLOSE_MESSAGES.forEach((message, index) => {
      expect(androidCloseWebViewPostMessage).toHaveBeenNthCalledWith(index + 1, message);
    });
    expect(androidCloseWebViewPostMessage).toHaveBeenCalledTimes(
      DISPOSAL_GUIDE_CLOSE_MESSAGES.length,
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('uses browser timers for fallback messages and parent frame bridge retries', () => {
    jest.useFakeTimers();

    try {
      const postMessage = jest.fn();
      const parentPostMessage = jest.fn();
      const close = jest.fn();
      const back = jest.fn();
      const targetWindow = {
        ReactNativeWebView: { postMessage },
        parent: {
          location: { origin: 'https://app.covering.test' },
          postMessage: parentPostMessage,
        },
        setTimeout,
        close,
        history: { back, length: 3 },
      };

      closeDisposalGuide(targetWindow);

      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(parentPostMessage).toHaveBeenCalledTimes(1);
      expect(parentPostMessage).toHaveBeenLastCalledWith(
        DISPOSAL_GUIDE_CLOSE_MESSAGE,
        'https://app.covering.test',
      );

      jest.advanceTimersByTime(80);

      expect(postMessage).toHaveBeenCalledTimes(2);
      expect(parentPostMessage).toHaveBeenCalledTimes(2);
      expect(parentPostMessage).toHaveBeenLastCalledWith(
        JSON.stringify({ type: 'CLOSE_WEBVIEW' }),
        'https://app.covering.test',
      );

      jest.advanceTimersByTime(80 * (DISPOSAL_GUIDE_CLOSE_MESSAGES.length - 2));

      expect(postMessage).toHaveBeenCalledTimes(DISPOSAL_GUIDE_CLOSE_MESSAGES.length);
      expect(parentPostMessage).toHaveBeenCalledTimes(DISPOSAL_GUIDE_CLOSE_MESSAGES.length);
      expect(parentPostMessage).toHaveBeenLastCalledWith(
        DISPOSAL_GUIDE_CLOSE_MESSAGES[DISPOSAL_GUIDE_CLOSE_MESSAGES.length - 1],
        'https://app.covering.test',
      );
      expect(close).toHaveBeenCalledTimes(1);
      expect(back).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not navigate back when the native bridge is unavailable', () => {
    const close = jest.fn();
    const back = jest.fn();
    const targetWindow = {
      close,
      history: { back, length: 3 },
    };

    closeDisposalGuide(targetWindow);

    expect(close).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('does not navigate to a fallback URL unless fallback navigation is explicitly allowed', () => {
    jest.useFakeTimers();

    try {
      const assign = jest.fn();
      const close = jest.fn();
      const targetWindow = {
        close,
        location: { assign },
        setTimeout,
      };

      closeDisposalGuide(targetWindow, { fallbackUrl: 'https://abr.ge/wn79bl' });

      expect(close).toHaveBeenCalledTimes(1);
      expect(assign).not.toHaveBeenCalled();

      jest.advanceTimersByTime(350);

      expect(assign).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('navigates to the fallback URL after giving native close handlers time to react when explicitly allowed', () => {
    jest.useFakeTimers();

    try {
      const assign = jest.fn();
      const close = jest.fn();
      const targetWindow = {
        close,
        location: { assign },
        setTimeout,
      };

      closeDisposalGuide(targetWindow, {
        fallbackUrl: 'https://abr.ge/wn79bl',
        allowFallbackNavigation: true,
      });

      expect(close).toHaveBeenCalledTimes(1);
      expect(assign).not.toHaveBeenCalled();

      jest.advanceTimersByTime(349);

      expect(assign).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);

      expect(assign).toHaveBeenCalledWith('https://abr.ge/wn79bl');
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls back to assigning location.href when location.assign is unavailable', () => {
    jest.useFakeTimers();

    try {
      const close = jest.fn();
      const location: { href?: string } = {};
      const targetWindow = {
        close,
        location,
        setTimeout,
      };

      closeDisposalGuide(targetWindow, {
        fallbackUrl: 'https://abr.ge/wn79bl',
        allowFallbackNavigation: true,
      });

      expect(close).toHaveBeenCalledTimes(1);
      expect(location.href).toBeUndefined();

      jest.advanceTimersByTime(350);

      expect(location.href).toBe('https://abr.ge/wn79bl');
    } finally {
      jest.useRealTimers();
    }
  });

  it('is a no-op without a window object', () => {
    expect(() => closeDisposalGuide(undefined)).not.toThrow();
  });
});
