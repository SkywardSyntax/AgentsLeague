/**
 * Stream protocol — runtime-checkable protocol versioning and compatibility
 * for the SSE stream between client and server.
 */

export interface ProtocolVersion {
  major: number;
  minor: number;
  patch: number;
}

export const CURRENT_PROTOCOL_VERSION = '1.2.0';

export const PROTOCOL_FEATURES = [
  'assistant.text.delta',
  'assistant.text.done',
  'assistant.draw.batch',
  'assistant.semantic.batch',
  'assistant.error',
  'assistant.planning.start',
  'assistant.planning.done',
] as const;

export type ProtocolFeature = (typeof PROTOCOL_FEATURES)[number];

export const PROTOCOL_VERSION_HEADER = 'x-stream-protocol-version';

export function parseProtocolVersion(version: string): ProtocolVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function isCompatible(clientVersion: string, serverVersion: string): boolean {
  const client = parseProtocolVersion(clientVersion);
  const server = parseProtocolVersion(serverVersion);
  if (!client || !server) return false;
  return client.major === server.major;
}

export function supportsFeature(feature: string): feature is ProtocolFeature {
  return (PROTOCOL_FEATURES as readonly string[]).includes(feature);
}

export function protocolHeader(): { name: string; value: string } {
  return { name: PROTOCOL_VERSION_HEADER, value: CURRENT_PROTOCOL_VERSION };
}

export function negotiateProtocol(
  clientVersions: string[],
  serverVersions: string[],
): string | null {
  const parsed = clientVersions
    .map((v) => ({ raw: v, parsed: parseProtocolVersion(v) }))
    .filter((e) => e.parsed !== null)
    .sort((a, b) => {
      const ap = a.parsed!;
      const bp = b.parsed!;
      return bp.major - ap.major || bp.minor - ap.minor || bp.patch - ap.patch;
    });

  for (const entry of parsed) {
    if (serverVersions.some((sv) => isCompatible(entry.raw, sv))) {
      return entry.raw;
    }
  }
  return null;
}
