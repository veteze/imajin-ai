import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const { mockGetNodeSelfInfo } = vi.hoisted(() => ({
  mockGetNodeSelfInfo: vi.fn(),
}));

vi.mock('@/src/lib/kernel/node-identity', () => ({
  getNodeSelfInfo: mockGetNodeSelfInfo,
}));

// ─── Subject under test ─────────────────────────────────────────────────────

import { GET } from '../route';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GET /registry/api/node/self — public node-DID lookup (#2000)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with the node DID and public config when configured', async () => {
    mockGetNodeSelfInfo.mockResolvedValue({
      did: 'did:imajin:jin',
      nodeOperatorDid: 'did:imajin:operator',
      nodeFeeBps: 50,
      buyerCreditBps: 25,
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.did).toBe('did:imajin:jin');
    expect(body.nodeOperatorDid).toBe('did:imajin:operator');
    expect(body.nodeFeeBps).toBe(50);
    expect(body.buyerCreditBps).toBe(25);
  });

  it('requires no authentication (no auth check before returning 200)', async () => {
    mockGetNodeSelfInfo.mockResolvedValue({
      did: 'did:imajin:jin',
      nodeOperatorDid: null,
      nodeFeeBps: null,
      buyerCreditBps: null,
    });

    // GET() takes no request/auth argument at all — the route has no
    // credential check to bypass, which is the contract under test.
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('sets a short public Cache-Control header', async () => {
    mockGetNodeSelfInfo.mockResolvedValue({
      did: 'did:imajin:jin',
      nodeOperatorDid: null,
      nodeFeeBps: null,
      buyerCreditBps: null,
    });

    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
  });

  it('returns 503 when the node DID is not configured', async () => {
    mockGetNodeSelfInfo.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Node identity not configured');
  });
});
