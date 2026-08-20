import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ValidationError } from '@cryptopay/shared';

export type LookupFn = (hostname: string, options: { all: true }) => Promise<{ address: string }[]>;

/**
 * Blocks the address ranges an attacker would aim a webhook URL at to reach
 * internal infrastructure (spec §29 SSRF protection): loopback, RFC1918
 * private ranges, link-local (incl. the cloud metadata endpoint at
 * 169.254.169.254), and the unspecified address.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets as [number, number, number, number];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. cloud metadata)
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1') return true; // loopback
    if (normalized === '::') return true; // unspecified
    if (normalized.startsWith('fe80:')) return true; // link-local
    if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local
    if (normalized.startsWith('::ffff:')) {
      // IPv4-mapped IPv6 — unwrap and re-check the embedded v4 address.
      return isPrivateOrReservedIp(normalized.slice('::ffff:'.length));
    }
    return false;
  }
  return true; // not a parseable IP at all — refuse rather than guess
}

/**
 * Validates a merchant-supplied webhook URL is safe to fetch (spec §29):
 * HTTPS only, and every address the hostname resolves to must be public.
 * Call this again immediately before each delivery attempt, not just at
 * registration time — DNS is attacker-controlled and can rebind between
 * registration and send (a TOCTOU otherwise).
 */
export async function assertSafeWebhookUrl(rawUrl: string, lookupFn: LookupFn = dnsLookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ValidationError('Webhook URL is not a valid URL');
  }

  if (url.protocol !== 'https:') {
    throw new ValidationError('Webhook URL must use HTTPS');
  }

  const literalIp = isIP(url.hostname) ? url.hostname : null;
  const addresses = literalIp
    ? [literalIp]
    : await lookupFn(url.hostname, { all: true }).then(
        (records) => records.map((r) => r.address),
        () => {
          throw new ValidationError('Webhook URL hostname could not be resolved');
        },
      );

  if (addresses.length === 0 || addresses.some((address) => isPrivateOrReservedIp(address))) {
    throw new ValidationError('Webhook URL resolves to a private or reserved address');
  }

  return url;
}
