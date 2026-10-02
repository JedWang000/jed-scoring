import { fingerprintFile, reconcileFile, type FileReconciliationStatus } from '../shared/fingerprint';
import type { PersistedSyncProject } from '../shared/types';
import { ProjectStore } from './project-store';

export type ProjectRestoreResult =
  | { readonly state: 'missing-project' }
  | {
    readonly state: FileReconciliationStatus;
    readonly project: PersistedSyncProject;
  };

export class ProjectService {
  constructor(private readonly store: ProjectStore) {
  }

  async restore(projectKey: string, file?: File): Promise<ProjectRestoreResult> {
    const project = await this.store.get(projectKey);
    if (!project) return { state: 'missing-project' };
    if (!file) return { state: 'reauthorization-required', project };

    const currentFingerprint = await fingerprintFile(file);
    return {
      state: reconcileFile(project.video.fingerprint, currentFingerprint),
      project
    };
  }
}
