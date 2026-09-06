/**
 * Tests for apps/market/app/api/listings/route.ts (POST)
 *
 * See apps/coffee/app/api/pages/__tests__/route.test.ts for the rationale:
 * these exercise the getNodeSelf() → buildFairManifest() branches (#2000)
 * through the real POST handler and the real (unmocked) buildFairManifest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const returningMock = vi.fn();
  const valuesMock = vi.fn(() => ({ returning: returningMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  const requireAuthMock = vi.fn();
  const getSessionMock = vi.fn().mockResolvedValue(null);
  const getNodeSelfMock = vi.fn();
  const publishMock = vi.fn().mockResolvedValue(undefined);
  // Raw postgres client — only reached for the (unrelated) forest_config scope lookup.
  const sqlMock = vi.fn().mockResolvedValue([]);

  return { returningMock, valuesMock, insertMock, requireAuthMock, getSessionMock, getNodeSelfMock, publishMock, sqlMock };
});

vi.mock('@imajin/logger', () => ({
  createLogger: vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() })),
}));

vi.mock('@/db', () => ({
  db: { insert: mocks.insertMock },
  listings: {},
}));

vi.mock('@imajin/auth', () => ({
  requireAuth: mocks.requireAuthMock,
  getSession: mocks.getSessionMock,
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
  generateId: (prefix: string) => `${prefix}_test123`,
  jsonResponse: (data: unknown, status = 200) => Response.json(data, { status }),
  errorResponse: (error: string, status = 400) => Response.json({ error }, { status }),
}));

// buildFairManifest (@imajin/fair) is intentionally NOT mocked.

// ─── Subject ────────────────────────────────────────────────────────────────

import { POST } from '../route';
import { REGISTRY_NODE_SELF, expectRegistrySourcedShares, expectDefaultShares } from '../../../../../../packages/fair/src/test-helpers';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Parameters<typeof POST>[0] {
  return new Request('https://market.test/api/listings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

const VALID_BODY = {
  title: 'Vintage Chair',
  price: 5000,
  contactInfo: { email: 'seller@example.com' },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/listings (#2000: node config sourced via getNodeSelf())', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sqlMock.mockReset().mockResolvedValue([]);
    mocks.publishMock.mockResolvedValue(undefined);
    mocks.returningMock.mockImplementation(async () => {
      const inserted = mocks.valuesMock.mock.calls.at(-1)?.[0];
      return [inserted];
    });
    mocks.requireAuthMock.mockResolvedValue({
      identity: { id: 'did:imajin:seller', actingAs: null },
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
