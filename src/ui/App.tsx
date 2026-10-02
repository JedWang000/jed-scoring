import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import {
  createBinding,
  inspectBinding,
  type BindingWarningReason
} from '../content/binding-monitor';
import type { ProjectBridgeStatus } from '../content/project-state';
import type { DiagnosticEntry } from '../background/protocol';
import {
  isBindableSunoClip,
  type AdapterHealth,
  type SunoClip,
  type SunoSnapshot
} from '../content/suno-adapter';
import {
  SilentWavGenerationError,
  createSilentWavFile
} from '../media/silent-wav';
import {
  readVideoMetadata,
  type VideoMetadataResult
} from '../media/video-metadata';
import { SunoClient } from '../runtime/suno-client';
import type { LocalVideoMetadata, ReferenceTrackBinding } from '../shared/types';
import { SyncCoordinator } from '../sync/sync-coordinator';
import { SyncEngine } from '../sync/sync-engine';
import { VideoController, type VideoControl } from '../sync/video-controller';
import { ActionZone } from './components/ActionZone';
import { BindingPicker } from './components/BindingPicker';
import { BrandHeader } from './components/BrandHeader';
import { DeveloperFooter } from './components/DeveloperFooter';
import { OffsetControl } from './components/OffsetControl';
import { PreparationFlow } from './components/PreparationFlow';
import { ReadinessZone } from './components/ReadinessZone';
import {
  SilentReferenceCard,
  type PreparationErrorCode,
  type SilentReferenceState
} from './components/SilentReferenceCard';
import { StudioConnectionCard } from './components/StudioConnectionCard';
import type { AppState, PlaybackErrorCode } from './components/SyncStatus';
import { TimeMapping } from './components/TimeMapping';
import { VideoImporter } from './components/VideoImporter';
import { VideoStage } from './components/VideoStage';
import {
  I18nProvider,
  type Locale,
  type LocaleStore,
  useI18n
} from './i18n';
import {
  derivePresentationPhase,
  type PreparationStep
} from './model/presentation-state';
import './styles.css';

export type VideoMetadataReader = (file: File) => Promise<VideoMetadataResult>;

export interface StudioSnapshotClient {
  readSnapshot(): Promise<SunoSnapshot>;
  connect?(): Promise<SunoSnapshot>;
  reloadStudio?(): Promise<SunoSnapshot>;
  readDiagnostics?(): Promise<readonly DiagnosticEntry[]>;
}

export interface AppProps {
  readonly initialState?: AppState;
  readonly initialClips?: readonly SunoClip[];
  readonly warningReason?: BindingWarningReason;
  readonly snapshotClient?: StudioSnapshotClient;
  readonly metadataReader?: VideoMetadataReader;
  readonly initialLocale?: Locale;
  readonly localeStore?: LocaleStore;
  readonly developerContactUrl?: string;
  readonly developerHomepageUrl?: string;
}

export function App(props: AppProps) {
  return (
    <I18nProvider initialLocale={props.initialLocale} store={props.localeStore}>
      <AppContent {...props} />
    </I18nProvider>
  );
}

