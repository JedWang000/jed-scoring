import type { SunoSnapshot } from '../content/suno-adapter';
import { createChromeCdpApi } from './cdp-api';
import { DiagnosticsBuffer } from './diagnostics-buffer';
import {
  BACKGROUND_RESPONSE_TYPE,
  isBackgroundRequest,
  type BackgroundResponse
} from './protocol';
import { CdpSessionManager } from './session-manager';
import { StudioController } from './studio-controller';

function startingSnapshot(reason = 'CDP controller is starting.'): SunoSnapshot {
  return {
    health: 'unavailable',
    bridgeStatus: 'waiting-for-project-state',
    clips: [],
    observedAtMs: Date.now(),
    reason
  };
}

const cdp = createChromeCdpApi();
const diagnostics = new DiagnosticsBuffer();
const controller = new StudioController(
  chrome.tabs,
  new CdpSessionManager(cdp),
  cdp,
  diagnostics
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isBackgroundRequest(message)) return undefined;
  void (async (): Promise<BackgroundResponse> => {
    if (message.action === 'diagnostics') {
      return {
        type: BACKGROUND_RESPONSE_TYPE,
        action: 'diagnostics',
        entries: controller.diagnostics()
      };
    }
    const snapshot = message.action === 'connect'
      ? await controller.connect()
      : message.action === 'reload'
        ? await controller.reload()
        : controller.snapshot();
    return {
      type: BACKGROUND_RESPONSE_TYPE,
      action: message.action,
      snapshot
    };
  })().then(sendResponse).catch(() => sendResponse({
    type: BACKGROUND_RESPONSE_TYPE,
    action: message.action,
    snapshot: startingSnapshot('CDP background request failed.')
  }));
  return true;
});
