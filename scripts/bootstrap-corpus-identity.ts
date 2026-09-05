#!/usr/bin/env tsx
/**
 * Corpus service identity bootstrap (#1751, folded into #2021's "Ingestion
 * attestations" checklist item).
 *
 * Generates an Ed25519 keypair and derives a `did:imajin:*` DID for the
 * corpus service to sign its own ingestion attestations with
 * (apps/corpus/src/engine/attestation.ts). Modeled on
 * scripts/bootstrap-node-identity.ts, but deliberately does NOT write to the
 * kernel's Postgres database: unlike the kernel's node identity, the corpus
 * service's private key is custodied by the corpus service itself (an env
 * var), never by the kernel, and corpus has no database of its own to
 * register an `auth.identities` row in. This script only generates the
 * keypair and prints the two env vars an operator must set — no new crypto,
 * just `@imajin/auth`'s existing keypair primitives.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-corpus-identity.ts
 *
 * Then copy the printed values into apps/corpus/.env.local (dev) or the
 * corpus process's environment (prod):
 *   CORPUS_DID=...
 *   CORPUS_DID_PRIVATE_KEY=...
 *
 * Re-running this script mints a brand-new keypair/DID every time — it is
 * NOT idempotent like bootstrap-node-identity.ts, since there is no database
 * to check for an existing DID against. Running it twice and deploying both
 * outputs would just orphan the first DID's signed attestations without
 * invalidating them (a signature stays valid for whichever key made it).
 */
import { generateKeypair, createDID } from '../packages/auth/src/providers/keypair';

function main(): void {
  const keypair = generateKeypair();
  const did = createDID(keypair.publicKey);

  console.log('\nCorpus Service Identity Bootstrap (#1751)\n');
  console.log('Generated corpus DID:', did);
  console.log('\nSet these on the corpus service (apps/corpus/.env.local or process env):\n');
  console.log(`CORPUS_DID=${did}`);
  console.log(`CORPUS_DID_PRIVATE_KEY=${keypair.privateKey}`);
  console.log('\nKeep the private key secret — it is never sent to or held by the kernel.');
  console.log('If unset, the corpus service still ingests normally but skips signing attestations.\n');
}

main();
