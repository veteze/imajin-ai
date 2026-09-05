import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crypto as authCrypto } from '@imajin/auth';
import { CorpusEngine } from '../index';
import { AttestationNotFoundError } from '../errors';
import type { ThreadDocument } from '../types';

const ORIGINAL_CORPUS_DID = process.env.CORPUS_DID;
const ORIGINAL_CORPUS_DID_PRIVATE_KEY = process.env.CORPUS_DID_PRIVATE_KEY;
const ORIGINAL_AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL;
const ORIGINAL_ATTESTATION_KEY = process.env.ATTESTATION_INTERNAL_API_KEY;

const CORPUS_KEYPAIR = authCrypto.generateKeypair();

function doc(overrides: Partial<ThreadDocument> = {}): ThreadDocument {
  return {
    source: 'github:ima-jin/imajin-ai',
    sourceType: 'github',
    id: overrides.id ?? '1',
    type: 'issue',
    title: overrides.title ?? 'Title',
    state: 'open',
    labels: [],
    author: 'octocat',
    created: '2026-08-09T15:00:00.000Z',
    updated: overrides.updated ?? '2026-08-09T16:00:00.000Z',
    linkedRefs: [],
    body: overrides.body ?? 'Body',
    comments: [],
    ...overrides,
  };
}

function setCorpusIdentityEnv(): void {
  process.env.CORPUS_DID = 'did:imajin:corpus-service-test';
  process.env.CORPUS_DID_PRIVATE_KEY = CORPUS_KEYPAIR.privateKey;
}

function restoreEnv(): void {
  if (ORIGINAL_CORPUS_DID === undefined) delete process.env.CORPUS_DID;
  else process.env.CORPUS_DID = ORIGINAL_CORPUS_DID;
  if (ORIGINAL_CORPUS_DID_PRIVATE_KEY === undefined) delete process.env.CORPUS_DID_PRIVATE_KEY;
  else process.env.CORPUS_DID_PRIVATE_KEY = ORIGINAL_CORPUS_DID_PRIVATE_KEY;
  if (ORIGINAL_AUTH_SERVICE_URL === undefined) delete process.env.AUTH_SERVICE_URL;
  else process.env.AUTH_SERVICE_URL = ORIGINAL_AUTH_SERVICE_URL;
  if (ORIGINAL_ATTESTATION_KEY === undefined) delete process.env.ATTESTATION_INTERNAL_API_KEY;
  else process.env.ATTESTATION_INTERNAL_API_KEY = ORIGINAL_ATTESTATION_KEY;
}

describe('CorpusEngine ingestion attestations (#1750)', () => {
  let dataDir: string;
  let engine: CorpusEngine;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'corpus-attestations-'));
    engine = new CorpusEngine({ dataDir, now: () => new Date('2026-09-01T00:00:00.000Z') });
    delete process.env.CORPUS_DID;
    delete process.env.CORPUS_DID_PRIVATE_KEY;
    delete process.env.AUTH_SERVICE_URL;
    delete process.env.ATTESTATION_INTERNAL_API_KEY;
  });

  afterEach(() => {
    engine.close();
    rmSync(dataDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it('ingest succeeds and returns no attestationId when no corpus identity is configured', () => {
    const result = engine.ingest('did:example:alice', [doc()]);
    expect(result).toEqual({ ingested: 1 });

    const search = engine.search('did:example:alice', { query: 'Title' });
    expect(search.results[0].attestationId).toBeUndefined();

    const status = engine.status('did:example:alice');
    expect(status.attestations).toEqual({ total: 0, pendingForward: 0 });
  });

  it('signs and persists an attestation, and surfaces attestationId on the matching search hit', () => {
    setCorpusIdentityEnv();

    engine.ingest('did:example:alice', [doc({ id: '1', title: 'Signed doc' })], undefined, 'did:example:ingester');

    const search = engine.search('did:example:alice', { query: 'Signed' });
    expect(search.results).toHaveLength(1);
    const attestationId = search.results[0].attestationId;
    expect(attestationId).toBeDefined();

    const view = engine.getAttestation('did:example:alice', attestationId as string);
    expect(view.attestation).toMatchObject({
      id: attestationId,
      source: 'github:ima-jin/imajin-ai',
      corpusDid: 'did:example:alice',
      ingesterDid: 'did:example:ingester',
      threadCount: 1,
    });
    expect(view.corpusPublicKey).toBe(CORPUS_KEYPAIR.publicKey);
  });

  it('throws AttestationNotFoundError for an unknown id, and for an id that exists under a different DID', () => {
    setCorpusIdentityEnv();
    engine.ingest('did:example:alice', [doc({ id: '1' })]);

    const search = engine.search('did:example:alice', { query: 'Title' });
    const attestationId = search.results[0].attestationId as string;

    expect(() => engine.getAttestation('did:example:alice', 'ing_does_not_exist')).toThrow(AttestationNotFoundError);
    // DID isolation: the same id does not resolve under a different DID's corpus.
    expect(() => engine.getAttestation('did:example:bob', attestationId)).toThrow(AttestationNotFoundError);
  });

  it('records a failed forward as pending and retries it on the next ingest', async () => {
    setCorpusIdentityEnv();
    process.env.AUTH_SERVICE_URL = 'http://kernel.test';
    process.env.ATTESTATION_INTERNAL_API_KEY = 'test-key';

    const fetchMock = vi.fn(async () => new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    engine.ingest('did:example:alice', [doc({ id: '1' })]);

    await vi.waitFor(() => {
      expect(engine.status('did:example:alice').attestations).toEqual({ total: 1, pendingForward: 1 });
    });

    // Next ingest retries the still-pending attestation, this time succeeding.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ id: 'att_kernel1' }), { status: 201 }));
    engine.ingest('did:example:alice', [doc({ id: '2', title: 'Second doc' })]);

    await vi.waitFor(() => {
      expect(engine.status('did:example:alice').attestations).toEqual({ total: 2, pendingForward: 0 });
    });
  });

  it('keeps ingesting successfully even when every forward attempt fails', async () => {
    setCorpusIdentityEnv();
    process.env.AUTH_SERVICE_URL = 'http://kernel.test';
    process.env.ATTESTATION_INTERNAL_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const result = engine.ingest('did:example:alice', [doc({ id: '1' })]);
    expect(result).toEqual({ ingested: 1 });

    await vi.waitFor(() => {
      expect(engine.status('did:example:alice').attestations.pendingForward).toBe(1);
    });
  });
});
