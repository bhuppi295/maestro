// Safe wrapper for VS Code WebView API
// acquireVsCodeApi() can only be called once — this singleton handles that

declare function acquireVsCodeApi(): VsCodeApi;

interface VsCodeApi {
  postMessage: (message: unknown) => void;
  getState: <T>() => T | undefined;
  setState: <T>(state: T) => void;
}

const vscodeApi: VsCodeApi = acquireVsCodeApi();

export const vscode = {
  postMessage: (message: unknown) => vscodeApi.postMessage(message),
  getState: <T>() => vscodeApi.getState<T>(),
  setState: <T>(state: T) => vscodeApi.setState(state),
};
