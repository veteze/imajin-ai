/**
 * Tests for apps/market/app/api/listings/[id]/route.ts (PATCH)
 *
 * See apps/coffee/app/api/pages/__tests__/route.test.ts for the rationale:
 * these exercise the getNodeSelf() → buildFairManifest() branches (#2000)
 * through the real PATCH handler and the real (unmocked) buildFairManifest,
 * specifically the price-change path that recalculates the .fair manifest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const selectWhereMock = vi.fn();
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
  const selectMock = vi.fn(() => ({ from: selectFromMock }));

  const updateReturningMock = vi.fn();
  const updateWhereMock = vi.fn(() => ({ returning: updateReturningMock }));
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  const requireAuthMock = vi.fn();
  const getNodeSelfMock = vi.fn();
  const publishMock = vi.fn().mockResolvedValue(undefined);
  // Raw postgres client — only reached for the (unrelated) forest_config scope lookup.
  const sqlMock = vi.fn().mockResolvedValue([]);

  return {
    selectWhereMock, selectFromMock, selectMock,
    updateReturningMock, updateWhereMock, updateSetMock, updateMock,
    requireAuthMock, getNodeSelfMock, publishMock, sqlMock,
  };
});

vi.mock('@imajin/logger', () => ({
  createLogger: vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() })),
}));

vi.mock('@/db', () => ({
  db: { select: mocks.selectMock, update: mocks.updateMock },
  listings: { id: 'col_id' },
}));

vi.mock('@imajin/auth', () => ({
  requireAuth: mocks.requireAuthMock,
  getSession: vi.fn().mockResolvedValue(null),
  resolveActingDid: (identity: { actingFor?: string; actingAs?: string | null; id: string }) =>
    identity.actingFor ?? identity.actingAs ?? identity.id,
}));

vi.mock('@imajin/media', () => ({
  resolveMediaRef: (ref: string) => ref,
}));

vi.mock('@imajin/db', () => ({
  getClient: () => mocks.sqlMock,
}));

vi.mock('@imajin/config', () => ({
  getNodeSelf: mocks.getNodeSelfMock,
}));

vi.mock('@imajin/bus', () => ({
  publish: mocks.publishMock,
}));

vi.mock('@/lib/utils', () => ({
  jsonResponse: (data: unknown, status = 200) => Response.json(data, { status }),
  errorResponse: (error: string, status = 400) => Response.json({ error }, { status }),
}));

// buildFairManifest (@imajin/fair) is intentionally NOT mocked.

// ─── Subject ────────────────────────────────────────────────────────────────

import { PATCH } from '../route';
import { REGISTRY_NODE_SELF, expectRegistrySourcedShares, expectDefaultShares } from '../../../../../../../packages/fair/src/test-helpers';

// ─── Helpers ────────────────────────────────────────────────────────────────

const ROUTE_PARAMS = { params: Promise.resolve({ id: 'lst_1' }) };

function makeRequest(body: Record<string, unknown>): Parameters<typeof PATCH>[0] {
  return new Request('https://market.test/api/listings/lst_1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Parameters<typeof PATCH>[0];
}

const EXISTING_LISTING = {
  id: 'lst_1',
  sellerDid: 'did:imajin:seller',
  price: 3000,
  status: 'active',
  sellerTier: 'public_offplatform',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PATCH /api/listings/:id (#2000: node config sourced via getNodeSelf())', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sqlMock.mockReset().mockResolvedValue([]);
    mocks.publishMock.mockResolvedValue(undefined);
    mocks.selectWhereMock.mockReset().mockResolvedValue([EXISTING_LISTING]);
    mocks.updateReturningMock.mockImplementation(async () => {
      const setArg = mocks.updateSetMock.mock.calls.at(-1)?.[0];
      return [setArg];
    });
    mocks.requireAuthMock.mockResolvedValue({
      identity: { id: 'did:imajin:seller', actingAs: null },
    });
  });

  it('recalculates the .fair manifest with the registry-sourced fee config when price changes', async () => {
    mocks.getNodeSelfMock.mockResolvedValue(REGISTRY_NODE_SELF);

    const res = await PATCH(makeRequest({ price: 5000 }), ROUTE_PARAMS);
    expect(res.status).toBe(200);
    expect(mocks.getNodeSelfMock).toHaveBeenCalled();

    const body = await res.json();
    expectRegistrySourcedShares(body.fairManifest.chain);
  });

  it('falls back to .fair defaults when the registry is unavailable (getNodeSelf() → null)', async () => {
    mocks.getNodeSelfMock.mockResolvedValue(null);

    const res = await PATCH(makeRequest({ price: 5000 }), ROUTE_PARAMS);
    expect(res.status).toBe(200);

    const body = await res.json();
    expectDefaultShares(body.fairManifest.chain);
  });

  it('does not recalculate the .fair manifest (and does not call getNodeSelf) when price/tier/seller are unchanged', async () => {
    const res = await PATCH(makeRequest({ title: 'New title only' }), ROUTE_PARAMS);
    expect(res.status).toBe(200);
    expect(mocks.getNodeSelfMock).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.fairManifest).toBeUndefined();
  });
});
