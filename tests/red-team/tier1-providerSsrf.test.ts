/**
 * ARGUS-9 Tier 1 — Provider SSRF & Endpoint Abuse
 *
 * Tests that ProviderValidationService accepts dangerous URLs
 * that could be used for SSRF attacks.
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

  it('accepts file:// protocol URL', () => {
    // VULN: URL constructor accepts file:// but it should never be a valid provider endpoint
    const errors = validator.validate(makeProviderInput('file:///etc/passwd'));
    expect(errors).toEqual([]);
  });

  it('accepts AWS metadata endpoint', () => {
    // VULN: No SSRF protection — cloud metadata endpoint is a classic attack vector
    const errors = validator.validate(makeProviderInput('http://169.254.169.254/latest/meta-data/'));
    expect(errors).toEqual([]);
  });

  it('accepts localhost URL', () => {
    // VULN: No blocklist for loopback addresses
    const errors = validator.validate(makeProviderInput('http://localhost:8080'));
    expect(errors).toEqual([]);
  });

  it('accepts 127.0.0.1 URL', () => {
    // VULN: Direct IP loopback not blocked
    const errors = validator.validate(makeProviderInput('http://127.0.0.1:8080'));
    expect(errors).toEqual([]);
  });

  it('accepts IPv6 loopback URL', () => {
    // VULN: IPv6 loopback not blocked
    const errors = validator.validate(makeProviderInput('http://[::1]:8080'));
    expect(errors).toEqual([]);
  });

  it('accepts ftp:// protocol URL', () => {
    // VULN: No scheme allowlist — only http:// and https:// should be valid
    const errors = validator.validate(makeProviderInput('ftp://internal-server/data'));
    expect(errors).toEqual([]);
  });

  it('accepts hex-encoded localhost', () => {
    // VULN: 0x7f000001 = 127.0.0.1 — bypasses string-based loopback checks
    const errors = validator.validate(makeProviderInput('http://0x7f000001/'));
    expect(errors).toEqual([]);
  });

  it('accepts URL with embedded credentials', () => {
    // VULN: http://user:pass@host leaks credentials in URLs
    const errors = validator.validate(makeProviderInput('http://admin:password123@api.example.com'));
    expect(errors).toEqual([]);
  });

  it('accepts extremely long URL without length limit', () => {
    // VULN: No length limit on URLs — potential for buffer abuse
    const longPath = 'a'.repeat(10000);
    const errors = validator.validate(makeProviderInput(`https://example.com/${longPath}`));
    expect(errors).toEqual([]);
  });

  it('accepts internal network ranges', () => {
    // VULN: RFC 1918 private ranges not blocked
    const errors = validator.validate(makeProviderInput('http://10.0.0.1:8080/api'));
    expect(errors).toEqual([]);
  });
});
