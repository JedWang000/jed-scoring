// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  MAX_WAV_DATA_BYTES,
  SILENT_WAV_SAMPLE_RATE,
  SilentWavGenerationError,
  createSilentWavFile
} from '../../src/media/silent-wav';

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as ArrayBuffer), { once: true });
    reader.addEventListener('error', () => reject(reader.error), { once: true });
    reader.readAsArrayBuffer(file);
  });
}

function ascii(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join('');
}

describe('createSilentWavFile', () => {
  it('writes a 44.1 kHz mono 16-bit PCM RIFF file with zero samples', async () => {
    const result = createSilentWavFile('scene.final.mp4', 1.25);
    const buffer = await readFile(result.file);
    const view = new DataView(buffer);

    expect(result.file.name).toBe('scene.final-silent-reference.wav');
    expect(result.file.type).toBe('audio/wav');
    expect(result.sampleCount).toBe(Math.round(1.25 * SILENT_WAV_SAMPLE_RATE));
    expect(result.durationSeconds).toBe(result.sampleCount / SILENT_WAV_SAMPLE_RATE);
    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8);
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44_100);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(result.sampleCount * 2);
    expect(Array.from(new Uint8Array(buffer, 44)).every((value) => value === 0)).toBe(true);
  });

  it('keeps duration error within one sample and sanitizes unsafe names', () => {
    const result = createSilentWavFile('bad:name?.mov', 0.333_333);
    expect(Math.abs(result.durationSeconds - 0.333_333)).toBeLessThanOrEqual(1 / 44_100);
    expect(result.file.name).toBe('bad_name_-silent-reference.wav');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid duration %s',
    (durationSeconds) => {
      expect(() => createSilentWavFile('clip.mp4', durationSeconds)).toThrowError(
        expect.objectContaining({ code: 'invalid-duration' })
      );
    }
  );

  it('rejects data that cannot fit standard RIFF length fields', () => {
    const tooManySamples = Math.floor(MAX_WAV_DATA_BYTES / 2) + 1;
    expect(() => createSilentWavFile('long.mp4', tooManySamples / 44_100)).toThrowError(
      expect.objectContaining({ code: 'too-large' })
    );
  });

  it('maps allocation failure without returning a truncated file', () => {
    expect(() => createSilentWavFile('clip.mp4', 1, {
      allocate: () => {
        throw new RangeError('out of memory');
      }
    })).toThrowError(expect.objectContaining({ code: 'allocation-failed' }));
  });

  it('uses a safe fallback when the base name is empty', () => {
    expect(createSilentWavFile('.mp4', 1).file.name).toBe('video-silent-reference.wav');
  });
});

expect(SilentWavGenerationError).toBeDefined();
