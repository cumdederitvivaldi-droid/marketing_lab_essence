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
  'closeWebView',
  'CLOSE_WEBVIEW',
  'close_webview',
  'close',
] as const;

type DisposalGuideClosePayload = typeof DISPOSAL_GUIDE_CLOSE_PAYLOAD;
type DisposalGuideCloseBridgeMessage = DisposalGuideClosePayload | string;
type NativeCloseMethod = (message?: string) => unknown;

interface ReactNativeWebViewBridge {
  postMessage?: (message: string) => void;
}

interface WebKitMessageHandler {
  postMessage?: (message: DisposalGuideCloseBridgeMessage) => void;
}

interface FlutterInAppWebViewBridge {
  callHandler?: (handlerName: string, payload: DisposalGuideClosePayload) => unknown;
}

interface AndroidWebViewBridge {
  [methodName: string]: unknown;
  postMessage?: (message: string) => void;
}

interface DisposalGuideWindow {
  ReactNativeWebView?: ReactNativeWebViewBridge;
  webkit?: { messageHandlers?: Record<string, WebKitMessageHandler | undefined> };
  flutter_inappwebview?: FlutterInAppWebViewBridge;
  Android?: AndroidWebViewBridge;
  android?: AndroidWebViewBridge;
  WebViewBridge?: AndroidWebViewBridge;
  NativeBridge?: AndroidWebViewBridge;
  AppBridge?: AndroidWebViewBridge;
  CoveringApp?: AndroidWebViewBridge;
  coveringApp?: AndroidWebViewBridge;
  closeWebView?: NativeCloseMethod;
  close_webview?: NativeCloseMethod;
  CLOSE_WEBVIEW?: NativeCloseMethod;
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
  'closeWebview',
  'close_webview',
  'CLOSE_WEBVIEW',
  'CloseWebView',
  'covering',
] as const;

const ANDROID_CLOSE_BRIDGE_NAMES = [
  'Android',
  'android',
  'WebViewBridge',
  'NativeBridge',
  'AppBridge',
  'CoveringApp',
  'coveringApp',
] as const;

const ANDROID_CLOSE_METHOD_NAMES = [
  'closeWebView',
  'CloseWebView',
  'CLOSE_WEBVIEW',
  'closeWebview',
  'close_webview',
  'close',
] as const;

const GLOBAL_CLOSE_FUNCTION_NAMES = [
  'closeWebView',
  'close_webview',
  'CLOSE_WEBVIEW',
] as const;

const FALLBACK_NAVIGATION_DELAY_MS = 350;

interface CloseDisposalGuideOptions {
  fallbackUrl?: string;
  fallbackDelayMs?: number;
  allowFallbackNavigation?: boolean;
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
  callAndroidCloseHandlers(targetWindow);
  postParentCloseMessages(targetWindow);
  scheduleFallbackNavigation(targetWindow, options);
  callGlobalCloseHandlers(targetWindow);

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
    sendFallbackSignals(targetWindow, DISPOSAL_GUIDE_CLOSE_MESSAGES, (message) => {
      postMessage.call(handler, message);
    });
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

function callAndroidCloseHandlers(targetWindow: DisposalGuideWindow): void {
  for (const bridgeName of ANDROID_CLOSE_BRIDGE_NAMES) {
    const bridge = targetWindow[bridgeName];
    if (!bridge) continue;

    callAndroidBridgeMethods(targetWindow, bridge);

    const postMessage = bridge.postMessage;
    if (typeof postMessage !== 'function') continue;

    sendFallbackSignals(targetWindow, DISPOSAL_GUIDE_CLOSE_MESSAGES, (message) => {
      postMessage.call(bridge, message);
    });
  }
}

function callAndroidBridgeMethods(
  targetWindow: DisposalGuideWindow,
  bridge: AndroidWebViewBridge,
): void {
  for (const methodName of ANDROID_CLOSE_METHOD_NAMES) {
    const method = bridge[methodName];
    if (typeof method === 'function') {
      callNativeCloseMethod(method as NativeCloseMethod, bridge);
      continue;
    }

    if (isPostMessageBridge(method)) {
      postNestedAndroidCloseMessages(targetWindow, method);
    }
  }
}

function postNestedAndroidCloseMessages(
  targetWindow: DisposalGuideWindow,
  bridge: ReactNativeWebViewBridge,
): void {
  const postMessage = bridge.postMessage;
  if (typeof postMessage !== 'function') return;

  sendFallbackSignals(targetWindow, DISPOSAL_GUIDE_CLOSE_MESSAGES, (message) => {
    postMessage.call(bridge, message);
  });
}

function isPostMessageBridge(value: unknown): value is ReactNativeWebViewBridge {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'postMessage' in value &&
      typeof (value as ReactNativeWebViewBridge).postMessage === 'function',
  );
}

function callGlobalCloseHandlers(targetWindow: DisposalGuideWindow): void {
  for (const handlerName of GLOBAL_CLOSE_FUNCTION_NAMES) {
    const closeHandler = targetWindow[handlerName];
    if (typeof closeHandler !== 'function') continue;

    callNativeCloseMethod(closeHandler, targetWindow);
  }
}

function callNativeCloseMethod(method: NativeCloseMethod, receiver: unknown): void {
  safely(() => method.call(receiver));
  safely(() => method.call(receiver, DISPOSAL_GUIDE_CLOSE_MESSAGE));
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
  if (!options.allowFallbackNavigation) return;
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
