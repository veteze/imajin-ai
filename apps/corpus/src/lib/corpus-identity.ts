/**
 * Corpus service identity (#1751, folded into #2021's "Ingestion
 * attestations" checklist item).
 *
 * The corpus service signs its own `IngestionAttestation`s (#1750) with a
 * service DID keypair distinct from the kernel's node identity — corpus
 * must never hold or derive the kernel's private key (see the module
 * comment on `middleware/access-claim.ts`), and symmetrically the kernel
 * never holds the corpus service's private key either. `CORPUS_DID` and
 * `CORPUS_DID_PRIVATE_KEY` are minted once via `scripts/bootstrap-corpus-identity.ts`
 * and set as env vars / vault secrets on the corpus process only.
 *
 * Absence is a soft-fail, not a startup error: a freshly-deployed corpus
 * service with no identity configured yet must still ingest and serve
 * search successfully, just without signed provenance. Every call site
 * downstream (`engine/index.ts`) treats a `null` identity as "skip
 * attestation for this batch," never as a reason to fail the request or
 * sign with a placeholder key.
 */
import { createLogger } from '@imajin/logger';

const log = createLogger('corpus');

export interface CorpusIdentity {
  did: string;
  privateKey: string;
}

let warnedMissingIdentity = false;

/**
 * Reads `CORPUS_DID`/`CORPUS_DID_PRIVATE_KEY` from the environment. Returns
 * `null` (after logging a one-time warning, not on every ingest) when
 * either is unset.
 */
export function loadCorpusIdentity(): CorpusIdentity | null {
  const did = process.env.CORPUS_DID;
  const privateKey = process.env.CORPUS_DID_PRIVATE_KEY;

  if (!did || !privateKey) {
    if (!warnedMissingIdentity) {
      warnedMissingIdentity = true;
      log.warn(
        {},
        'CORPUS_DID/CORPUS_DID_PRIVATE_KEY not configured — ingestion will proceed without signed attestations',
      );
    }
    return null;
  }

  return { did, privateKey };
}
