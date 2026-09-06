/**
 * Tests for apps/coffee/app/api/pages/route.ts
 *
 * Focus: the #2000 registry migration replaced a raw `relay.relay_config`
 * SELECT with `getNodeSelf()` (from @imajin/config). These tests exercise
 * both branches of `nodeSelf?.field ?? undefined` through the real POST
 * handler and the real (unmocked) `buildFairManifest`, so the resulting
 * `.fair` chain is asserted end-to-end rather than just unit-testing
 * `getNodeSelf()` in isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const findFirstMock = vi.fn();
  const returningMock = vi.fn();
  const valuesMock = vi.fn(() => ({ returning: returningMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  const requireAuthMock = vi.fn();
  const getNodeSelfMock = vi.fn();
  // Raw postgres client — only reached for the (unrelated) forest_config scope lookup.
  const sqlMock = vi.fn().mockResolvedValue([]);

  return { findFirstMock, returningMock, valuesMock, insertMock, requireAuthMock, getNodeSelfMock, sqlMock };
});

vi.mock('@imajin/logger', () => ({
  createLogger: vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() })),
}));

vi.mock('@/db', () => ({
  db: {
    query: { coffeePages: { findFirst: mocks.findFirstMock } },
    insert: mocks.insertMock,
  },
  coffeePages: {},
}));

vi.mock('@imajin/auth', () => ({
  requireAuth: mocks.requireAuthMock,
  resolveActingDid: (identity: { actingFor?: string; actingAs?: string | null; id: string }) =>
    identity.actingFor ?? identity.actingAs ?? identity.id,
}));

vi.mock('@imajin/db', () => ({
  getClient: () => mocks.sqlMock,
}));

vi.mock('@imajin/config', () => ({
  getNodeSelf: mocks.getNodeSelfMock,
}));

vi.mock('@/lib/utils', () => ({
  jsonResponse: (data: unknown, status = 200) => Response.json(data, { status }),
  errorResponse: (error: string, status = 400) => Response.json({ error }, { status }),
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
  return new Request('https://coffee.test/api/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
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
    mocks.returningMock.mockImplementation(async () => {
      const inserted = mocks.valuesMock.mock.calls.at(-1)?.[0];
      return [inserted];
    });
    mocks.requireAuthMock.mockResolvedValue({
      identity: { id: 'did:imajin:creator', actingAs: null },
    });
  });

  it('uses the registry-sourced fee config in the persisted .fair manifest', async () => {
    mocks.getNodeSelfMock.mockResolvedValue({
      did: 'did:imajin:jin',
      nodeOperatorDid: 'did:imajin:operator',
      nodeFeeBps: 80,
      buyerCreditBps: 30,
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect(mocks.getNodeSelfMock).toHaveBeenCalled();

    const body = await res.json();
    const chain = body.fairManifest.chain as Array<{ did: string; role: string; share: number }>;
    const nodeEntry = chain.find((e) => e.role === 'node');
    const buyerEntry = chain.find((e) => e.role === 'buyer_credit');
    expect(nodeEntry).toMatchObject({ did: 'did:imajin:operator', share: 0.008 });
    expect(buyerEntry).toMatchObject({ share: 0.003 });
  });

  it('falls back to .fair defaults when the registry is unavailable (getNodeSelf() → null)', async () => {
    mocks.getNodeSelfMock.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);

    const body = await res.json();
    const chain = body.fairManifest.chain as Array<{ did: string; role: string; share: number }>;
    const nodeEntry = chain.find((e) => e.role === 'node');
    // NODE_FEE_DEFAULT_BPS (50) and the placeholder DID from @imajin/fair's buildFairManifest.
    expect(nodeEntry).toMatchObject({ did: 'NODE_PLACEHOLDER', share: 0.005 });
  });
});
