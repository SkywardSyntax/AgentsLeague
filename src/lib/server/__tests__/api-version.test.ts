import { describe, it, expect } from 'vitest';
import {
  CURRENT_API_VERSION,
  SUPPORTED_VERSIONS,
  parseApiVersion,
  isSupported,
  API_VERSION_HEADER,
  negotiateVersion,
  getVersionFromHeaders,
} from '../api-version';

describe('Lane 10 — API Version Negotiation', () => {
  it('CURRENT_API_VERSION is a valid version string', () => {
    expect(parseApiVersion(CURRENT_API_VERSION)).not.toBeNull();
  });

  it('SUPPORTED_VERSIONS lists all supported versions', () => {
    expect(SUPPORTED_VERSIONS.length).toBeGreaterThanOrEqual(1);
    expect(SUPPORTED_VERSIONS).toContain('v1');
    expect(SUPPORTED_VERSIONS).toContain('v2');
  });

  it('parseApiVersion() parses valid "v1" format', () => {
    expect(parseApiVersion('v1')).toBe('v1');
    expect(parseApiVersion('v2')).toBe('v2');
  });

  it('parseApiVersion() returns null for invalid format', () => {
    expect(parseApiVersion('v99')).toBeNull();
    expect(parseApiVersion('abc')).toBeNull();
    expect(parseApiVersion('')).toBeNull();
  });

  it('isSupported() returns true for current version', () => {
    expect(isSupported(CURRENT_API_VERSION)).toBe(true);
  });

  it('isSupported() returns false for unsupported version', () => {
    expect(isSupported('v99')).toBe(false);
    expect(isSupported('invalid')).toBe(false);
  });

  it('API_VERSION_HEADER is "x-api-version"', () => {
    expect(API_VERSION_HEADER).toBe('x-api-version');
  });

  it('negotiateVersion() picks highest mutually supported version', () => {
    const result = negotiateVersion(['v1', 'v2'], ['v1', 'v2']);
    expect(result).toBe('v2');
  });

  it('negotiateVersion() falls back to minimum version', () => {
    const result = negotiateVersion(['v99'], ['v1', 'v2']);
    expect(result).toBe('v1');
  });

  it('getVersionFromHeaders() extracts version from header map', () => {
    const headers = { 'x-api-version': 'v2' };
    expect(getVersionFromHeaders(headers)).toBe('v2');
    expect(getVersionFromHeaders({})).toBeNull();
  });
});
