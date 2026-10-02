import type {
  DiagnosticCategory,
  DiagnosticEntry,
  SafeDiagnosticValue
} from './protocol';

export type { DiagnosticEntry } from './protocol';

const SENSITIVE_KEY = /authorization|cookie|token|body|html|url|project.?id|revision.?id|version.?id|path|filename|prompt|lyric/i;
const SENSITIVE_VALUE = /https?:\/\/|\/api\/|[a-z]:\\|\\users\\|eyj[a-z0-9_-]{12,}/i;

function assertSafeData(data: Readonly<Record<string, SafeDiagnosticValue>>): void {
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY.test(key)) {
      throw new Error('Sensitive diagnostic key rejected.');
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Non-finite diagnostic value rejected.');
    }
    if (typeof value === 'string'
      && (value.length > 128 || SENSITIVE_VALUE.test(value))) {
      throw new Error('Sensitive diagnostic value rejected.');
    }
  }
}

export class DiagnosticsBuffer {
  private readonly buffer: DiagnosticEntry[] = [];

  constructor(
    private readonly capacity = 200,
    private readonly now: () => number = Date.now
  ) {
  }

  log(
    category: DiagnosticCategory,
    code: string,
    data?: Readonly<Record<string, SafeDiagnosticValue>>
  ): void {
    if (data) assertSafeData(data);
    this.buffer.push({
      atMs: this.now(),
      category,
      code,
      ...(data ? { data: { ...data } } : {})
    });
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
  }

  entries(): readonly DiagnosticEntry[] {
    return this.buffer.map((entry) => ({
      ...entry,
      ...(entry.data ? { data: { ...entry.data } } : {})
    }));
  }
}
