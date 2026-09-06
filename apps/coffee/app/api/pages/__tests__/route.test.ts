/**
 * Tests for apps/coffee/app/api/pages/route.ts
 *
 * Focus: the #2000 registry migration replaced a raw `relay.relay_config`
 * SELECT with `getNodeSelf()` (from @imajin/config). These tests exercise
 * both branches of `nodeSelf?.field ?? undefined` through the real POST
 * handler and the real (unmocked) `buildFairManifest`, so the resulting
 * `.fair` chain is asserted end-to-end rather than just unit-testing
 * `getNodeSelf()` in isolation.
 *
 * Shared mock plumbing and .fair chain fixtures/assertions live in
 * packages/fair/src/test-helpers.ts — see that file for why.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  REGISTRY_NODE_SELF,
  expectRegistrySourcedShares,
  expectDefaultShares,
  silentLoggerFactory,
  resolveActingDidMock,
  jsonResponseMock,
  errorResponseMock,
  makeJsonRequest,
  echoLastInsertedValue,
} from '../../../../../../packages/fair/src/test-helpers';

// ─── Mocks ────────────────────────────────────────────────────────────────

// vi.hoisted() runs before regular imports are live, so its callback can
// only reference other vi.hoisted()/vi.mock() values — the shared
// createInsertChainMocks() helper is used elsewhere but not here.
const mocks = vi.hoisted(() => {
  const returningMock = vi.fn();
  const valuesMock = vi.fn(() => ({ returning: returningMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const findFirstMock = vi.fn();
  const requireAuthMock = vi.fn();
  const getNodeSelfMock = vi.fn();
  // Raw postgres client — only reached for the (unrelated) forest_config scope lookup.
  const sqlMock = vi.fn().mockResolvedValue([]);

  return { findFirstMock, returningMock, valuesMock, insertMock, requireAuthMock, getNodeSelfMock, sqlMock };
});

vi.mock('@imajin/logger', () => silentLoggerFactory());

vi.mock('@/db', () => ({
  db: {
    query: { coffeePages: { findFirst: mocks.findFirstMock } },
    insert: mocks.insertMock,
  },
  coffeePages: {},
}));

vi.mock('@imajin/auth', () => ({
  requireAuth: mocks.requireAuthMock,
  resolveActingDid: resolveActingDidMock,
}));

vi.mock('@imajin/db', () => ({
  getClient: () => mocks.sqlMock,
}));

vi.mock('@imajin/config', () => ({
  getNodeSelf: mocks.getNodeSelfMock,
}));

vi.mock('@/lib/utils', () => ({
  jsonResponse: jsonResponseMock,
  errorResponse: errorResponseMock,
  isValidHandle: (handle: string) => /^[a-z0-9_]{3,30}$/.test(handle),
  generateId: (prefix: string) => `${prefix}_test123`,
}));

// buildFairManifest (@imajin/fair) is intentionally NOT mocked — the whole
// point of these tests is to prove nodeSelf's fields really flow into the
// manifest the route persists.

// ─── Subject ────────────────────────────────────────────────────────────────

import { POST } from '../route';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Parameters<typeof POST>[0] {
  return makeJsonRequest('https://coffee.test/api/pages', 'POST', body) as Parameters<typeof POST>[0];
}

const VALID_BODY = {
  handle: 'creator_handle',
  title: 'My Coffee Page',
  paymentMethods: { stripe: { enabled: true } },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/pages (#2000: node config sourced via getNodeSelf())', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirstMock.mockReset().mockResolvedValue(undefined);
    mocks.sqlMock.mockReset().mockResolvedValue([]);
    mocks.returningMock.mockImplementation(echoLastInsertedValue(mocks.valuesMock));
    mocks.requireAuthMock.mockResolvedValue({
      identity: { id: 'did:imajin:creator', actingAs: null },
    });
  });

  it('uses the registry-sourced fee config in the persisted .fair manifest', async () => {
    mocks.getNodeSelfMock.mockResolvedValue(REGISTRY_NODE_SELF);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect(mocks.getNodeSelfMock).toHaveBeenCalled();

    const body = await res.json();
    expectRegistrySourcedShares(body.fairManifest.chain);
  });

  it('falls back to .fair defaults when the registry is unavailable (getNodeSelf() → null)', async () => {
    mocks.getNodeSelfMock.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);

    const body = await res.json();
    expectDefaultShares(body.fairManifest.chain);
  });
});
