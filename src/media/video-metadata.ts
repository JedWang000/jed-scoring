import type { LocalVideoMetadata } from '../shared/types';

const UNSUPPORTED_CODEC_GUIDANCE = '请转换为 MP4/H.264 或 WebM 后重试。';

export interface VideoMetadataEnvironment {
  readonly createVideoElement: () => HTMLVideoElement;
  readonly createObjectURL: (file: File) => string;
  readonly revokeObjectURL: (url: string) => void;
}

export type VideoMetadataResult =
  | { readonly kind: 'ready'; readonly metadata: LocalVideoMetadata }
  | { readonly kind: 'unsupported-codec'; readonly guidance: string };

function browserEnvironment(): VideoMetadataEnvironment {
  return {
    createVideoElement: () => document.createElement('video'),
    createObjectURL: (file) => URL.createObjectURL(file),
    revokeObjectURL: (url) => URL.revokeObjectURL(url)
  };
}

export function readVideoMetadata(
  file: File,
  environment: VideoMetadataEnvironment = browserEnvironment()
): Promise<VideoMetadataResult> {
  const video = environment.createVideoElement();
  const objectURL = environment.createObjectURL(file);

  return new Promise((resolve) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      video.removeAttribute('src');
      video.load();
      environment.revokeObjectURL(objectURL);
    };

    const finish = (result: VideoMetadataResult) => {
      cleanup();
      resolve(result);
    };

    const handleLoadedMetadata = () => {
      const durationSeconds = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || width <= 0 || height <= 0) {
        finish({ kind: 'unsupported-codec', guidance: UNSUPPORTED_CODEC_GUIDANCE });
        return;
      }

      finish({
        kind: 'ready',
        metadata: { durationSeconds, width, height }
      });
    };

    const handleError = () => {
      finish({ kind: 'unsupported-codec', guidance: UNSUPPORTED_CODEC_GUIDANCE });
    };

    video.preload = 'metadata';
    video.muted = true;
    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.src = objectURL;
    video.load();
  });
}