function AppContent({
  initialState = 'unconfigured',
  initialClips = [],
  warningReason,
  snapshotClient,
  metadataReader = readVideoMetadata,
  developerContactUrl,
  developerHomepageUrl
}: AppProps) {
  const { t } = useI18n();
  const [state, setState] = useState<AppState>(initialState);
  const [file, setFile] = useState<File>();
  const [previewURL, setPreviewURL] = useState<string>();
  const [metadata, setMetadata] = useState<LocalVideoMetadata>();
  const [clips, setClips] = useState<readonly SunoClip[]>(initialClips);
  const [bridgeStatus, setBridgeStatus] = useState<ProjectBridgeStatus>(
    initialClips.length > 0 ? 'ready' : 'waiting-for-project-state'
  );
  const [selectedClipId, setSelectedClipId] = useState<string>();
  const [binding, setBinding] = useState<ReferenceTrackBinding>();
  const [bindingConfirmed, setBindingConfirmed] = useState(
    initialState === 'sync-ready' || initialState === 'syncing'
  );
  const [adapterHealth, setAdapterHealth] = useState<AdapterHealth>(
    initialState === 'adapter-unavailable' ? 'unavailable' : 'healthy'
  );
  const [adapterReason, setAdapterReason] = useState<string>();
  const [activeWarningReason, setActiveWarningReason] = useState(warningReason);
  const [offsetMs, setOffsetMs] = useState(0);
  const [coordinator, setCoordinator] = useState<SyncCoordinator>();
  const [silentReference, setSilentReference] = useState<SilentReferenceState>();
  const [playbackError, setPlaybackError] = useState<PlaybackErrorCode>();
  const [lastStudioTimeSeconds, setLastStudioTimeSeconds] = useState<number>();
  const selectionGenerationRef = useRef(0);
  const mediaGenerationRef = useRef(0);
  const playbackAttemptGenerationRef = useRef(0);
  const bindingGenerationRef = useRef(0);
  const syncSessionActiveRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const revokeConfirmedBinding = useCallback((
    reason?: BindingWarningReason,
    fallbackState: 'binding-required' | 'adapter-unavailable' = 'adapter-unavailable'
  ) => {
    bindingGenerationRef.current += 1;
    playbackAttemptGenerationRef.current += 1;
    syncSessionActiveRef.current = false;
    videoRef.current?.pause();
    setCoordinator(undefined);
    setBindingConfirmed(false);
    setBinding(undefined);
    setSelectedClipId(undefined);
    if (reason) {
      setActiveWarningReason(reason);
      setState('warning');
    } else {
      setState(fallbackState);
    }
  }, []);

  const activeSnapshotClient = useMemo(() => {
    if (snapshotClient) return snapshotClient;
    if (typeof chrome !== 'undefined' && chrome.tabs) return new SunoClient();
    return undefined;
  }, [snapshotClient]);

  const canSync = Boolean(
    file
    && binding
    && bindingConfirmed
    && adapterHealth === 'healthy'
    && (state === 'sync-ready' || state === 'syncing')
  );
  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedClipId),
    [clips, selectedClipId]
  );

  useEffect(() => {
    if (!activeSnapshotClient || state === 'syncing') return undefined;
    let cancelled = false;

    const poll = async () => {
      const snapshot = await activeSnapshotClient.readSnapshot();
      if (cancelled) return;
      setClips(snapshot.clips);
      setBridgeStatus(snapshot.bridgeStatus);
      setAdapterHealth(snapshot.health);
      setAdapterReason(snapshot.reason);
      if (snapshot.projectTimeSeconds !== undefined) {
        setLastStudioTimeSeconds(snapshot.projectTimeSeconds);
      }
      if (snapshot.health !== 'healthy') {
        if (state === 'adapter-unavailable' && syncSessionActiveRef.current && coordinator) {
          videoRef.current?.pause();
          setState(snapshot.health === 'unavailable' ? 'adapter-unavailable' : 'binding-required');
          return;
        }
        if (syncSessionActiveRef.current) {
          syncSessionActiveRef.current = false;
          playbackAttemptGenerationRef.current += 1;
          videoRef.current?.pause();
        }
        setCoordinator(undefined);
        if (bindingConfirmed && binding && snapshot.bridgeStatus === 'ready') {
          const bindingStatus = inspectBinding(binding, snapshot.clips);
          if (bindingStatus.state === 'warning') {
            revokeConfirmedBinding(bindingStatus.reason);
            return;
          }
        }
        setState(snapshot.health === 'unavailable' ? 'adapter-unavailable' : 'binding-required');
        return;
      }
      if (bindingConfirmed && binding) {
        const bindingStatus = inspectBinding(binding, snapshot.clips);
        if (bindingStatus.state === 'warning') {
          revokeConfirmedBinding(bindingStatus.reason);
          return;
        }
        if (file
          && state === 'adapter-unavailable'
          && syncSessionActiveRef.current
          && coordinator) {
          setState('syncing');
        } else if (file && (state === 'adapter-unavailable' || state === 'binding-required')) {
          setState('sync-ready');
        }
      } else if (state === 'adapter-unavailable') {
        setState(file ? 'binding-required' : 'unconfigured');
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeSnapshotClient, binding, bindingConfirmed, coordinator, file, revokeConfirmedBinding, state]);

  useEffect(() => {
    if (!bindingConfirmed && selectedClipId) {
      const currentClip = clips.find((clip) => clip.id === selectedClipId);
      if (!currentClip || !isBindableSunoClip(currentClip)) {
        setSelectedClipId(undefined);
      }
    }
  }, [bindingConfirmed, clips, selectedClipId]);

  useEffect(() => () => {
    if (previewURL && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(previewURL);
    }
  }, [previewURL]);

  useEffect(() => {
    if (state !== 'syncing' || !coordinator || !binding) return undefined;
    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await coordinator.tick(binding, {
          clipStartSeconds: binding.clipStartSeconds,
          videoInSeconds: binding.trimStartSeconds,
          offsetSeconds: offsetMs / 1000
        });
        if (cancelled) return;
        if (result.state === 'warning') {
          syncSessionActiveRef.current = false;
          playbackAttemptGenerationRef.current += 1;
          setCoordinator(undefined);
          setActiveWarningReason(result.reason);
          setState('warning');
        } else if (result.state === 'adapter-unavailable') {
          setState('adapter-unavailable');
        } else if (result.state === 'playback-blocked') {
          setPlaybackError('autoplay-blocked');
          setState('playback-blocked');
        }
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 50);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [binding, coordinator, offsetMs, state]);

  const silentWavErrorCode = (error: unknown): PreparationErrorCode => {
    if (error instanceof SilentWavGenerationError) {
      if (error.code === 'too-large') return 'wav-too-large';
      if (error.code === 'allocation-failed') return 'wav-allocation-failed';
    }
    return 'wav-generation-failed';
  };

  const prepareSelectedFile = async (selectedFile: File, generation: number) => {
    setMetadata(undefined);
    setSilentReference({ kind: 'preparing' });

    let result: VideoMetadataResult;
    try {
      result = await metadataReader(selectedFile);
    } catch {
      if (selectionGenerationRef.current === generation) {
        setSilentReference({ kind: 'failed', code: 'metadata-read-failed' });
      }
      return;
    }

    if (selectionGenerationRef.current !== generation) return;
    if (result.kind !== 'ready') {
      setSilentReference({ kind: 'failed', code: 'unsupported-codec' });
      return;
    }

    setMetadata(result.metadata);
    try {
      const silent = createSilentWavFile(selectedFile.name, result.metadata.durationSeconds);
      setSilentReference({
        kind: 'ready',
        file: silent.file,
        durationSeconds: silent.durationSeconds
      });
    } catch (error) {
      setSilentReference({ kind: 'failed', code: silentWavErrorCode(error) });
    }
  };

  const handleFileSelected = (nextFile: File) => {
    const generation = selectionGenerationRef.current + 1;
    selectionGenerationRef.current = generation;
    mediaGenerationRef.current += 1;
    playbackAttemptGenerationRef.current += 1;
    bindingGenerationRef.current += 1;
    syncSessionActiveRef.current = false;
    videoRef.current?.pause();
    setFile(nextFile);
    setMetadata(undefined);
    setSilentReference({ kind: 'preparing' });
    setPlaybackError(undefined);
    setCoordinator(undefined);
    setBindingConfirmed(false);
    setBinding(undefined);
    setSelectedClipId(undefined);
    setState('binding-required');

    if (typeof URL.createObjectURL === 'function') {
      setPreviewURL(URL.createObjectURL(nextFile));
    }
    void prepareSelectedFile(nextFile, generation);
  };

  const handleRetrySilentReference = () => {
    if (!file) return;
    const generation = selectionGenerationRef.current + 1;
    selectionGenerationRef.current = generation;
    void prepareSelectedFile(file, generation);
  };

  const handleConfirmBinding = () => {
    if (!selectedClip || !isBindableSunoClip(selectedClip)) return;
    bindingGenerationRef.current += 1;
    setBinding(createBinding(selectedClip));
    setBindingConfirmed(true);
    setState(
      adapterHealth === 'unavailable'
        ? 'adapter-unavailable'
        : adapterHealth === 'healthy' && file
          ? 'sync-ready'
          : 'binding-required'
    );
  };

  const handleRebind = () => {
    bindingGenerationRef.current += 1;
    playbackAttemptGenerationRef.current += 1;
    syncSessionActiveRef.current = false;
    videoRef.current?.pause();
    setCoordinator(undefined);
    setBindingConfirmed(false);
    setBinding(undefined);
    setSelectedClipId(undefined);
    setState('binding-required');
  };

  const handleReselectFile = () => {
    selectionGenerationRef.current += 1;
    mediaGenerationRef.current += 1;
    playbackAttemptGenerationRef.current += 1;
    bindingGenerationRef.current += 1;
    syncSessionActiveRef.current = false;
    videoRef.current?.pause();
    setFile(undefined);
    setPreviewURL(undefined);
    setMetadata(undefined);
    setSilentReference(undefined);
    setPlaybackError(undefined);
    setCoordinator(undefined);
    setBindingConfirmed(false);
    setBinding(undefined);
    setSelectedClipId(undefined);
    setState('unconfigured');
  };

  const createGuardedVideoController = (
    video: HTMLVideoElement,
    mediaGeneration: number,
    bindingGeneration?: number
  ): VideoControl => {
    const controller = new VideoController(video);
    const isCurrent = () => (
      mediaGenerationRef.current === mediaGeneration
      && (bindingGeneration === undefined
        || bindingGenerationRef.current === bindingGeneration)
      && videoRef.current === video
    );

    return {
      seek: (seconds) => {
        if (isCurrent()) controller.seek(seconds);
      },
      play: async () => {
        if (isCurrent()) await controller.play();
      },
      pause: () => {
        if (isCurrent()) controller.pause();
      },
      setRate: (rate) => {
        if (isCurrent()) controller.setRate(rate);
      },
      currentTime: () => isCurrent() ? controller.currentTime() : 0,
      duration: () => isCurrent() ? controller.duration() : 0,
      isPaused: () => isCurrent() ? controller.isPaused() : true,
      isSeeking: () => isCurrent() ? controller.isSeeking() : false,
      setMuted: (muted) => {
        if (isCurrent()) controller.setMuted(muted);
      },
      isMuted: () => isCurrent() ? controller.isMuted() : true
    };
  };

  const unlockPlaybackAndStart = async (
    nextCoordinator: SyncCoordinator,
    mediaGeneration: number
  ) => {
    const attemptGeneration = playbackAttemptGenerationRef.current + 1;
    playbackAttemptGenerationRef.current = attemptGeneration;
    const video = videoRef.current;
    if (!video) return;
    syncSessionActiveRef.current = true;
    const isCurrent = () => (
      mediaGenerationRef.current === mediaGeneration
      && videoRef.current === video
      && playbackAttemptGenerationRef.current === attemptGeneration
    );
    try {
      await video.play();
      if (!isCurrent()) return;
      setPlaybackError(undefined);
      setCoordinator(nextCoordinator);
      setState('syncing');
    } catch (error) {
      if (!isCurrent()) return;
      const blocked = error instanceof Error && error.name === 'NotAllowedError';
      setCoordinator(nextCoordinator);
      setPlaybackError(blocked ? 'autoplay-blocked' : 'media-unavailable');
      setState('playback-blocked');
    }
  };

  const preflightPlayback = async (
    startBinding: ReferenceTrackBinding,
    mediaGeneration: number,
    bindingGeneration: number
  ): Promise<boolean> => {
    if (!activeSnapshotClient) return false;
    let snapshot: SunoSnapshot;
    try {
      snapshot = await activeSnapshotClient.readSnapshot();
    } catch {
      if (bindingGenerationRef.current === bindingGeneration) revokeConfirmedBinding();
      return false;
    }
    if (mediaGenerationRef.current !== mediaGeneration
      || bindingGenerationRef.current !== bindingGeneration) {
      return false;
    }
    if (snapshot.health !== 'healthy') {
      setAdapterHealth(snapshot.health);
      syncSessionActiveRef.current = false;
      playbackAttemptGenerationRef.current += 1;
      videoRef.current?.pause();
      setCoordinator(undefined);
      setState(snapshot.health === 'unavailable' ? 'adapter-unavailable' : 'binding-required');
      return false;
    }
    setAdapterHealth('healthy');
    const bindingStatus = inspectBinding(startBinding, snapshot.clips);
    if (bindingStatus.state === 'warning') {
      revokeConfirmedBinding(bindingStatus.reason);
      return false;
    }
    return true;
  };

  const handleStart = async () => {
    if (!activeSnapshotClient || !videoRef.current || !binding) return;
    const mediaGeneration = mediaGenerationRef.current;
    const bindingGeneration = bindingGenerationRef.current;
    const startBinding = binding;
    if (!await preflightPlayback(startBinding, mediaGeneration, bindingGeneration)) return;
    const nextCoordinator = new SyncCoordinator(
      () => activeSnapshotClient.readSnapshot(),
      createGuardedVideoController(videoRef.current, mediaGeneration),
      new SyncEngine({ smallErrorSeconds: 0.02, largeErrorSeconds: 0.15 })
    );
    await unlockPlaybackAndStart(nextCoordinator, mediaGeneration);
  };

  const handleResumePlayback = async () => {
    if (!coordinator || !binding) return;
    const mediaGeneration = mediaGenerationRef.current;
    const bindingGeneration = bindingGenerationRef.current;
    if (!await preflightPlayback(binding, mediaGeneration, bindingGeneration)) return;
    await unlockPlaybackAndStart(coordinator, mediaGeneration);
  };

  const handleResync = async () => {
    if (!canSync || !activeSnapshotClient || !videoRef.current || !binding) return;
    const mediaGeneration = mediaGenerationRef.current;
    const bindingGeneration = bindingGenerationRef.current;
    const currentBinding = binding;
    const resyncCoordinator = new SyncCoordinator(
      () => activeSnapshotClient.readSnapshot(),
      createGuardedVideoController(videoRef.current, mediaGeneration, bindingGeneration),
      new SyncEngine({ smallErrorSeconds: 0.02, largeErrorSeconds: 0.15 })
    );
    const result = await resyncCoordinator.resync(currentBinding, {
      clipStartSeconds: currentBinding.clipStartSeconds,
      videoInSeconds: currentBinding.trimStartSeconds,
      offsetSeconds: offsetMs / 1000
    });
    if (mediaGenerationRef.current !== mediaGeneration
      || bindingGenerationRef.current !== bindingGeneration) return;
    if (result.state === 'warning') {
      revokeConfirmedBinding(result.reason);
    } else if (result.state === 'adapter-unavailable') {
      syncSessionActiveRef.current = false;
      playbackAttemptGenerationRef.current += 1;
      videoRef.current?.pause();
      setCoordinator(undefined);
      setState('adapter-unavailable');
    }
  };

  const applyConnectionSnapshot = (snapshot: SunoSnapshot) => {
    setClips(snapshot.clips);
    setBridgeStatus(snapshot.bridgeStatus);
    setAdapterHealth(snapshot.health);
    setAdapterReason(snapshot.reason);
    if (snapshot.projectTimeSeconds !== undefined) {
      setLastStudioTimeSeconds(snapshot.projectTimeSeconds);
    }
    if (snapshot.health !== 'healthy') {
      if (syncSessionActiveRef.current) {
        syncSessionActiveRef.current = false;
        playbackAttemptGenerationRef.current += 1;
        videoRef.current?.pause();
      }
      setCoordinator(undefined);
      setState(snapshot.health === 'unavailable' ? 'adapter-unavailable' : 'binding-required');
    }
  };

  const handleConnectStudio = async () => {
    if (!activeSnapshotClient?.connect) return;
    applyConnectionSnapshot(await activeSnapshotClient.connect());
  };

  const handleReloadStudio = async () => {
    if (!activeSnapshotClient?.reloadStudio) return;
    applyConnectionSnapshot(await activeSnapshotClient.reloadStudio());
  };

  const handleCopyDiagnostics = async (): Promise<boolean> => {
    if (!activeSnapshotClient?.readDiagnostics || !navigator.clipboard?.writeText) return false;
    const entries = await activeSnapshotClient.readDiagnostics();
    await navigator.clipboard.writeText(JSON.stringify({
      schemaVersion: 1,
      entries
    }, null, 2));
    return true;
  };

  const hasStudioActions = Boolean(
    activeSnapshotClient?.connect
    && activeSnapshotClient.reloadStudio
    && activeSnapshotClient.readDiagnostics
  );

  const presentationPhase = derivePresentationPhase({
    state,
    hasStudioActions,
    bridgeStatus,
    hasFile: Boolean(file),
    silentReferenceKind: silentReference?.kind,
    bindingConfirmed
  });

  const preparationSteps: Readonly<Record<PreparationStep, ReactNode>> = {
    'connect-studio': hasStudioActions ? (
      <StudioConnectionCard
        bridgeStatus={bridgeStatus}
        reason={adapterReason}
        onConnect={handleConnectStudio}
        onReload={handleReloadStudio}
        onCopyDiagnostics={handleCopyDiagnostics}
      />
    ) : null,
    'import-video': (
      <VideoImporter file={file} metadata={metadata} onFileSelected={handleFileSelected} />
    ),
    'prepare-reference': (
      <SilentReferenceCard
        state={silentReference ?? { kind: 'preparing' }}
        onRetry={handleRetrySilentReference}
      />
    ),
    'bind-reference': (
      <BindingPicker
        clips={clips}
        bridgeStatus={bridgeStatus}
        selectedClipId={selectedClipId}
        confirmedClipId={bindingConfirmed ? selectedClipId : undefined}
        onSelect={setSelectedClipId}
        onConfirm={handleConfirmBinding}
      />
    )
  };

  return (
    <main className="app-shell" aria-label={t('brand.panelLabel')}>
      <BrandHeader />
      <VideoStage
        previewURL={previewURL}
        videoRef={videoRef}
        studioTimeSeconds={lastStudioTimeSeconds}
      />
      <div className="settings-scroll" data-testid="settings-scroll">
        <ReadinessZone
          state={state}
          warningReason={activeWarningReason}
          playbackError={playbackError}
          onRebind={handleRebind}
          onReselectFile={handleReselectFile}
          onResumePlayback={handleResumePlayback}
        />
        {presentationPhase.kind === 'preparation' ? (
          <PreparationFlow phase={presentationPhase} steps={preparationSteps} />
        ) : (
          <>
            <section className="work-zone">
              <TimeMapping binding={binding} offsetMs={offsetMs} locked={bindingConfirmed} />
              <OffsetControl
                canResync={canSync}
                offsetMs={offsetMs}
                onOffsetChange={setOffsetMs}
                onResync={() => void handleResync()}
              />
            </section>
            <ActionZone
              state={state}
              canSync={canSync}
              onStart={handleStart}
              onRebind={handleRebind}
              onReselectFile={handleReselectFile}
              onResumePlayback={handleResumePlayback}
            />
          </>
        )}
        <DeveloperFooter
          contactUrl={developerContactUrl}
          homepageUrl={developerHomepageUrl}
        />
      </div>
    </main>
  );
}
