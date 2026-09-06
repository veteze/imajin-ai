import { NextResponse } from 'next/server';
import { getNodeSelfInfo } from '@/src/lib/kernel/node-identity';

// Reads relay.relay_config at request time (through node-identity.ts's own
// process-lifetime cache) — force-dynamic keeps Next.js from statically
// caching an empty/pre-bootstrap result at build time.
export const dynamic = 'force-dynamic';

/**
 * GET /registry/api/node/self (#2000)
 *
 * Public, unauthenticated lookup for this node's own DID plus the minimal
 * public node metadata that relay.relay_config already exposes (the fee bps
 * and operator DID used to build .fair manifests). Never returns private
 * config (profile artifact JWS, DB internals, etc).
 *
 * Replaces raw `relay.relay_config` SQL reads that were duplicated across
 * coffee, learn, events, and market (#1983 audit item 8).
 */
export async function GET() {
  const info = await getNodeSelfInfo();

  if (!info) {
    return NextResponse.json(
      { error: 'Node identity not configured' },
      { status: 503 }
    );
  }

  return NextResponse.json(info, {
    headers: {
      // Short cache — node identity/fee config changes rarely, but this
      // stays safely fresh across an admin config update.
      'Cache-Control': 'public, max-age=30',
    },
  });
}
