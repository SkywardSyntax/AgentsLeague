import { describe, it, expect } from 'vitest';
import {
  CURRENT_PROTOCOL_VERSION,
  parseProtocolVersion,
  isCompatible,
  PROTOCOL_FEATURES,
  supportsFeature,
  protocolHeader,
  negotiateProtocol,
  PROTOCOL_VERSION_HEADER,
} from '../stream-protocol';

describe('Lane 04 — Stream Protocol Documentation', () => {
  it('CURRENT_PROTOCOL_VERSION is a valid semver string', () => {
    expect(parseProtocolVersion(CURRENT_PROTOCOL_VERSION)).not.toBeNull();
  });

  it('parseProtocolVersion() parses valid version strings', () => {
    const v = parseProtocolVersion('2.1.3');
    expect(v).toEqual({ major: 2, minor: 1, patch: 3 });
  });

  it('parseProtocolVersion() returns null for invalid strings', () => {
    expect(parseProtocolVersion('abc')).toBeNull();
    expect(parseProtocolVersion('1.2')).toBeNull();
    expect(parseProtocolVersion('')).toBeNull();
  });

  it('isCompatible() returns true for matching major versions', () => {
    expect(isCompatible('1.0.0', '1.5.2')).toBe(true);
  });

  it('isCompatible() returns false for different major versions', () => {
    expect(isCompatible('1.0.0', '2.0.0')).toBe(false);
  });

  it('PROTOCOL_FEATURES lists all supported event types', () => {
    expect(PROTOCOL_FEATURES.length).toBeGreaterThan(0);
    expect(PROTOCOL_FEATURES).toContain('assistant.text.delta');
    expect(PROTOCOL_FEATURES).toContain('assistant.text.done');
  });

  it('supportsFeature() returns true for known features', () => {
    expect(supportsFeature('assistant.text.delta')).toBe(true);
  });

  it('supportsFeature() returns false for unknown features', () => {
    expect(supportsFeature('nonexistent.feature')).toBe(false);
  });

  it('protocolHeader() returns correct header name and value', () => {
    const header = protocolHeader();
    expect(header.name).toBe(PROTOCOL_VERSION_HEADER);
    expect(header.value).toBe(CURRENT_PROTOCOL_VERSION);
  });

  it('negotiateProtocol() selects highest compatible version', () => {
    const result = negotiateProtocol(['1.0.0', '1.3.0', '1.1.0'], ['1.2.0']);
    expect(result).toBe('1.3.0');
    expect(negotiateProtocol(['2.0.0'], ['1.0.0'])).toBeNull();
  });
});
