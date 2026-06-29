interface Window {
  FlutterChannel?: {
    postMessage: (message: string) => void;
  };
}
