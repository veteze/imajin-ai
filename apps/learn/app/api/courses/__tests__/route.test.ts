/**
 * Tests for apps/learn/app/api/courses/route.ts (POST)
 *
 * See apps/coffee/app/api/pages/__tests__/route.test.ts for the rationale:
 * these exercise the getNodeSelf() → buildFairManifest() branches (#2000)
 * through the real POST handler and the real (unmocked) buildFairManifest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const limitMock = vi.fn().mockResolvedValue([]);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const insertValuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  const requireHardDIDMock = vi.fn();
  const getNodeSelfMock = vi.fn();
  // Raw postgres client — only reached for the (unrelated) forest_config scope lookup.
  const sqlMock = vi.fn().mockResolvedValue([]);

  return { limitMock, whereMock, fromMock, selectMock, insertValuesMock, insertMock, requireHardDIDMock, getNodeSelfMock, sqlMock };
});

vi.mock('@/db', () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertMock,
  },
}));

vi.mock('@/db/schema', () => ({
  courses: { id: 'col_id', slug: 'col_slug' },
  modules: {},
  lessons: {},
}));

vi.mock('@imajin/auth', () => ({
  requireHardDID: mocks.requireHardDIDMock,
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
  generateId: (prefix: string) => `${prefix}_test123`,
  slugify: (text: string) => text.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  jsonResponse: (data: unknown, status = 200) => Response.json(data, { status }),
  errorResponse: (error: string, status = 400) => Response.json({ error }, { status }),
}));

// buildFairManifest (@imajin/fair) is intentionally NOT mocked.

// ─── Subject ────────────────────────────────────────────────────────────────

import { POST } from '../route';
import { REGISTRY_NODE_SELF, expectRegistrySourcedShares, expectDefaultShares } from '../../../../../../packages/fair/src/test-helpers';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Parameters<typeof POST>[0] {
  return new Request('https://learn.test/api/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

const VALID_BODY = { title: 'Intro to Testing' };

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/courses (#2000: node config sourced via getNodeSelf())', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limitMock.mockReset().mockResolvedValue([]);
    mocks.insertValuesMock.mockReset().mockResolvedValue(undefined);
    mocks.sqlMock.mockReset().mockResolvedValue([]);
    mocks.requireHardDIDMock.mockResolvedValue({
      identity: { id: 'did:imajin:creator', actingAs: null },
    });
  });

  it('uses the registry-sourced fee config in the persisted .fair manifest', async () => {
    mocks.getNodeSelfMock.mockResolvedValue(REGISTRY_NODE_SELF);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect(mocks.getNodeSelfMock).toHaveBeenCalled();

    const body = await res.json();
    expectRegistrySourcedShares(body.metadata.fair.chain);
  });

  it('falls back to .fair defaults when the registry is unavailable (getNodeSelf() → null)', async () => {
    mocks.getNodeSelfMock.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);

    const body = await res.json();
    expectDefaultShares(body.metadata.fair.chain);
  });
});
