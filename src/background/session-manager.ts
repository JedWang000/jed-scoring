import type { CdpApi, CdpEvent } from './cdp-api';

export type { CdpApi, CdpDetach, CdpEvent } from './cdp-api';

export type SessionState = 'detached' | 'attaching' | 'attached' | 'reloading' | 'failed';

export interface SessionSnapshot {
  readonly state: SessionState;
  readonly generation: number;
  readonly tabId?: number;
  readonly changedAtMs: number;
  readonly reason?: string;
}

const ENABLE_COMMANDS = [
  'Network.enable',
  'Runtime.enable',
  'DOM.enable',
  'Accessibility.enable',
  'Page.enable'
] as const;

function isTopFrameNavigation(event: CdpEvent): boolean {
  if (event.method !== 'Page.frameNavigated'
    || typeof event.params !== 'object'
    || event.params === null) return false;
  const frame = (event.params as { frame?: unknown }).frame;
  return typeof frame === 'object'
    && frame !== null
    && !Object.prototype.hasOwnProperty.call(frame, 'parentId');
}

export class CdpSessionManager {
  private current: SessionSnapshot;
  private readonly eventListeners: Array<(
    event: CdpEvent,
    generation: number
  ) => void> = [];
  private readonly stateListeners: Array<(snapshot: SessionSnapshot) => void> = [];

  constructor(
    private readonly api: CdpApi,
    private readonly now: () => number = Date.now
  ) {
    this.current = {
      state: 'detached',
      generation: 0,
      changedAtMs: this.now()
    };
    this.api.addEventListener((event) => this.handleEvent(event));
    this.api.addDetachListener(({ tabId, reason }) => this.handleDetach(tabId, reason));
  }

  snapshot(): SessionSnapshot {
    return { ...this.current };
  }

  accepts(tabId: number, generation: number): boolean {
    return (this.current.state === 'attached' || this.current.state === 'reloading')
      && this.current.tabId === tabId
      && this.current.generation === generation;
  }

  onEvent(listener: (event: CdpEvent, generation: number) => void): void {
    this.eventListeners.push(listener);
  }

  onStateChange(listener: (snapshot: SessionSnapshot) => void): void {
    this.stateListeners.push(listener);
  }

  async connect(tabId: number): Promise<SessionSnapshot> {
    if ((this.current.state === 'attached' || this.current.state === 'reloading')
      && this.current.tabId === tabId) {
      return this.snapshot();
    }

    const generation = this.current.generation + 1;
    const previousTabId = this.current.tabId;
    const previousWasActive = previousTabId !== undefined
      && (this.current.state === 'attached' || this.current.state === 'reloading');
    if (previousWasActive) {
      this.setCurrent({
        state: 'detached',
        generation,
        changedAtMs: this.now()
      });
      await this.api.detach(previousTabId);
    }

    this.setCurrent({
      state: 'attaching',
      tabId,
      generation,
      changedAtMs: this.now()
    });

    try {
      await this.api.attach(tabId, '1.3');
      for (const command of ENABLE_COMMANDS) {
        await this.api.send(tabId, command);
      }
      this.setCurrent({
        state: 'attached',
        tabId,
        generation,
        changedAtMs: this.now()
      });
    } catch (error) {
      this.setCurrent({
        state: 'failed',
        tabId,
        generation,
        changedAtMs: this.now(),
        reason: error instanceof Error ? error.message : 'CDP attach failed.'
      });
    }

    return this.snapshot();
  }

  async reload(): Promise<void> {
    if (this.current.state !== 'attached' || this.current.tabId === undefined) {
      throw new Error('CDP target is not attached.');
    }

    const { tabId, generation } = this.current;
    this.setCurrent({
      state: 'reloading',
      tabId,
      generation,
      changedAtMs: this.now()
    });
    await this.api.send(tabId, 'Page.reload', { ignoreCache: false });
    const afterReload = this.snapshot();
    if (afterReload.tabId !== tabId || afterReload.state !== 'reloading') return;
    this.setCurrent({
      state: 'attached',
      tabId,
      generation: afterReload.generation,
      changedAtMs: this.now()
    });
  }

  async disconnect(): Promise<void> {
    const tabId = this.current.tabId;
    const wasActive = tabId !== undefined
      && (this.current.state === 'attached' || this.current.state === 'reloading');
    this.setCurrent({
      state: 'detached',
      generation: this.current.generation + 1,
      changedAtMs: this.now()
    });
    if (wasActive) await this.api.detach(tabId);
  }

  private handleEvent(event: CdpEvent): void {
    if (!this.accepts(event.tabId, this.current.generation)) return;
    if (isTopFrameNavigation(event)) {
      this.setCurrent({
        ...this.current,
        state: this.current.state === 'reloading' ? 'attached' : this.current.state,
        generation: this.current.generation + 1,
        changedAtMs: this.now()
      });
    }
    for (const listener of this.eventListeners) {
      listener(event, this.current.generation);
    }
  }

  private handleDetach(tabId: number, reason: string): void {
    if (tabId !== this.current.tabId) return;
    this.setCurrent({
      state: 'detached',
      generation: this.current.generation + 1,
      changedAtMs: this.now(),
      reason
    });
  }

  private setCurrent(snapshot: SessionSnapshot): void {
    this.current = snapshot;
    for (const listener of this.stateListeners) {
      listener({ ...snapshot });
    }
  }
}
