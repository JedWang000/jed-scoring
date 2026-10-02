export function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalMs = Math.round(safe * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor(totalMs / 60_000) % 60;
  const secs = Math.floor(totalMs / 1000) % 60;
  const ms = totalMs % 1000;
  const tail = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${tail}` : tail;
}
