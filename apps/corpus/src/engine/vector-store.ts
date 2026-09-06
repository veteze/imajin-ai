/**
 * Vector storage for the corpus semantic layer (#1599).
 *
 * Storage decision (see PR description for full reasoning): `sqlite-vec`
 * co-located in the same per-DID SQLite file as the existing FTS5 BM25
 * index, instead of the originally-ticketed pgvector/Postgres. This keeps
 * the corpus service a single-store system — no new database, no new
 * connection pool, and the per-DID file-level isolation the BM25 engine
 * already relies on (`CorpusStore.databaseForDid`) covers the vector index
 * for free. `owner_did` is still stored and filtered on explicitly (see
 * `searchSemantic`) as defense-in-depth and to satisfy the ticket's
 * isolation requirement even though file-level separation already
 * guarantees it.
 *
 * Two tables per DID database:
 *  - `embedding_chunks`: the relational "logical" embeddings table the
 *    ticket describes (id, thread FK, chunk_no, chunk_text, owner_did,
 *    source, created_at), plus a `status` column tracking pending/embedded
 *    so a failed or not-yet-run embed pass can be retried later without
 *    losing track of what still needs work.
 *  - `vec_embeddings`: a `vec0` virtual table holding only the vector and
 *    the `owner_did` partition key, keyed by `rowid = embedding_chunks.id`.
 *    `vec0` tables can't hold arbitrary relational columns (FKs, free-form
 *    text well past its metadata-column limits), so the vector lives
 *    separately and is joined back by rowid — the standard sqlite-vec
 *    "chunks table + vec0 companion" pattern.
 */
import type Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { chunkForEmbedding, DEFAULT_EMBEDDING_CHUNK_CHARS } from './chunker';
import type { ThreadDocument } from './types';

export const EMBEDDING_DIMENSIONS = 1024; // bge-m3

export type EmbeddingChunkStatus = 'pending' | 'embedded';

export interface PendingEmbeddingChunk {
  id: number;
  threadPk: number;
  chunkNo: number;
  chunkText: string;
  ownerDid: string;
  source: string;
}

export interface SemanticHit {
  threadPk: number;
  chunkText: string;
  /** Cosine distance in [0, 2]; 0 is identical. */
  distance: number;
}

/** Loads the `sqlite-vec` SQL functions/virtual table module into `db`. Idempotent per connection. */
export function loadVectorExtension(db: Database.Database): void {
  sqliteVec.load(db);
}

/** Creates the embedding_chunks/vec_embeddings tables if they don't already exist. */
export function migrateVectorSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- Deliberately not a FOREIGN KEY to threads(pk): kept as a plain
      -- reference so this schema (and its tests) never require a threads
      -- table to exist, and so CorpusStore controls all cleanup explicitly
      -- (deleteChunksForThreads) rather than relying on cascade semantics.
      thread_pk INTEGER NOT NULL,
      chunk_no INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      owner_did TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      last_error TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(thread_pk, chunk_no)
    );

    CREATE INDEX IF NOT EXISTS embedding_chunks_status_idx ON embedding_chunks(status);
    CREATE INDEX IF NOT EXISTS embedding_chunks_owner_did_idx ON embedding_chunks(owner_did);

    CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
      embedding float[${EMBEDDING_DIMENSIONS}] distance_metric=cosine,
      owner_did TEXT partition key
    );
  `);
}

interface UpsertStatements {
  selectExisting: Database.Statement;
  insert: Database.Statement;
  update: Database.Statement;
  deleteVector: Database.Statement;
  deleteStale: Database.Statement;
  selectStale: Database.Statement;
}

function prepareUpsertStatements(db: Database.Database): UpsertStatements {
  return {
    selectExisting: db.prepare('SELECT id, content_hash, status FROM embedding_chunks WHERE thread_pk = ? AND chunk_no = ?'),
    insert: db.prepare(`
      INSERT INTO embedding_chunks (thread_pk, chunk_no, chunk_text, content_hash, owner_did, source, status, created_at)
      VALUES (@threadPk, @chunkNo, @chunkText, @contentHash, @ownerDid, @source, 'pending', @createdAt)
    `),
    update: db.prepare(`
      UPDATE embedding_chunks
      SET chunk_text = @chunkText, content_hash = @contentHash, status = 'pending', last_error = NULL
      WHERE id = @id
    `),
    deleteVector: db.prepare('DELETE FROM vec_embeddings WHERE rowid = ?'),
    selectStale: db.prepare('SELECT id FROM embedding_chunks WHERE thread_pk = ? AND chunk_no >= ?'),
    deleteStale: db.prepare('DELETE FROM embedding_chunks WHERE thread_pk = ? AND chunk_no >= ?'),
  };
}

/**
 * Re-derives embedding chunks for `document` (already upserted into
 * `threads` as `threadPk`) and upserts them as `pending`, skipping chunks
 * whose text hasn't changed since the last embed (`content_hash` match on
 * an already-`embedded` row). Any chunk indices beyond the thread's current
 * chunk count are deleted, along with their vectors. Must run inside the
 * same synchronous transaction as the `threads`/`thread_fts` write so a
 * thread's chunks never observably lag its content.
 */
export function upsertPendingChunksForThread(
  db: Database.Database,
  threadPk: number,
  document: ThreadDocument,
  ownerDid: string,
  contentHash: (text: string) => string,
  now: string,
  maxChunkChars = DEFAULT_EMBEDDING_CHUNK_CHARS,
): void {
  const statements = prepareUpsertStatements(db);
  const chunks = chunkForEmbedding(document, maxChunkChars);

  for (const chunk of chunks) {
    const hash = contentHash(chunk.text);
    const existing = statements.selectExisting.get(threadPk, chunk.chunkNo) as
      | { id: number; content_hash: string; status: EmbeddingChunkStatus }
      | undefined;

    if (!existing) {
      statements.insert.run({
        threadPk,
        chunkNo: chunk.chunkNo,
        chunkText: chunk.text,
        contentHash: hash,
        ownerDid,
        source: document.source,
        createdAt: now,
      });
      continue;
    }

    if (existing.content_hash === hash && existing.status === 'embedded') {
      continue; // unchanged since last successful embed — nothing to redo
    }
    statements.update.run({ id: existing.id, chunkText: chunk.text, contentHash: hash });
  }

  pruneStaleChunks(db, statements, threadPk, chunks.length);
}

function pruneStaleChunks(db: Database.Database, statements: UpsertStatements, threadPk: number, keepCount: number): void {
  const stale = statements.selectStale.all(threadPk, keepCount) as { id: number }[];
  for (const row of stale) {
    statements.deleteVector.run(BigInt(row.id));
  }
  statements.deleteStale.run(threadPk, keepCount);
}

/** Deletes every embedding chunk (and its vector) belonging to `threadPk`, e.g. before a `deleteSource`. */
export function deleteChunksForThreads(db: Database.Database, threadPks: number[]): void {
  if (threadPks.length === 0) return;
  const placeholders = threadPks.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT id FROM embedding_chunks WHERE thread_pk IN (${placeholders})`).all(...threadPks) as { id: number }[];
  const deleteVector = db.prepare('DELETE FROM vec_embeddings WHERE rowid = ?');
  for (const row of rows) {
    deleteVector.run(BigInt(row.id));
  }
  db.prepare(`DELETE FROM embedding_chunks WHERE thread_pk IN (${placeholders})`).run(...threadPks);
}

