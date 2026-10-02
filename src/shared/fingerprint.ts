import type { FileFingerprint } from './types';

const FINGERPRINT_BYTES = 65_536;
const PREFIX_HEX_LENGTH = 24;

export type FileReconciliationStatus = 'ready' | 'reauthorization-required';

export async function fingerprintFile(file: File): Promise<FileFingerprint> {
  const head = await file.slice(0, FINGERPRINT_BYTES).arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', head);
  const sha256Prefix = Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, PREFIX_HEX_LENGTH);

  return {
    name: file.name,
    size: file.size,
    type: file.type,
    sha256Prefix
  };
}

export function reconcileFile(
  saved: FileFingerprint,
  current: FileFingerprint
): FileReconciliationStatus {
  return saved.size === current.size && saved.sha256Prefix === current.sha256Prefix
    ? 'ready'
    : 'reauthorization-required';
}
