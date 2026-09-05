import { describe, expect, it } from 'vitest';
import { canonicalize, crypto as authCrypto } from '@imajin/auth';
import { buildIngestionAttestation, computeContentHash } from '../attestation';

describe('computeContentHash (#1750)', () => {
  it('is independent of input ordering', () => {
    const a = computeContentHash([
      { docId: '1', updated: '2026-01-01T00:00:00.000Z' },
      { docId: '2', updated: '2026-01-02T00:00:00.000Z' },
    ]);
    const b = computeContentHash([
      { docId: '2', updated: '2026-01-02T00:00:00.000Z' },
      { docId: '1', updated: '2026-01-01T00:00:00.000Z' },
    ]);

    expect(a).toBe(b);
  });

  it('changes when a document\'s updated timestamp changes', () => {
    const before = computeContentHash([{ docId: '1', updated: '2026-01-01T00:00:00.000Z' }]);
    const after = computeContentHash([{ docId: '1', updated: '2026-01-02T00:00:00.000Z' }]);

    expect(before).not.toBe(after);
  });

  it('changes when the set of documents changes', () => {
    const one = computeContentHash([{ docId: '1', updated: '2026-01-01T00:00:00.000Z' }]);
    const two = computeContentHash([
      { docId: '1', updated: '2026-01-01T00:00:00.000Z' },
      { docId: '2', updated: '2026-01-01T00:00:00.000Z' },
    ]);

    expect(one).not.toBe(two);
  });

  it('is deterministic for an empty batch', () => {
    expect(computeContentHash([])).toBe(computeContentHash([]));
  });
});

describe('buildIngestionAttestation (#1750)', () => {
  const identity = authCrypto.generateKeypair();

  it('produces a signature that verifies against the corpus identity\'s own public key', () => {
    const attestation = buildIngestionAttestation({
      identity: { did: 'did:imajin:corpus-test', privateKey: identity.privateKey },
      source: 'github:ima-jin/imajin-ai',
      corpusDid: 'did:example:alice',
      ingesterDid: 'did:example:alice',
      documentPairs: [{ docId: '1', updated: '2026-01-01T00:00:00.000Z' }],
      timestamp: '2026-01-01T00:00:01.000Z',
    });

    const canonicalPayload = canonicalize({
      source: attestation.source,
      corpusDid: attestation.corpusDid,
      ingesterDid: attestation.ingesterDid,
      contentHash: attestation.contentHash,
      threadCount: attestation.threadCount,
      timestamp: attestation.timestamp,
    });

    expect(authCrypto.verifySync(attestation.signature, canonicalPayload, identity.publicKey)).toBe(true);
  });

  it('fails verification when the payload is tampered with after signing', () => {
    const attestation = buildIngestionAttestation({
      identity: { did: 'did:imajin:corpus-test', privateKey: identity.privateKey },
      source: 'github:ima-jin/imajin-ai',
      corpusDid: 'did:example:alice',
      ingesterDid: 'did:example:alice',
      documentPairs: [{ docId: '1', updated: '2026-01-01T00:00:00.000Z' }],
      timestamp: '2026-01-01T00:00:01.000Z',
    });

    const tamperedPayload = canonicalize({
      source: attestation.source,
      corpusDid: attestation.corpusDid,
      ingesterDid: attestation.ingesterDid,
      contentHash: attestation.contentHash,
      threadCount: attestation.threadCount + 1, // tampered
      timestamp: attestation.timestamp,
    });

    expect(authCrypto.verifySync(attestation.signature, tamperedPayload, identity.publicKey)).toBe(false);
  });

  it('fails verification against a different identity\'s public key', () => {
    const otherKeypair = authCrypto.generateKeypair();
    const attestation = buildIngestionAttestation({
      identity: { did: 'did:imajin:corpus-test', privateKey: identity.privateKey },
      source: 'github:ima-jin/imajin-ai',
      corpusDid: 'did:example:alice',
      ingesterDid: 'did:example:alice',
      documentPairs: [{ docId: '1', updated: '2026-01-01T00:00:00.000Z' }],
    });

    const canonicalPayload = canonicalize({
      source: attestation.source,
      corpusDid: attestation.corpusDid,
      ingesterDid: attestation.ingesterDid,
      contentHash: attestation.contentHash,
      threadCount: attestation.threadCount,
      timestamp: attestation.timestamp,
    });

    expect(authCrypto.verifySync(attestation.signature, canonicalPayload, otherKeypair.publicKey)).toBe(false);
  });

  it('sets threadCount from the document batch size', () => {
    const attestation = buildIngestionAttestation({
      identity: { did: 'did:imajin:corpus-test', privateKey: identity.privateKey },
      source: 'github:ima-jin/imajin-ai',
      corpusDid: 'did:example:alice',
      ingesterDid: 'did:example:alice',
      documentPairs: [
        { docId: '1', updated: '2026-01-01T00:00:00.000Z' },
        { docId: '2', updated: '2026-01-01T00:00:00.000Z' },
      ],
    });

    expect(attestation.threadCount).toBe(2);
    expect(attestation.id).toMatch(/^ing_/);
  });
});
