import { describe, expect, it } from 'vitest';
import { assertSafeWebhookUrl, isPrivateOrReservedIp } from './ssrf-guard.js';

describe('isPrivateOrReservedIp', () => {
  it('flags loopback, RFC1918, link-local, and cloud metadata addresses', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true); // cloud metadata endpoint
    expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd00::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false);
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });

  it('does not mistake a 172.x address just outside the private range', () => {
    expect(isPrivateOrReservedIp('172.15.0.1')).toBe(false);
    expect(isPrivateOrReservedIp('172.32.0.1')).toBe(false);
  });
});

describe('assertSafeWebhookUrl', () => {
  const resolvesTo = (...addresses: string[]) => () => Promise.resolve(addresses.map((address) => ({ address })));

  it('rejects a non-HTTPS URL', async () => {
    await expect(assertSafeWebhookUrl('http://example.com/webhook')).rejects.toThrow('HTTPS');
  });

  it('rejects a malformed URL', async () => {
    await expect(assertSafeWebhookUrl('not a url')).rejects.toThrow();
  });

  it('accepts an https URL resolving only to public addresses', async () => {
    const url = await assertSafeWebhookUrl('https://merchant.example.com/webhook', resolvesTo('93.184.216.34'));
    expect(url.hostname).toBe('merchant.example.com');
  });

  it('rejects a hostname that resolves to a private address (DNS rebinding, spec §29)', async () => {
    await expect(
      assertSafeWebhookUrl('https://evil.example.com/webhook', resolvesTo('169.254.169.254')),
    ).rejects.toThrow('private');
  });

  it('rejects when any one of multiple resolved addresses is private', async () => {
    await expect(
      assertSafeWebhookUrl('https://evil.example.com/webhook', resolvesTo('93.184.216.34', '10.0.0.1')),
    ).rejects.toThrow('private');
  });

  it('rejects an https URL with a literal private IP as the host', async () => {
    await expect(assertSafeWebhookUrl('https://127.0.0.1/webhook')).rejects.toThrow('private');
  });

  it('rejects when DNS resolution fails', async () => {
    const failingLookup = () => Promise.reject(new Error('ENOTFOUND'));
    await expect(assertSafeWebhookUrl('https://doesnotexist.example/webhook', failingLookup)).rejects.toThrow(
      'resolved',
    );
  });
});
