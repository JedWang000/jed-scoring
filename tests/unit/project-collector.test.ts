import { describe, expect, it, vi } from 'vitest';
import type { CdpEvent } from '../../src/background/cdp-api';
import {
  ProjectCollector,
  classifyStudioEndpoint,
  type ProjectCollectorRejection
} from '../../src/background/project-collector';

const projectUrl = 'https://studio-api-prod.suno.com/api/studio/project/private-project-id';

function projectState() {
  return {
    project_id: 'private-project-id',
    user_id: 'private-user-id',
    prompt: 'private prompt',
    timing: { type: 'manual', bps: 1, lockBPS: false, bpsAutomation: [] },
    loop: { startBeats: 0, endBeats: 16, enabled: false },
    tracks: [{
      id: 'track-1',
      type: 'audio',
      clips: [{
        type: 'audio',
        id: 'audio-1',
        name: '20260703-154527-silent-reference.wav',
        startBeats: 0,
        endBeats: 43,
        readStartBeats: 0,
        transposition: 0,
        reversed: false,
        loop: { enabled: false, startBeats: 0, endBeats: 43 },
        warp: { enabled: false, awaitingAnalysis: false, markers: { 0: 0, 43: 43 } },
        audio_url: 'https://private.example/audio.wav'
      }],
      takeLanes: []
    }]
  };
}

function requestEvent(
  requestId: string,
  method: string,
  url: string,
  postData?: string
): CdpEvent {
  return {
    tabId: 7,
    method: 'Network.requestWillBeSent',
    params: {
      requestId,
      request: { url, method, ...(postData ? { postData } : {}) }
    }
  };
}

function responseEvent(
  requestId: string,
  status: number,
  mimeType: string,
  encodedDataLength = 100
): CdpEvent {
  return {
    tabId: 7,
    method: 'Network.responseReceived',
    params: {
      requestId,
      response: { status, mimeType, encodedDataLength }
    }
  };
}

function loadingFinishedEvent(requestId: string): CdpEvent {
  return {
    tabId: 7,
    method: 'Network.loadingFinished',
    params: { requestId, encodedDataLength: 100 }
  };
}

describe('classifyStudioEndpoint', () => {
  it.each([
    ['GET', projectUrl, 'project'],
    ['GET', 'https://studio-api-prod.suno.com/api/studio/project_revision/revision-id', 'revision'],
    ['GET', 'https://studio-api-prod.suno.com/api/studio/project-id/version/version-id', 'version'],
    ['POST', 'https://studio-api-prod.suno.com/api/studio/save-project', 'save']
  ])('classifies %s %s', (method, url, kind) => {
    expect(classifyStudioEndpoint(url, method)).toBe(kind);
  });

  it.each([
    ['GET', 'https://evil.example/api/studio/project/abc'],
    ['GET', 'https://studio-api-prod.suno.com/api/studio/audio/abc'],
    ['POST', projectUrl],
    ['GET', 'not a URL']
  ])('rejects non-allowlisted %s %s', (method, url) => {
    expect(classifyStudioEndpoint(url, method)).toBeUndefined();
  });
});

