import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PersistedSyncProject } from '../shared/types';

interface ProjectDatabase extends DBSchema {
  projects: {
    key: string;
    value: PersistedSyncProject;
  };
}

export class ProjectStore {
  private readonly database: Promise<IDBPDatabase<ProjectDatabase>>;

  constructor(databaseName = 'suno-video-sync') {
    this.database = openDB<ProjectDatabase>(databaseName, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('projects')) {
          database.createObjectStore('projects', { keyPath: 'projectKey' });
        }
      }
    });
  }

  async save(project: PersistedSyncProject): Promise<void> {
    const database = await this.database;
    await database.put('projects', project);
  }

  async get(projectKey: string): Promise<PersistedSyncProject | undefined> {
    const database = await this.database;
    return database.get('projects', projectKey);
  }
}
