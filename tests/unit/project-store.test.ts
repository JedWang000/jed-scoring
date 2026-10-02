import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { fingerprintFile, reconcileFile } from '../../src/shared/fingerprint';
import type { PersistedSyncProject } from '../../src/shared/types';
import { ProjectService } from '../../src/store/project-service';
import { ProjectStore } from '../../src/store/project-store';

function projectFixture(projectKey: string): PersistedSyncProject {
  return {
    schemaVersion: 1,
    projectKey,
    mapping: {
      clipStartSeconds: 12,
      videoInSeconds: 2,
      offsetSeconds: -0.1
    },
    video: {
      fingerprint: {
        name: 'reference.mp4',
        size: 10,
        type: 'video/mp4',
        sha256Prefix: 'abc123'
      },
      metadata: {
        durationSeconds: 30,
        width: 1920,
        height: 1080
      }
    }
  };
}

describe('file identity', () => {
  it('requires reauthorization when a restored fingerprint differs', () => {
    const saved = { name: 'a.mp4', size: 10, type: 'video/mp4', sha256Prefix: 'a' };
    const current = { name: 'a.mp4', size: 11, type: 'video/mp4', sha256Prefix: 'b' };

    expect(reconcileFile(saved, current)).toBe('reauthorization-required');
  });

  it('restores readiness when size and content prefix match', () => {
    const saved = { name: 'old-name.mp4', size: 10, type: 'video/mp4', sha256Prefix: 'same' };
    const current = { name: 'new-name.mp4', size: 10, type: 'video/mp4', sha256Prefix: 'same' };

    expect(reconcileFile(saved, current)).toBe('ready');
  });

  it('creates a stable, bounded SHA-256 prefix without retaining file bytes', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' });
    const file = Object.assign(blob, { name: 'reference.mp4' }) as File;

    const fingerprint = await fingerprintFile(file);

    expect(fingerprint).toMatchObject({
      name: 'reference.mp4',
      size: 4,
      type: 'video/mp4'
    });
    expect(fingerprint.sha256Prefix).toMatch(/^[0-9a-f]{24}$/);
    expect(Object.keys(fingerprint).sort()).toEqual(['name', 'sha256Prefix', 'size', 'type']);
  });
});

describe('ProjectStore', () => {
  it('round-trips a project without a local path or video bytes', async () => {
    const store = new ProjectStore(`suno-video-sync-test-${crypto.randomUUID()}`);
    const project = projectFixture('project-1');

    await store.save(project);

    expect(await store.get('project-1')).toEqual(project);
  });

  it('returns undefined for an unknown project', async () => {
    const store = new ProjectStore(`suno-video-sync-test-${crypto.randomUUID()}`);

    expect(await store.get('missing')).toBeUndefined();
  });
});

describe('ProjectService', () => {
  it('requires file reauthorization when a saved project is restored without a file', async () => {
    const store = new ProjectStore(`suno-video-sync-test-${crypto.randomUUID()}`);
    await store.save(projectFixture('project-restore'));

    expect(await new ProjectService(store).restore('project-restore')).toMatchObject({
      state: 'reauthorization-required',
      project: { projectKey: 'project-restore' }
    });
  });

  it('reports a missing project without asking for a file', async () => {
    const store = new ProjectStore(`suno-video-sync-test-${crypto.randomUUID()}`);

    expect(await new ProjectService(store).restore('missing')).toEqual({
      state: 'missing-project'
    });
  });
});