/** Chunks still awaiting (or re-awaiting) an embedding, oldest first. */
export function listPendingChunks(db: Database.Database, limit: number): PendingEmbeddingChunk[] {
  return db
    .prepare(`
      SELECT id, thread_pk AS threadPk, chunk_no AS chunkNo, chunk_text AS chunkText, owner_did AS ownerDid, source
      FROM embedding_chunks
      WHERE status = 'pending'
      ORDER BY id ASC
      LIMIT ?
    `)
    .all(limit) as PendingEmbeddingChunk[];
}

export function pendingChunkCount(db: Database.Database): number {
  return (db.prepare("SELECT COUNT(*) AS count FROM embedding_chunks WHERE status = 'pending'").get() as { count: number }).count;
}

/**
 * Stores `vector` for `chunkId` and marks it embedded.
 *
 * `rowid` MUST be bound as a `BigInt`: sqlite-vec's `vec0` primary-key
 * binding is stricter than a normal table's and rejects a plain JS
 * `number` in some builds/environments with "Only integers are allows for
 * primary key values" — even though the value is a whole number. `chunkId`
 * itself stays a plain `number` everywhere else (it's also a normal
 * `INTEGER PRIMARY KEY` in `embedding_chunks`, which has no such quirk).
 */
export function storeEmbedding(db: Database.Database, chunkId: number, ownerDid: string, vector: number[]): void {
  const rowid = BigInt(chunkId);
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM vec_embeddings WHERE rowid = ?').run(rowid);
    db.prepare('INSERT INTO vec_embeddings (rowid, embedding, owner_did) VALUES (?, ?, ?)').run(rowid, new Float32Array(vector), ownerDid);
    db.prepare("UPDATE embedding_chunks SET status = 'embedded', last_error = NULL WHERE id = ?").run(chunkId);
  });
  transaction();
}

/** Leaves `chunkId` `pending` (so it's retried next sweep) and records why it failed. */
export function markChunkPendingWithError(db: Database.Database, chunkId: number, message: string): void {
  db.prepare("UPDATE embedding_chunks SET status = 'pending', last_error = ? WHERE id = ?").run(message, chunkId);
}

/**
 * KNN search over `owner_did`'s embeddings. `owner_did` is a `vec0`
 * partition key (see `migrateVectorSchema`), so this constraint prunes the
 * search to that DID's vectors before any distance calculation runs —
 * filtered by owner_did FIRST, not applied as a post-filter.
 */
export function searchSemantic(db: Database.Database, ownerDid: string, queryVector: number[], k: number): SemanticHit[] {
  return db
    .prepare(`
      SELECT
        ec.thread_pk AS threadPk,
        ec.chunk_text AS chunkText,
        ve.distance AS distance
      FROM vec_embeddings ve
      JOIN embedding_chunks ec ON ec.id = ve.rowid
      WHERE ve.owner_did = @ownerDid
        AND ve.embedding MATCH @queryVector
        AND k = @k
      ORDER BY ve.distance ASC
    `)
    .all({ ownerDid, queryVector: new Float32Array(queryVector), k }) as SemanticHit[];
}
