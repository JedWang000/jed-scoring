import { expect, test } from '@playwright/test';

test.skip('selected-skip', () => {
  expect(true).toBe(true);
});

test('selected-pass', () => {
  expect(true).toBe(true);
});
