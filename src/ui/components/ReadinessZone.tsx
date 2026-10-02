import { SyncStatus, type SyncStatusProps } from './SyncStatus';

export type ReadinessZoneProps = Omit<SyncStatusProps, 'showActions'>;

export function ReadinessZone(props: ReadinessZoneProps) {
  return (
    <section className="readiness-zone">
      <SyncStatus {...props} showActions={props.state === 'playback-blocked'} />
    </section>
  );
}
