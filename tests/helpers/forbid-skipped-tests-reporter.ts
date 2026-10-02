import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

export default class ForbidSkippedTestsReporter implements Reporter {
  private readonly skippedTests: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'skipped') {
      this.skippedTests.push(test.titlePath().join(' > '));
    }
  }

  onEnd(): void | { status: 'failed' } {
    if (this.skippedTests.length === 0) return;
    console.error([
      'Core E2E delivery gate rejected skipped tests:',
      ...this.skippedTests.map((title) => `- ${title}`)
    ].join('\n'));
    return { status: 'failed' };
  }
}
