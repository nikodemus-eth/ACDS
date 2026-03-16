/**
 * ARGUS-9 Tier 1 — Provider SSRF & Endpoint Abuse
 *
 * Validates that ProviderValidationService correctly rejects dangerous URLs
 * that could be used for SSRF attacks. These vulnerabilities were fixed in
 * commit 98b2231 ("Harden dispatch execution and adaptive controls").
 */

import { describe, it, expect } from 'vitest';
import { ProviderValidationService } from '@acds/provider-broker';
import { ProviderVendor, AuthType } from '@acds/core-types';

function makeProviderInput(baseUrl: string) {
  return {
    name: 'test-provider',
    vendor: ProviderVendor.OPENAI,
    authType: AuthType.API_KEY,
    baseUrl,
    enabled: true,
    environment: 'production',
  };
}

describe('ARGUS A4-A6: Provider SSRF & Endpoint Abuse', () => {
  const validator = new ProviderValidationService();

  it('rejects file:// protocol URL after hardening', () => {
    // FIXED: Previously accepted file:// protocol (SSRF vector), now rejects non-http(s) schemes
    const errors = validator.validate(makeProviderInput('file:///etc/passwd'));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('must use http'))).toBe(true);
  });

  it('rejects AWS metadata endpoint after hardening', () => {
    // FIXED: Previously accepted cloud metadata endpoint (169.254.x.x), now blocked
    const errors = validator.validate(makeProviderInput('http://169.254.169.254/latest/meta-data/'));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects localhost URL after hardening', () => {
    // FIXED: Previously accepted loopback addresses, now blocked
    const errors = validator.validate(makeProviderInput('http://localhost:8080'));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects 127.0.0.1 URL after hardening', () => {
    // FIXED: Previously accepted direct IP loopback, now blocked
    const errors = validator.validate(makeProviderInput('http://127.0.0.1:8080'));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects IPv6 loopback URL after hardening', () => {
    // FIXED: Previously accepted IPv6 loopback, now blocked
    const errors = validator.validate(makeProviderInput('http://[::1]:8080'));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects ftp:// protocol URL after hardening', () => {
    // FIXED: Previously accepted non-http schemes, now only http:// and https:// allowed
    const errors = validator.validate(makeProviderInput('ftp://internal-server/data'));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('must use http'))).toBe(true);
  });

  it('rejects hex-encoded localhost after hardening', () => {
    // FIXED: 0x7f000001 = 127.0.0.1 — previously bypassed string-based checks, now caught
    const errors = validator.validate(makeProviderInput('http://0x7f000001/'));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects URL with embedded credentials after hardening', () => {
    // FIXED: http://user:pass@host previously accepted, now rejects embedded credentials
    const errors = validator.validate(makeProviderInput('http://admin:password123@api.example.com'));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects extremely long URL after hardening', () => {
    // FIXED: Previously had no length limit, now enforces maximum URL length
    const longPath = 'a'.repeat(10000);
    const errors = validator.validate(makeProviderInput(`https://example.com/${longPath}`));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects internal network ranges after hardening', () => {
    // FIXED: RFC 1918 private ranges previously not blocked, now rejected
    const errors = validator.validate(makeProviderInput('http://10.0.0.1:8080/api'));
    expect(errors.length).toBeGreaterThan(0);
  });
});
