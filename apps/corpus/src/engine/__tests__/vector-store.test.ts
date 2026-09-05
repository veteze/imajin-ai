import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CorpusStore } from '../store';
import type { ThreadDocument } from '../types';
import { EMBEDDING_DIMENSIONS, loadVectorExtension, migrateVectorSchema, searchSemantic, storeEmbedding } from '../vector-store';

function oneHot(index: number, dims = EMBEDDING_DIMENSIONS): number[] {
  const vector = new Array(dims).fill(0);
  vector[index] = 1;
  return vector;
}

function thread(overrides: Partial<ThreadDocument> = {}): ThreadDocument {
  return {
    source: overrides.source ?? 'github:ima-jin/imajin-ai',
    sourceType: overrides.sourceType ?? 'github',
    id: overrides.id ?? '1',
    type: overrides.type ?? 'issue',
    title: overrides.title ?? 'Shared title text',
    state: overrides.state ?? 'open',
    labels: overrides.labels ?? [],
    author: overrides.author ?? 'octocat',
    created: overrides.created ?? '2026-08-09T15:00:00.000Z',
    updated: overrides.updated ?? '2026-08-09T16:00:00.000Z',
    linkedRefs: overrides.linkedRefs ?? [],
    body: overrides.body ?? 'Shared body content, identical across DIDs for the isolation test.',
    comments: overrides.comments ?? [],
    resolution: overrides.resolution,
    url: overrides.url,
  };
}

describe('CorpusStore semantic search — cross-DID isolation (#1599)', () => {
  let dataDir: string;
  let store: CorpusStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'corpus-vector-store-'));
    store = new CorpusStore({ dataDir });
  });

  afterEach(() => {
    store.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('never returns DID B\'s chunk for DID A\'s query, even given identical text and identical vectors', () => {
    const didA = 'did:example:alice';
    const didB = 'did:example:bob';
    const identicalDoc = thread();

    store.ingest(didA, [identicalDoc]);
    store.ingest(didB, [identicalDoc]);

    const vector = oneHot(0);
    for (const did of [didA, didB]) {
      const [chunk] = store.pendingChunks(did, 10);
      expect(chunk).toBeDefined();
      store.storeChunkEmbedding(did, chunk.id, vector);
    }

    const aliceHits = store.semanticSearch(didA, vector, 10);
    const bobHits = store.semanticSearch(didB, vector, 10);

    // Each DID's query resolves only within its own (file-isolated,
    // owner_did-partitioned) index — one hit apiece, never the other's.
    expect(aliceHits).toHaveLength(1);
    expect(bobHits).toHaveLength(1);

    const aliceThreads = store.getThreadsByPk(didA, aliceHits.map(hit => hit.threadPk));
    expect(aliceThreads).toHaveLength(1);
    expect(aliceThreads[0].title).toBe('Shared title text');
  });

  it('pendingChunks/status never leak counts across DIDs', () => {
    store.ingest('did:example:alice', [thread({ id: 'a1' }), thread({ id: 'a2' })]);
    store.ingest('did:example:bob', [thread({ id: 'b1' })]);

    expect(store.status('did:example:alice').pendingEmbeddings).toBe(2);
    expect(store.status('did:example:bob').pendingEmbeddings).toBe(1);
  });
});

describe('vector-store owner_did partition key (#1599)', () => {
  it('filters KNN results by owner_did before ranking, even within one shared database file', () => {
    const db = new Database(':memory:');
    loadVectorExtension(db);
    migrateVectorSchema(db);

    const insertChunk = db.prepare(`
      INSERT INTO embedding_chunks (thread_pk, chunk_no, chunk_text, content_hash, owner_did, source, status, created_at)
      VALUES (@threadPk, 0, @chunkText, @contentHash, @ownerDid, @source, 'pending', @createdAt)
    `);

    const chunkA = insertChunk.run({
      threadPk: 1,
      chunkText: 'alice chunk',
      contentHash: 'hash-a',
      ownerDid: 'did:example:alice',
      source: 'github:ima-jin/imajin-ai',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const chunkB = insertChunk.run({
      threadPk: 2,
      chunkText: 'bob chunk',
      contentHash: 'hash-b',
      ownerDid: 'did:example:bob',
      source: 'github:ima-jin/imajin-ai',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const vector = oneHot(0);
    storeEmbedding(db, Number(chunkA.lastInsertRowid), 'did:example:alice', vector);
    storeEmbedding(db, Number(chunkB.lastInsertRowid), 'did:example:bob', vector);

    const aliceHits = searchSemantic(db, 'did:example:alice', vector, 10);
    const bobHits = searchSemantic(db, 'did:example:bob', vector, 10);

    expect(aliceHits).toHaveLength(1);
    expect(aliceHits[0].threadPk).toBe(1);
    expect(bobHits).toHaveLength(1);
    expect(bobHits[0].threadPk).toBe(2);

    db.close();
  });
});
