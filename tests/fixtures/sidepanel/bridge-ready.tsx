import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { SunoClip, SunoSnapshot } from '../../../src/content/suno-adapter';
import { App } from '../../../src/ui/App';

const clips: readonly SunoClip[] = [{
  id: 'observed-reference-1',
  label: '对轨参考',
  startSeconds: 1.25,
  durationSeconds: 30,
  trimStartSeconds: 0,
  speed: 1,
  warped: false,
  bindingEligibility: 'ready'
}];

const snapshotClient = {
  async readSnapshot(): Promise<SunoSnapshot> {
    return {
      health: 'healthy',
      bridgeStatus: 'ready',
      projectTimeSeconds: 1.25,
      isPlaying: false,
      clips,
      observedAtMs: Date.now()
    };
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      developerContactUrl="https://example.com/jed/contact"
      developerHomepageUrl="https://example.com/jed"
      initialState="binding-required"
      initialClips={clips}
      snapshotClient={snapshotClient}
    />
  </StrictMode>
);
