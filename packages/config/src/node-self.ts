import { getServiceUrl } from './services';

/**
 * Minimal public node metadata returned by GET /registry/api/node/self.
 * Mirrors the subset of `relay.relay_config` the registry service exposes
 * publicly — never the private config (profile artifact JWS, etc).
 */
export interface NodeSelfInfo {
  /** This node's own DID (did:imajin:...). */
  did: string;
  /** DID of the human/entity operating this node, if configured. */
  nodeOperatorDid: string | null;
  /** Node fee, in basis points, applied to .fair settlements on this node. */
  nodeFeeBps: number | null;
  /** Buyer credit, in basis points, applied to .fair settlements on this node. */
  buyerCreditBps: number | null;
}

function registryBaseUrl(): string {
  if (process.env.REGISTRY_SERVICE_URL) return process.env.REGISTRY_SERVICE_URL;
  const mode = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
  return getServiceUrl('registry', mode) ?? 'http://localhost:3000';
}

/**
 * Fetch this node's public identity + .fair fee config from the registry
 * service (`GET /registry/api/node/self`, #2000).
 *
 * Replaces raw `relay.relay_config` SQL reads that were duplicated across
 * coffee, learn, events, and market (audit item 8 of #1983). Returns null on
 * any failure — network error, non-2xx response (e.g. 503 when the node
 * identity hasn't been bootstrapped yet) — so callers can fall back to
 * defaults exactly as they did when the raw SQL row was missing.
 */
export async function getNodeSelf(): Promise<NodeSelfInfo | null> {
  try {
    const res = await fetch(`${registryBaseUrl()}/registry/api/node/self`);
    if (!res.ok) return null;
    return (await res.json()) as NodeSelfInfo;
  } catch {
    return null;
  }
}
