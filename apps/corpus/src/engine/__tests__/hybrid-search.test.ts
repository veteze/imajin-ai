import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgxClient, type FetchLike } from '../../lib/pgx-client';
import { CorpusEngine } from '../index';
import { thread } from './support/thread-fixture';

const EMBED_URL = 'http://pgx.test:8001';
const RERANK_URL = 'http://pgx.test:8002';
const DIMS = 1024;

function oneHot(index: number): number[] {
  const vector = new Array(DIMS).fill(0);
  vector[index] = 1;
  return vector;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function parseBody(init: RequestInit): Record<string, unknown> {
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

/** A fake PGX embed endpoint: routes each text to a vector by substring match, first match wins. */
function embedFetch(routes: [substring: string, vector: number[]][]): FetchLike {
  return async (_url, init) => {
    const input = parseBody(init).input as string[];
    const data = input.map((text, index) => {
      const match = routes.find(([substring]) => text.includes(substring));
      return { index, embedding: match ? match[1] : oneHot(999) };
    });
    return jsonResponse({ data });
  };
}

function alwaysFailingFetch(): FetchLike {
  return async () => {
    throw new Error('ECONNREFUSED');
  };
}

describe('CorpusEngine hybrid search (#1599, #1601)', () => {
  let dataDir: string;
  let engine: CorpusEngine | undefined;
  const ORIGINAL_PGX_EMBED_URL = process.env.PGX_EMBED_URL;
  const ORIGINAL_PGX_RERANK_URL = process.env.PGX_RERANK_URL;

  beforeEach(() => {
    // Every test injects its own `pgxClient` (or none at all); never let a
    // developer's/CI's ambient env leak into "is PGX configured?" checks.
    delete process.env.PGX_EMBED_URL;
    delete process.env.PGX_RERANK_URL;
    dataDir = mkdtempSync(join(tmpdir(), 'corpus-hybrid-'));
  });

  afterEach(() => {
    engine?.close();
    rmSync(dataDir, { recursive: true, force: true });
    if (ORIGINAL_PGX_EMBED_URL === undefined) delete process.env.PGX_EMBED_URL;
    else process.env.PGX_EMBED_URL = ORIGINAL_PGX_EMBED_URL;
    if (ORIGINAL_PGX_RERANK_URL === undefined) delete process.env.PGX_RERANK_URL;
    else process.env.PGX_RERANK_URL = ORIGINAL_PGX_RERANK_URL;
  });

  const did = 'did:example:alice';

  // The query and the "relevant" thread share zero tokens; the decoy thread
  // shares zero tokens with the query too, so a plain BM25 query can't
  // distinguish them at all (both score 0 hits). Only vector similarity
  // (faked here via a shared one-hot embedding) can tell them apart.
  const relevantThread = thread({
    id: 'relevant',
    title: 'Socket bridge halts unexpectedly',
    body: 'Socket bridge halts after an intermittent link hiccup and does not resume automatically.',
  });
  const decoyThread = thread({
    id: 'decoy',
    title: 'Invoice export duplicates rows',
    body: 'Invoice export produces duplicate line items for annual customers.',
  });
  const query = 'connection stays dead following a brief outage';

  it('a query with zero keyword overlap returns the semantically relevant thread only in hybrid/semantic mode', async () => {
    const fetchImpl = embedFetch([
      ['Socket bridge', oneHot(0)],
      [query, oneHot(0)],
      ['Invoice export', oneHot(1)],
    ]);
    const pgxClient = new PgxClient({ embedUrl: EMBED_URL, fetchImpl });
    engine = new CorpusEngine({ dataDir, pgxClient });

    engine.ingest(did, [relevantThread, decoyThread]);
    await engine.embedPending(did);

    const bm25Only = await engine.search(did, { query, mode: 'bm25' });
    expect(bm25Only.totalHits).toBe(0);

    const hybrid = await engine.search(did, { query });
    expect(hybrid.mode).toBe('hybrid');
    expect(hybrid.degraded).toBeUndefined();
    expect(hybrid.results[0].id).toBe('relevant');
    // The decoy is still a candidate (its vector distance is finite, just
    // much worse), so it's included but scored well below the relevant hit.
    const decoyHit = hybrid.results.find(hit => hit.id === 'decoy');
    expect(decoyHit).toBeDefined();
    expect(hybrid.results[0].score).toBeGreaterThan(decoyHit?.score ?? Infinity);

    const semanticOnly = await engine.search(did, { query, mode: 'semantic' });
    expect(semanticOnly.mode).toBe('semantic');
    expect(semanticOnly.results[0].id).toBe('relevant');
  });

  it('reorders hybrid results via the PGX reranker when configured', async () => {
    const embed = embedFetch([
      ['Socket bridge', oneHot(0)],
      [query, oneHot(0)],
      ['Invoice export', oneHot(0)], // identical vector — vector score alone can't distinguish them
    ]);
    const rerankCalls: string[][] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      if (url.endsWith('/rerank')) {
        const body = parseBody(init) as { documents: string[] };
        rerankCalls.push(body.documents);
        // Always prefer whichever doc mentions "Socket bridge".
        const results = body.documents.map((doc, index) => ({
          index,
          relevance_score: doc.includes('Socket bridge') ? 1 : 0,
        }));
        return jsonResponse({ results });
      }
      return embed(url, init);
    };

    const pgxClient = new PgxClient({ embedUrl: EMBED_URL, rerankUrl: RERANK_URL, fetchImpl });
    engine = new CorpusEngine({ dataDir, pgxClient });

    engine.ingest(did, [decoyThread, relevantThread]);
    await engine.embedPending(did);

    const result = await engine.search(did, { query });
    expect(result.mode).toBe('hybrid');
    expect(rerankCalls).toHaveLength(1);
    expect(result.results[0].id).toBe('relevant');
  });

  it('degrades to bm25 with degraded:["semantic"] when the PGX embedder is unreachable, never a throw', async () => {
    const pgxClient = new PgxClient({ embedUrl: EMBED_URL, fetchImpl: alwaysFailingFetch() });
    engine = new CorpusEngine({ dataDir, pgxClient });

    engine.ingest(did, [thread({ id: '1', title: 'BM25 keyword hit', body: 'contains the word keyword' })]);

    const result = await engine.search(did, { query: 'keyword' });

    expect(result.mode).toBe('bm25');
    expect(result.degraded).toEqual(['semantic']);
    expect(result.results[0].id).toBe('1');
  });

  it('keeps a ref-pinned query bm25-only even when a PGX embedder is configured, and never calls it', async () => {
    const fetchImpl: FetchLike = vi.fn(alwaysFailingFetch());
    const pgxClient = new PgxClient({ embedUrl: EMBED_URL, fetchImpl });
    engine = new CorpusEngine({ dataDir, pgxClient });

    const ref = 'a'.repeat(40);
    engine.ingest(did, [thread({ id: '1', source: 'local:workspace', sourceType: 'local', title: 'Pinned doc', body: 'hello world' })], ref);

    const result = await engine.search(did, { query: 'hello', source: 'local:workspace', ref });

    expect(result.mode).toBe('bm25');
    expect(result.degraded).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ingest succeeds even when embedding fails, and chunks stay pending for the next sweep', async () => {
    const pgxClient = new PgxClient({ embedUrl: EMBED_URL, fetchImpl: alwaysFailingFetch() });
    engine = new CorpusEngine({ dataDir, pgxClient });

    const ingestResult = engine.ingest(did, [relevantThread]);
    expect(ingestResult).toEqual({ ingested: 1 });

    const afterFailedAttempt = await engine.embedPending(did);
    expect(afterFailedAttempt).toEqual({ embedded: 0, failed: 1 });
    expect(engine.status(did).pendingEmbeddings).toBe(1);

    // A later sweep with a working PGX picks the same pending chunk back up.
    const workingClient = new PgxClient({ embedUrl: EMBED_URL, fetchImpl: embedFetch([['Socket bridge', oneHot(0)]]) });
    const engineWithWorkingClient = new CorpusEngine({ dataDir, pgxClient: workingClient });
    const retryResult = await engineWithWorkingClient.embedPending(did);

    expect(retryResult).toEqual({ embedded: 1, failed: 0 });
    expect(engineWithWorkingClient.status(did).pendingEmbeddings).toBe(0);
    engineWithWorkingClient.close();
  });

  it('reports pendingEmbeddings on status and clears it after a successful sweep', async () => {
    const pgxClient = new PgxClient({ embedUrl: EMBED_URL, fetchImpl: embedFetch([['Socket bridge', oneHot(0)]]) });
    engine = new CorpusEngine({ dataDir, pgxClient });

    engine.ingest(did, [relevantThread]);
    expect(engine.status(did).pendingEmbeddings).toBe(1);

    await engine.embedPending(did);
    expect(engine.status(did).pendingEmbeddings).toBe(0);
  });

  it('stays bm25 with no PGX configured at all, and reports no degraded capability', async () => {
    engine = new CorpusEngine({ dataDir });
    engine.ingest(did, [thread({ id: '1', title: 'Plain keyword search', body: 'keyword appears here' })]);

    const result = await engine.search(did, { query: 'keyword' });

    expect(result.mode).toBe('bm25');
    expect(result.degraded).toBeUndefined();
  });
});
