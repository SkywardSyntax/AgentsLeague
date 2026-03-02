/**
 * State tampering detector — detect and reject tampered localStorage state
 * using checksum validation. Computes checksums on save, verifies on load.
 */

const CHECKSUM_KEY_SUFFIX = '__checksum';

export interface ChecksummedState<T> {
  data: T;
  checksum: string;
  timestamp: number;
  version: number;
}

export interface ValidationResult<T> {
  valid: boolean;
  data: T | null;
  error?: string;
}

/**
 * Simple deterministic hash (djb2 variant) for checksum computation.
 * Not cryptographic — used for tamper detection, not security against
 * sophisticated adversaries.
 */
export function computeChecksum(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createChecksummedState<T>(data: T, version = 1): ChecksummedState<T> {
  const serialized = JSON.stringify(data);
  const checksum = computeChecksum(serialized);
  return {
    data,
    checksum,
    timestamp: Date.now(),
    version,
  };
}

export function validateChecksummedState<T>(state: unknown): ValidationResult<T> {
  if (state === null || state === undefined) {
    return { valid: false, data: null, error: 'State is null or undefined' };
  }

  if (typeof state !== 'object') {
    return { valid: false, data: null, error: 'State is not an object' };
  }

  const record = state as Record<string, unknown>;

  if (!('data' in record) || !('checksum' in record) || !('timestamp' in record)) {
    return { valid: false, data: null, error: 'Missing required fields (data, checksum, timestamp)' };
  }

  if (typeof record.checksum !== 'string') {
    return { valid: false, data: null, error: 'Checksum is not a string' };
  }

  if (typeof record.timestamp !== 'number' || !Number.isFinite(record.timestamp)) {
    return { valid: false, data: null, error: 'Invalid timestamp' };
  }

  const serialized = JSON.stringify(record.data);
  const expectedChecksum = computeChecksum(serialized);

  if (record.checksum !== expectedChecksum) {
    return {
      valid: false,
      data: null,
      error: `Checksum mismatch: expected ${expectedChecksum}, got ${record.checksum}`,
    };
  }

  return { valid: true, data: record.data as T };
}

export function saveStateWithChecksum<T>(key: string, data: T, storage: Storage): void {
  const state = createChecksummedState(data);
  storage.setItem(key, JSON.stringify(state));
}

export function loadStateWithChecksum<T>(
  key: string,
  storage: Storage,
  fallback: T,
): { data: T; tampered: boolean } {
  const raw = storage.getItem(key);
  if (raw === null) {
    return { data: fallback, tampered: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { data: fallback, tampered: true };
  }

  const result = validateChecksummedState<T>(parsed);
  if (!result.valid) {
    return { data: fallback, tampered: true };
  }

  return { data: result.data!, tampered: false };
}

export function getChecksumKey(key: string): string {
  return `${key}${CHECKSUM_KEY_SUFFIX}`;
}

export function isChecksumValid(data: unknown, expectedChecksum: string): boolean {
  const serialized = JSON.stringify(data);
  return computeChecksum(serialized) === expectedChecksum;
}
