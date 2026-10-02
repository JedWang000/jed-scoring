export interface TimeMapping {
  readonly clipStartSeconds: number;
  readonly videoInSeconds: number;
  readonly offsetSeconds: number;
}

export interface ReferenceTrackBinding {
  readonly clipId: string;
  readonly clipStartSeconds: number;
  readonly clipDurationSeconds: number;
  readonly trimStartSeconds: number;
  readonly speed: number;
  readonly warped: boolean;
  readonly confirmedAtMs: number;
}

export interface SyncProject {
  readonly schemaVersion: 1;
  readonly projectKey: string;
  readonly mapping: TimeMapping;
  readonly binding?: ReferenceTrackBinding;
}

export interface FileFingerprint {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly sha256Prefix: string;
}

export interface LocalVideoMetadata {
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly frameRate?: number;
  readonly hasAudio?: boolean;
}

export interface PersistedSyncProject extends SyncProject {
  readonly video: {
    readonly fingerprint: FileFingerprint;
    readonly metadata: LocalVideoMetadata;
  };
}
