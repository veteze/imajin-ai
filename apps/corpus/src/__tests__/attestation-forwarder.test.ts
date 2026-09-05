import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardIngestionAttestation } from '../lib/attestation-forwarder';
import type { IngestionAttestation } from '../engine/types';

const ORIGINAL_AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL;
const ORIGINAL_ATTESTATION_KEY = process.env.ATTESTATION_INTERNAL_API_KEY;

function attestation(overrides: Partial<IngestionAttestation> = {}): IngestionAttestation {
  return {
    id: 'ing_test',
    source: 'github:ima-jin/imajin-ai',
    corpusDid: 'did:example:alice',
    ingesterDid: 'did:example:alice',
    contentHash: 'abc123',
    threadCount: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    signature: 'deadbeef',
    ...overrides,
  };
}

describe('forwardIngestionAttestation (#1750)', () => {
  beforeEach(() => {
    process.env.AUTH_SERVICE_URL = 'http://kernel.test';
    process.env.ATTESTATION_INTERNAL_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_AUTH_SERVICE_URL === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = ORIGINAL_AUTH_SERVICE_URL;
    if (ORIGINAL_ATTESTATION_KEY === undefined) delete process.env.ATTESTATION_INTERNAL_API_KEY;
    else process.env.ATTESTATION_INTERNAL_API_KEY = ORIGINAL_ATTESTATION_KEY;
  });

  it('posts to the kernel internal attestations endpoint with the corpus.ingested type and bearer auth', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ id: 'att_kernel123' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await forwardIngestionAttestation(attestation(), 'did:imajin:corpus-service');

    expect(result).toEqual({ ok: true, kernelAttestationId: 'att_kernel123' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://kernel.test/api/attestations/internal',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      issuer_did: 'did:imajin:corpus-service',
      subject_did: 'did:example:alice',
      type: 'corpus.ingested',
      context_id: 'github:ima-jin/imajin-ai',
    });
  });

  it('returns ok:false without throwing when the kernel responds with a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })));

    const result = await forwardIngestionAttestation(attestation(), 'did:imajin:corpus-service');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/500/);
  });

  it('returns ok:false without throwing on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const result = await forwardIngestionAttestation(attestation(), 'did:imajin:corpus-service');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it('returns ok:false when AUTH_SERVICE_URL or ATTESTATION_INTERNAL_API_KEY is unset, without calling fetch', async () => {
    delete process.env.ATTESTATION_INTERNAL_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await forwardIngestionAttestation(attestation(), 'did:imajin:corpus-service');

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