describe('ProjectCollector', () => {
  it('waits for loadingFinished, retrieves a successful GET body once, and projects only safe fields', async () => {
    const send = vi.fn(async () => ({
      body: JSON.stringify({ state: JSON.stringify(projectState()) }),
      base64Encoded: false
    }));
    const observations: unknown[] = [];
    const collector = new ProjectCollector(
      send,
      (value) => observations.push(value),
      () => 50,
      vi.fn()
    );

    await collector.handle(requestEvent('r1', 'GET', projectUrl), 3);
    await collector.handle(responseEvent('r1', 200, 'application/json'), 3);

    expect(send).not.toHaveBeenCalled();

    await collector.handle(loadingFinishedEvent('r1'), 3);
    await collector.handle(loadingFinishedEvent('r1'), 3);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(7, 'Network.getResponseBody', { requestId: 'r1' });
    expect(observations).toEqual([{
      generation: 3,
      source: 'project',
      state: {
        status: 'ready',
        observedAtMs: 50,
        clips: [{
          id: 'audio-1',
          label: '20260703-154527-silent-reference.wav',
          startSeconds: 0,
          durationSeconds: 43,
          trimStartSeconds: 0,
          speed: 1,
          warped: false,
          bindingEligibility: 'ready'
        }],
        loop: { startSeconds: 0, endSeconds: 16, enabled: false }
      }
    }]);
    expect(JSON.stringify(observations)).not.toMatch(/project_id|user_id|prompt|audio_url|private-project-id/);
  });

  it('records only sanitized project schema evidence', async () => {
    const schemaEvidence: unknown[] = [];
    const collector = new ProjectCollector(
      vi.fn(async () => ({
        body: JSON.stringify({ state: JSON.stringify(projectState()) }),
        base64Encoded: false
      })),
      vi.fn(),
      () => 51,
      vi.fn(),
      (value) => schemaEvidence.push(value)
    );

    await collector.handle(requestEvent('schema', 'GET', projectUrl), 3);
    await collector.handle(responseEvent('schema', 200, 'application/json'), 3);
    await collector.handle(loadingFinishedEvent('schema'), 3);

    expect(schemaEvidence).toEqual([{
      generation: 3,
      source: 'project',
      stateFieldCount: 6,
      timingFieldCount: 4,
      trackCount: 1,
      audioTrackCount: 1,
      clipCount: 1,
      audioClipCount: 1,
      timingKind: 'manual',
      trackKinds: 'audio',
      clipKinds: 'audio',
      stateFields: 'loop,project_id,prompt,timing,tracks,user_id',
      timingFields: 'bps,bpsAutomation,lockBPS,type',
      trackFields: 'clips,id,takeLanes,type',
      clipFields: 'audio_url,endBeats,id,loop,name,readStartBeats,reversed,startBeats,transposition,type,warp'
    }]);
    expect(JSON.stringify(schemaEvidence)).not.toMatch(
      /private-project-id|private-user-id|private prompt|silent-reference|private\.example/
    );
  });

  it('projects a save request body without retaining it for a response', async () => {
    const send = vi.fn();
    const observations: unknown[] = [];
    const collector = new ProjectCollector(send, (value) => observations.push(value), () => 60, vi.fn());

    await collector.handle(requestEvent(
      'save-1',
      'POST',
      'https://studio-api-prod.suno.com/api/studio/save-project',
      JSON.stringify({ state: projectState() })
    ), 4);
    await collector.handle(responseEvent('save-1', 200, 'application/json'), 4);

    expect(send).not.toHaveBeenCalled();
    expect(observations).toEqual([
      expect.objectContaining({ generation: 4, source: 'save', state: expect.objectContaining({ status: 'ready' }) })
    ]);
  });

  it('retrieves an omitted save request body through CDP', async () => {
    const send = vi.fn(async () => ({ postData: JSON.stringify({ state: projectState() }) }));
    const observations: unknown[] = [];
    const collector = new ProjectCollector(
      send,
      (value) => observations.push(value),
      () => 61,
      vi.fn()
    );

    await collector.handle(requestEvent(
      'save-omitted',
      'POST',
      'https://studio-api-prod.suno.com/api/studio/save-project'
    ), 4);

    expect(send).toHaveBeenCalledWith(7, 'Network.getRequestPostData', {
      requestId: 'save-omitted'
    });
    expect(observations).toEqual([
      expect.objectContaining({
        generation: 4,
        source: 'save',
        state: expect.objectContaining({ status: 'ready' })
      })
    ]);
  });

  it('does not emit a project failure when an omitted save body cannot be retrieved', async () => {
    const rejections: ProjectCollectorRejection[] = [];
    const observations: unknown[] = [];
    const collector = new ProjectCollector(
      vi.fn(async () => { throw new Error('No post data'); }),
      (value) => observations.push(value),
      () => 62,
      (code) => rejections.push(code)
    );

    await collector.handle(requestEvent(
      'save-unavailable',
      'POST',
      'https://studio-api-prod.suno.com/api/studio/save-project'
    ), 4);

    expect(rejections).toEqual(['save-body-missing']);
    expect(observations).toEqual([]);
  });

  it('clears pending correlations when the session generation is invalidated', async () => {
    const send = vi.fn(async () => ({
      body: JSON.stringify({ state: projectState() }),
      base64Encoded: false
    }));
    const collector = new ProjectCollector(send, vi.fn(), () => 50, vi.fn());

    await collector.handle(requestEvent('r1', 'GET', projectUrl), 3);
    collector.reset();
    await collector.handle(responseEvent('r1', 200, 'application/json'), 3);
    await collector.handle(loadingFinishedEvent('r1'), 3);

    expect(send).not.toHaveBeenCalled();
  });

  it('rejects an oversized save body before JSON parsing', async () => {
    const rejections: ProjectCollectorRejection[] = [];
    const observations: unknown[] = [];
    const collector = new ProjectCollector(
      vi.fn(),
      (value) => observations.push(value),
      () => 65,
      (code) => rejections.push(code)
    );

    await collector.handle(requestEvent(
      'save-large',
      'POST',
      'https://studio-api-prod.suno.com/api/studio/save-project',
      'x'.repeat(8 * 1024 * 1024 + 1)
    ), 4);

    expect(rejections).toEqual(['body-too-large']);
    expect(observations).toEqual([{
      generation: 4,
      source: 'save',
      state: { status: 'parse-failed', observedAtMs: 65 }
    }]);
  });

  it('rejects failed, oversized, non-json, and generation-mismatched responses before retrieval', async () => {
    const send = vi.fn(async () => ({ body: '{}', base64Encoded: false }));
    const rejections: ProjectCollectorRejection[] = [];
    const collector = new ProjectCollector(send, vi.fn(), () => 50, (code) => rejections.push(code));

    await collector.handle(requestEvent('failed', 'GET', projectUrl), 3);
    await collector.handle(responseEvent('failed', 500, 'application/json'), 3);
    await collector.handle(requestEvent('large', 'GET', projectUrl), 3);
    await collector.handle(responseEvent('large', 200, 'application/json', 8 * 1024 * 1024 + 1), 3);
    await collector.handle(requestEvent('text', 'GET', projectUrl), 3);
    await collector.handle(responseEvent('text', 200, 'text/html'), 3);
    await collector.handle(requestEvent('old', 'GET', projectUrl), 2);
    await collector.handle(responseEvent('old', 200, 'application/json'), 3);
    await collector.handle(responseEvent('untracked', 200, 'application/json'), 3);

    expect(send).not.toHaveBeenCalled();
    expect(rejections).toEqual([
      'http-status',
      'response-too-large',
      'non-json',
      'generation-mismatch'
    ]);
  });

  it.each([
    ['base64-body', { body: 'e30=', base64Encoded: true }],
    ['body-too-large', { body: 'x'.repeat(8 * 1024 * 1024 + 1), base64Encoded: false }],
    ['invalid-json', { body: '{', base64Encoded: false }],
    ['invalid-result', { body: JSON.stringify({ data: { unknown: true } }), base64Encoded: false }]
  ] as const)('fails closed for %s', async (expectedRejection, bodyResult) => {
    const rejections: ProjectCollectorRejection[] = [];
    const observations: unknown[] = [];
    const collector = new ProjectCollector(
      vi.fn(async () => bodyResult),
      (value) => observations.push(value),
      () => 70,
      (code) => rejections.push(code)
    );

    await collector.handle(requestEvent('r1', 'GET', projectUrl), 3);
    await collector.handle(responseEvent('r1', 200, 'application/json'), 3);
    await collector.handle(loadingFinishedEvent('r1'), 3);

    expect(rejections).toEqual([expectedRejection]);
    expect(observations).toEqual([
      expect.objectContaining({
        generation: 3,
        state: { status: expectedRejection === 'invalid-result' ? 'unsupported-project-shape' : 'parse-failed', observedAtMs: 70 }
      })
    ]);
  });

  it('does not emit a project failure when a GET response body is unavailable', async () => {
    const rejections: ProjectCollectorRejection[] = [];
    const observations: unknown[] = [];
    const collector = new ProjectCollector(
      vi.fn(async () => { throw new Error('Body not ready'); }),
      (value) => observations.push(value),
      () => 71,
      (code) => rejections.push(code)
    );

    await collector.handle(requestEvent('unavailable', 'GET', projectUrl), 3);
    await collector.handle(responseEvent('unavailable', 200, 'application/json'), 3);
    await collector.handle(loadingFinishedEvent('unavailable'), 3);

    expect(rejections).toEqual(['body-unavailable']);
    expect(observations).toEqual([]);
  });
});
