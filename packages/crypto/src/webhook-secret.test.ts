import { describe, expect, it } from 'vitest';
import { generateWebhookSecret } from './webhook-secret.js';

describe('generateWebhookSecret', () => {
  it('is prefixed for recognizability', () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_/);
  });

  it('is unique per call', () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});
