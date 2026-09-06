/**
 * Typed errors for the corpus engine (#1921's sha-pinned snapshot queries).
 *
 * Kept separate from `types.ts` (data shapes) so `routes.ts` can `instanceof`
 * check against a stable, purpose-built error class instead of pattern
 * matching on a message string.
 */

/**
 * Thrown by `CorpusStore.searchAtRef` when `(source, ref)` has no recorded
 * snapshot manifest — i.e. no ingest has ever run against that ref. Mapped
 * to an HTTP 404 by `routes.ts`, never a silent fallback to HEAD.
 */
export class UnknownRefError extends Error {
  constructor(
    public readonly source: string,
    public readonly ref: string,
  ) {
    super(`No indexed snapshot for source "${source}" at ref "${ref}". Trigger ingest at this ref first.`);
    this.name = 'UnknownRefError';
  }
}

/**
 * Thrown by `PgxClient.embed`/`PgxClient.rerank` (#1601) whenever the PGX
 * (bge-m3 embedder / bge-reranker-v2-m3) can't be reached, times out, or
 * answers with a non-2xx status. Callers must treat this as fail-CLOSED:
 * catch it and degrade the caller's operation (e.g. hybrid search falls
 * back to BM25-only, ingest leaves chunks `pending` for retry) rather than
 * letting it surface as an unhandled rejection or a 500.
 */
export class PgxUnavailableError extends Error {
  constructor(
    public readonly endpoint: 'embed' | 'rerank',
    public readonly url: string,
    public readonly cause?: unknown,
  ) {
    super(`PGX ${endpoint} endpoint unreachable at "${url}": ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'PgxUnavailableError';
  }
}

/**
 * Thrown when `PgxClient.embed`/`PgxClient.rerank` is called but the
 * corresponding URL (`PGX_EMBED_URL`/`PGX_RERANK_URL`) was never configured.
 * Distinct from `PgxUnavailableError` (a reachability failure) so callers
 * can tell "not set up" apart from "set up but down" if they ever need to.
 * In practice both are handled the same way by search/ingest: fail closed.
 */
export class PgxNotConfiguredError extends Error {
  constructor(public readonly endpoint: 'embed' | 'rerank') {
    super(`PGX ${endpoint} endpoint is not configured (see .env.example).`);
    this.name = 'PgxNotConfiguredError';
  }
}

/**
 * Thrown by `CorpusEngine.getAttestation` when `id` has no matching row in
 * `did`'s corpus database — including when `id` exists under a *different*
 * DID's database, since each DID's ingestion attestations live in its own
 * SQLite file (#1750). Mapped to an HTTP 404 by `routes.ts`.
 */
export class AttestationNotFoundError extends Error {
  constructor(
    public readonly did: string,
    public readonly attestationId: string,
  ) {
    super(`No ingestion attestation "${attestationId}" found for did "${did}".`);
    this.name = 'AttestationNotFoundError';
  }
}
