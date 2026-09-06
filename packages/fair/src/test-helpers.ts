/**
 * Shared test fixtures/assertions for the #2000 registry migration.
 *
 * apps/coffee, apps/learn, apps/market, and apps/events each build a
 * `.fair` manifest (via `buildFairManifest`, exported alongside this file)
 * using node config sourced from `getNodeSelf()` (`@imajin/config`). Their
 * route-level tests all need to assert the same thing — that
 * `nodeSelf?.field ?? undefined` really flows into the manifest's
 * `node`/`buyer_credit` chain entries — against otherwise-unrelated app
 * packages. Centralizing the fixture + assertion here (deep-imported via a
 * relative path, not part of this package's public `index.ts`/npm surface)
 * keeps those four test suites from reading as near-identical copy-pasted
 * blocks.
 */
import { expect } from 'vitest';

export interface FairChainEntry {
  did: string;
  role: string;
  share: number;
}

/** A representative "node self" response as returned by a configured registry. */
export const REGISTRY_NODE_SELF = {
  did: 'did:imajin:jin',
  nodeOperatorDid: 'did:imajin:operator',
  nodeFeeBps: 80,
  buyerCreditBps: 30,
} as const;

export function findChainRole(chain: FairChainEntry[], role: string): FairChainEntry | undefined {
  return chain.find((entry) => entry.role === role);
}

/** Asserts a `.fair` chain reflects REGISTRY_NODE_SELF's fee config. */
export function expectRegistrySourcedShares(chain: FairChainEntry[]): void {
  expect(findChainRole(chain, 'node')).toMatchObject({ did: REGISTRY_NODE_SELF.nodeOperatorDid, share: 0.008 });
  expect(findChainRole(chain, 'buyer_credit')).toMatchObject({ share: 0.003 });
}

/** Asserts a `.fair` chain reflects buildFairManifest's built-in defaults (getNodeSelf() → null). */
export function expectDefaultShares(chain: FairChainEntry[]): void {
  expect(findChainRole(chain, 'node')).toMatchObject({ did: 'NODE_PLACEHOLDER', share: 0.005 });
}
