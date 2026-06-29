export const DISPOSAL_GUIDE_CLOSE_PAYLOAD = {
  type: 'close',
  action: 'close',
  event: 'close',
  command: 'closeWebView',
} as const;

export const DISPOSAL_GUIDE_CLOSE_MESSAGE = JSON.stringify(DISPOSAL_GUIDE_CLOSE_PAYLOAD);
export const DISPOSAL_GUIDE_CLOSE_MESSAGES = [
  DISPOSAL_GUIDE_CLOSE_MESSAGE,
  JSON.stringify({ type: 'CLOSE_WEBVIEW' }),
  JSON.stringify({ type: 'closeWebView' }),
] as const;

type DisposalGuideClosePayload = typeof DISPOSAL_GUIDE_CLOSE_PAYLOAD;

interface ReactNativeWebViewBridge {
  postMessage?: (message: string) => void;
}

interface WebKitMessageHandler {
  postMessage?: (message: DisposalGuideClosePayload) => void;
}

interface FlutterInAppWebViewBridge {
  callHandler?: (handlerName: string, payload: DisposalGuideClosePayload) => unknown;
}

interface DisposalGuideWindow {
  ReactNativeWebView?: ReactNativeWebViewBridge;
  webkit?: { messageHandlers?: Record<string, WebKitMessageHandler | undefined> };
  flutter_inappwebview?: FlutterInAppWebViewBridge;
  location?: {
    href?: string;
    assign?: (url: string) => void;
  };
  parent?: {
    location?: { origin?: string };
    postMessage?: (message: string, targetOrigin: string) => void;
  };
  setTimeout?: (handler: () => void, timeout?: number) => unknown;
  close?: () => void;
}

const WEBKIT_CLOSE_HANDLER_NAMES = [
  'close',
  'closeWebView',
  'close_webview',
  'CLOSE_WEBVIEW',
  'ReactNativeWebView',
  'covering',
  'webview',
] as const;

const CLOSE_SIGNAL_FALLBACK_DELAY_MS = 80;

const FLUTTER_CLOSE_HANDLER_NAMES = [
  'close',
  'closeWebView',
  'close_webview',
  'CLOSE_WEBVIEW',
  'covering',
] as const;

const FALLBACK_NAVIGATION_DELAY_MS = 350;

interface CloseDisposalGuideOptions {
  fallbackUrl?: string;
  fallbackDelayMs?: number;
}

export function closeDisposalGuide(
  targetWindow: DisposalGuideWindow | undefined =
    typeof window === 'undefined' ? undefined : window,
  options: CloseDisposalGuideOptions = {},
): void {
  if (!targetWindow) return;

  postReactNativeCloseMessages(targetWindow);
  postWebKitCloseMessages(targetWindow);
  callFlutterCloseHandlers(targetWindow);
  postParentCloseMessages(targetWindow);
  scheduleFallbackNavigation(targetWindow, options);

  if (typeof targetWindow.close === 'function') {
    targetWindow.close();
  }
}

function postReactNativeCloseMessages(targetWindow: DisposalGuideWindow): void {
  const rnWebView = targetWindow.ReactNativeWebView;
  const postMessage = rnWebView?.postMessage;
  if (typeof postMessage !== 'function') return;

  sendFallbackSignals(targetWindow, DISPOSAL_GUIDE_CLOSE_MESSAGES, (message) => {
    postMessage.call(rnWebView, message);
  });
}

function postWebKitCloseMessages(targetWindow: DisposalGuideWindow): void {
  const handlers = targetWindow.webkit?.messageHandlers;
  if (!handlers) return;

  for (const handlerName of WEBKIT_CLOSE_HANDLER_NAMES) {
    const handler = handlers[handlerName];
    const postMessage = handler?.postMessage;
    if (typeof postMessage !== 'function') continue;

    safely(() => postMessage.call(handler, DISPOSAL_GUIDE_CLOSE_PAYLOAD));
  }
}

function callFlutterCloseHandlers(targetWindow: DisposalGuideWindow): void {
  const flutterInAppWebView = targetWindow.flutter_inappwebview;
  const callHandler = flutterInAppWebView?.callHandler;
  if (typeof callHandler !== 'function') return;

  for (const handlerName of FLUTTER_CLOSE_HANDLER_NAMES) {
    safely(() => {
      const result = callHandler.call(
        flutterInAppWebView,
        handlerName,
        DISPOSAL_GUIDE_CLOSE_PAYLOAD,
      );
      void Promise.resolve(result).catch(() => undefined);
    });
  }
}

function postParentCloseMessages(targetWindow: DisposalGuideWindow): void {
  if (!targetWindow.parent || targetWindow.parent === targetWindow) return;
  if (typeof targetWindow.parent.postMessage !== 'function') return;

  const targetOrigin = getParentTargetOrigin(targetWindow.parent);

  sendFallbackSignals(targetWindow, DISPOSAL_GUIDE_CLOSE_MESSAGES, (message) => {
    targetWindow.parent?.postMessage?.(message, targetOrigin);
  });
}

function getParentTargetOrigin(parent: NonNullable<DisposalGuideWindow['parent']>): string {
  try {
    return parent.location?.origin || '*';
  } catch {
    return '*';
  }
}

function scheduleFallbackNavigation(
  targetWindow: DisposalGuideWindow,
  options: CloseDisposalGuideOptions,
): void {
  const fallbackUrl = options.fallbackUrl;
  if (!fallbackUrl) return;

  const navigate = () => {
    safely(() => {
      if (typeof targetWindow.location?.assign === 'function') {
        targetWindow.location.assign(fallbackUrl);
        return;
      }

      if (targetWindow.location) {
        targetWindow.location.href = fallbackUrl;
      }
    });
  };

  const delay = options.fallbackDelayMs ?? FALLBACK_NAVIGATION_DELAY_MS;
  if (delay <= 0 || typeof targetWindow.setTimeout !== 'function') {
    navigate();
    return;
  }

  targetWindow.setTimeout(navigate, delay);
}

function sendFallbackSignals<T>(
  targetWindow: DisposalGuideWindow,
  signals: readonly T[],
  send: (signal: T) => void,
): void {
  signals.forEach((signal, index) => {
    const sendSignal = () => safely(() => send(signal));
    const delay = index * CLOSE_SIGNAL_FALLBACK_DELAY_MS;

    if (delay === 0 || typeof targetWindow.setTimeout !== 'function') {
      sendSignal();
      return;
    }

    targetWindow.setTimeout(sendSignal, delay);
  });
}

function safely(callback: () => void): void {
  try {
    callback();
  } catch {
    // Keep trying the remaining bridge contracts.
  }
}
