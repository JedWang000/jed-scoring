export const SILENT_WAV_SAMPLE_RATE = 44_100;
export const MAX_WAV_DATA_BYTES = 0xffff_ffff - 36;
const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

export type SilentWavErrorCode = 'invalid-duration' | 'too-large' | 'allocation-failed';

export class SilentWavGenerationError extends Error {
  constructor(readonly code: SilentWavErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SilentWavGenerationError';
  }
}

export interface SilentWavEnvironment {
  readonly allocate: (byteLength: number) => ArrayBuffer;
}

export interface SilentWavResult {
  readonly file: File;
  readonly sampleCount: number;
  readonly durationSeconds: number;
}

const browserEnvironment: SilentWavEnvironment = {
  allocate: (byteLength) => new ArrayBuffer(byteLength)
};

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function outputName(sourceName: string): string {
  const withoutExtension = sourceName.replace(/\.[^.]*$/, '');
  const safeBase = withoutExtension.replace(/[\\/:*?"<>|%]/g, '_').trim() || 'video';
  return safeBase + '-silent-reference.wav';
}

export function createSilentWavFile(
  sourceName: string,
  durationSeconds: number,
  environment: SilentWavEnvironment = browserEnvironment
): SilentWavResult {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new SilentWavGenerationError('invalid-duration', 'Video duration must be a finite positive number.');
  }

  const sampleCount = Math.round(durationSeconds * SILENT_WAV_SAMPLE_RATE);
  const dataSize = sampleCount * BYTES_PER_SAMPLE;
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || dataSize > MAX_WAV_DATA_BYTES) {
    throw new SilentWavGenerationError('too-large', 'Video duration exceeds standard RIFF/WAV capacity.');
  }

  let buffer: ArrayBuffer;
  try {
    buffer = environment.allocate(HEADER_BYTES + dataSize);
  } catch (error) {
    throw new SilentWavGenerationError(
      'allocation-failed',
      'The browser could not allocate the silent WAV buffer.',
      { cause: error }
    );
  }

  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SILENT_WAV_SAMPLE_RATE, true);
  view.setUint32(28, SILENT_WAV_SAMPLE_RATE * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  return {
    file: new File([buffer], outputName(sourceName), { type: 'audio/wav' }),
    sampleCount,
    durationSeconds: sampleCount / SILENT_WAV_SAMPLE_RATE
  };
}
