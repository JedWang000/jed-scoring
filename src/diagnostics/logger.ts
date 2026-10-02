export type DiagnosticCategory = 'adapter' | 'binding' | 'media' | 'sync' | 'runtime';

export interface DiagnosticEntry {
  readonly atMs: number;
  readonly category: DiagnosticCategory;
  readonly code: string;
  readonly message?: string;
  readonly data?: Readonly<Record<string, number | string | boolean | null>>;
}

export class Logger {
  private readonly buffer: DiagnosticEntry[] = [];

  constructor(private readonly capacity = 500) {
  }

  log(entry: DiagnosticEntry): void {
    this.buffer.push({ ...entry });
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
  }

  entries(): readonly DiagnosticEntry[] {
    return this.buffer.map((entry) => ({ ...entry }));
  }
}
