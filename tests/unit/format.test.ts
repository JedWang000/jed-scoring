import { describe, expect, it } from 'vitest';
import { formatTimecode } from '../../src/ui/format';

describe('formatTimecode', () => {
  it.each([
    [0, '00:00.000'],
    [12.345, '00:12.345'],
    [3661.2, '01:01:01.200']
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatTimecode(seconds)).toBe(expected);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.001])(
    'clamps invalid or negative value %s to zero',
    (seconds) => {
      expect(formatTimecode(seconds)).toBe('00:00.000');
    }
  );
});
