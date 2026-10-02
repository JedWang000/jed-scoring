export interface VideoControl {
  seek(seconds: number): void;
  play(): Promise<void>;
  pause(): void;
  setRate(rate: number): void;
  currentTime(): number;
  duration(): number;
  isPaused(): boolean;
  isSeeking(): boolean;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

export class VideoController implements VideoControl {
  constructor(private readonly video: HTMLVideoElement) {
  }

  seek(seconds: number): void {
    const duration = this.duration();
    const target = Number.isFinite(seconds) ? seconds : 0;
    this.video.currentTime = Math.max(0, Math.min(target, duration));
  }

  async play(): Promise<void> {
    await this.video.play();
  }

  pause(): void {
    this.video.pause();
  }

  setRate(rate: number): void {
    this.video.playbackRate = rate;
  }

  currentTime(): number {
    return this.video.currentTime;
  }

  duration(): number {
    return Number.isFinite(this.video.duration) && this.video.duration > 0
      ? this.video.duration
      : 0;
  }

  isPaused(): boolean {
    return this.video.paused;
  }

  isSeeking(): boolean {
    return this.video.seeking;
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted;
  }

  isMuted(): boolean {
    return this.video.muted;
  }
}
