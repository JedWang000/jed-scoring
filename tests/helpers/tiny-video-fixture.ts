import type { Page } from '@playwright/test';

export const TINY_VIDEO_FILE_NAME = 'jed-scoring-test-video.webm';
export const TINY_SILENT_REFERENCE_NAME = 'jed-scoring-test-video-silent-reference.wav';

export interface TinyVideoInput {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

let cachedFixture: TinyVideoInput | undefined;

const TINY_VIDEO_BASE64 = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAQtEU2bdLlNu4tTq4QVSalmU6yBbk27i1OrhBZUrmtTrIGTTbuLU6uEH0O2dVOsgcFNu4xTq4QcU7trU6yCBBvsrgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBEiYRElh9cTYCGQ2hyb21lV0GGQ2hyb21lFlSua6mup9eBAXPFh6AVPA8uvDqDgQFV7oEBhoVWX1ZQOOCKsIEQuoEQU8CBAR9DtnUBAAAAAAADTueBAKDiobiBAAAAsAIAnQEqEAAQAADHCIWFiJmEiAUCAnWqA/gCDP3EAP74Msv/TSPGkeNI+Yt/8s+fw2dGAHWhpaaj7oEBpZ4QAgCdASoQABAABIcIhYWImYSIGAIADA1gAP72pQCguqGagQBxANEBAAMQQAAYDYxRv/uUcAAA/v1QqAB1oZimlu6BAaWRsQEAEhDwABgAGFgv9AAIAAD7gQCgx6GngQDdANEBAAMQOAAYCdPRv/uUcEgA/vQ1H/5glfkG7UP/gfl04YgAdaGYppbugQGlkbEBABIRDAAYABhYL/QACAAA+4FxoLqhmoEBSgDRAQADEDgAGA2MUb/7lHAAAP79jYgAdaGYppbugQGlkbEBABIRKAAYABhYL/QACAAA+4HdoMmhqIEBtwDRAQADEDAAGAnT0b/7lHBIAP72KZ/+dg2Jdrxz/+N24w33oAB1oZimlu6BAaWRsQEAEhFMABgAGFgv9AAIAAD7ggFKoLuhmoECJADRAQADEDAAGA2MUb/7lHAAAP7+NZAAdaGYppbugQGlkbEBABIRaAAYABhYL/QACAAA+4IBt6DMoauBApAA0QEAAxAgABgJ09G/+5RwSAD++gT3/2M36M36M39gD/5xLHU7u0AAdaGYppbugQGlkbEBABIRjAAYABhYL/QACAAA+4ICJKC6oZmBAvwAsQEAAxA4FGA2MUb/7lHAAP79jYgAdaGYppbugQGlkbEBABIQQBRgAGFgv9AAIAAA+4ICkKDMoauBA2kAEQIAAxAcABgJ1pAEGp/5ZqBuAP765S//a0Bwar/Ts/+hHRQ0PcAAdaGYppbugQGlkbEBABIRwAAYABhYL/QACAAA+4IC/KC8oZuBA9YA0QEAAxAcABgM0NG/+5RwAAD+/xiKe4B1oZimlu6BAaWRsQEAEhHAABgAGFgv9AAIAAD7ggNpoMmhqIEEQwCxAQADEBgAGAAwP/QMAMIA/vrlL//a0Bwar/Ts//oR0UND3AB1oZimlu6BAaWRsQEAEhHAABgAGFgv9AAIAAD7ggPWoLuhmoEEsACxAQADEBQAGAAwP/QMAAAA/v9smC0IdaGYppbugQGlkbEBABIRwAAYABhYL/QACAAA+4IEQxxTu2uNu4uzgQC3hveBAfGBwQ==';

export async function createTinyVideoInput(page: Page): Promise<TinyVideoInput> {
  if (cachedFixture) return cachedFixture;

  const fixtureBytes = Buffer.from(TINY_VIDEO_BASE64, 'base64');
  if (fixtureBytes.length === 0) throw new Error('The repository tiny-video fixture is empty.');

  await page.evaluate(async ({ base64, mimeType }) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: mimeType });

    const objectURL = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    try {
      const metadata = await new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error('Timed out decoding the tiny-video fixture.'));
        }, 5_000);
        video.addEventListener('loadedmetadata', () => {
          window.clearTimeout(timeout);
          resolve({
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight
          });
        }, { once: true });
        video.addEventListener('error', () => {
          window.clearTimeout(timeout);
          reject(new Error(`Could not decode the tiny-video fixture: ${video.error?.message ?? 'unknown media error'}`));
        }, { once: true });
        video.src = objectURL;
        video.load();
      });
      if (!Number.isFinite(metadata.duration)
        || metadata.duration <= 0
        || metadata.width !== 16
        || metadata.height !== 16) {
        throw new Error(`Tiny-video metadata is invalid: ${JSON.stringify(metadata)}`);
      }
    } finally {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectURL);
    }

  }, { base64: TINY_VIDEO_BASE64, mimeType: 'video/webm' });

  cachedFixture = {
    name: TINY_VIDEO_FILE_NAME,
    mimeType: 'video/webm',
    buffer: fixtureBytes
  };
  return cachedFixture;
}
