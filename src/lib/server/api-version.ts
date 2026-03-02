/**
 * API version negotiation — version header handling with backward compatibility.
 */

export const CURRENT_API_VERSION = 'v2';

export const SUPPORTED_VERSIONS = ['v1', 'v2'] as const;
export type ApiVersion = (typeof SUPPORTED_VERSIONS)[number];

export const API_VERSION_HEADER = 'x-api-version';

export function parseApiVersion(value: string): ApiVersion | null {
  const trimmed = value.trim().toLowerCase();
  if ((SUPPORTED_VERSIONS as readonly string[]).includes(trimmed)) {
    return trimmed as ApiVersion;
  }
  return null;
}

export function isSupported(version: string): boolean {
  return parseApiVersion(version) !== null;
}

export function getVersionFromHeaders(headers: Record<string, string | undefined>): ApiVersion | null {
  const raw = headers[API_VERSION_HEADER];
  if (!raw) return null;
  return parseApiVersion(raw);
}

/**
 * Selects the highest mutually supported version.
 * Falls back to the minimum supported version if no overlap is found.
 */
export function negotiateVersion(
  clientVersions: string[],
  serverVersions: string[] = [...SUPPORTED_VERSIONS],
): ApiVersion {
  // Sort by version number descending
  const sorted = [...clientVersions]
    .filter((v) => parseApiVersion(v) !== null)
    .sort((a, b) => {
      const numA = parseInt(a.replace('v', ''), 10);
      const numB = parseInt(b.replace('v', ''), 10);
      return numB - numA;
    });

  for (const v of sorted) {
    if (serverVersions.includes(v)) {
      return v as ApiVersion;
    }
  }

  // Fall back to minimum
  return SUPPORTED_VERSIONS[0];
}
