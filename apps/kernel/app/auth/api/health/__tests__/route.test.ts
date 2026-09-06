/**
 * GET /auth/api/health (#2037): surfaces `attestationForwardFailures` from
 * `@imajin/auth`'s `getAttestationForwardFailureCount()` so a 100%
 * attestation-forward reject rate (e.g. from a misconfigured
 * ATTESTATION_INTERNAL_API_KEY) shows up on the service's own health
 * surface instead of hiding silently.
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  mockGetAttestationForwardFailureCount: vi.fn().mockReturnValue(0),
}));

vi.mock('@imajin/auth', () => ({
  getAttestationForwardFailureCount: h.mockGetAttestationForwardFailureCount,
}));

import { GET } from '../route';

describe('auth service health', () => {
  it('reports a zero attestationForwardFailures count when nothing has failed', async () => {
    h.mockGetAttestationForwardFailureCount.mockReturnValue(0);

    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('ok');
    expect(body.service).toBe('auth');
    expect(body.attestationForwardFailures).toBe(0);
  });

  it('surfaces a non-zero attestationForwardFailures count', async () => {
    h.mockGetAttestationForwardFailureCount.mockReturnValue(7);

    const res = await GET();
    const body = await res.json();

    expect(body.attestationForwardFailures).toBe(7);
  });
});
