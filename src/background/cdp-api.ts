export interface CdpEvent {
  readonly tabId: number;
  readonly method: string;
  readonly params?: object;
}

export interface CdpDetach {
  readonly tabId: number;
  readonly reason: string;
}

export interface CdpApi {
  attach(tabId: number, version: string): Promise<void>;
  detach(tabId: number): Promise<void>;
  send(tabId: number, method: string, params?: object): Promise<unknown>;
  addEventListener(listener: (event: CdpEvent) => void): void;
  addDetachListener(listener: (event: CdpDetach) => void): void;
}

export function createChromeCdpApi(): CdpApi {
  return {
    attach: (tabId, version) => chrome.debugger.attach({ tabId }, version),
    detach: (tabId) => chrome.debugger.detach({ tabId }),
    send: (tabId, method, params) => chrome.debugger.sendCommand({ tabId }, method, params),
    addEventListener: (listener) => chrome.debugger.onEvent.addListener(
      (source, method, params) => {
        if (source.tabId !== undefined) {
          listener({
            tabId: source.tabId,
            method,
            ...(params ? { params } : {})
          });
        }
      }
    ),
    addDetachListener: (listener) => chrome.debugger.onDetach.addListener(
      (source, reason) => {
        if (source.tabId !== undefined) {
          listener({ tabId: source.tabId, reason });
        }
      }
    )
  };
}
