import {
  isSunoPageBridgeMessage,
  postSunoPageBridgeRequest
} from './page-bridge';
import { SunoAdapter, type SunoSnapshot } from './suno-adapter';

export const SNAPSHOT_REQUEST_TYPE = 'suno-video-sync:snapshot-request/v1';
export const SNAPSHOT_RESPONSE_TYPE = 'suno-video-sync:snapshot-response/v1';

interface SnapshotReader {
  readSnapshot(): Promise<SunoSnapshot>;
}

export function createSnapshotRequestHandler(reader: SnapshotReader) {
  return (
    message: unknown,
    sendResponse: (response: unknown) => void
  ): true | undefined => {
    if (
      typeof message !== 'object'
      || message === null
      || (message as { type?: unknown }).type !== SNAPSHOT_REQUEST_TYPE
    ) {
      return undefined;
    }

    void reader.readSnapshot()
      .then((snapshot) => sendResponse({ type: SNAPSHOT_RESPONSE_TYPE, snapshot }))
      .catch(() => sendResponse({
        type: SNAPSHOT_RESPONSE_TYPE,
        snapshot: {
          health: 'unavailable',
          bridgeStatus: 'waiting-for-project-state',
          clips: [],
          observedAtMs: Date.now(),
          reason: 'Suno Studio snapshot read failed.'
        } satisfies SunoSnapshot
      }));
    return true;
  };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const adapter = new SunoAdapter(document);

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    if (!isSunoPageBridgeMessage(event.data)) {
      return;
    }

    adapter.observeBridgeState(event.data.state);
  });

  postSunoPageBridgeRequest(window);

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    const handleSnapshotRequest = createSnapshotRequestHandler(adapter);
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => (
      handleSnapshotRequest(message, sendResponse)
    ));
  }
}
