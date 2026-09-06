/**
 * Tests for GET /notify/api/health.
 *
 * The `recentWsPushMisses` field exists to make an otherwise-silent WS push
 * miss (see `src/lib/notify/ws-push.ts`'s `pushNotificationToDid`) visible on
 * an existing health surface instead of only in per-instance logs — see the
 * 2026-09-05 incident writeup in docs/warp-notification-chain.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSelectWhere, logMock } = vi.hoisted(() => ({
  mockSelectWhere: vi.fn().mockResolvedValue([{ count: 0 }]),
  logMock: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/src/db', () => ({
  db: {
    select: vi.fn(() => ({ from: () => ({ where: mockSelectWhere }) })),
  },
  notifications: { createdAt: 'created_at', channelsSent: 'channels_sent' },
}));

vi.mock('drizzle-orm', () => ({
  count: () => ({ __fn: 'count' }),
  and: (...args: unknown[]) => ({ and: args }),
  gte: (...args: unknown[]) => ({ gte: args }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join('?'), values }),
}));

vi.mock('@imajin/config', () => ({
  corsHeaders: () => new Headers(),
  corsOptions: () => new Response(null, { status: 204 }),
}));

vi.mock('@imajin/logger', () => ({
  createLogger: () => logMock,
}));

import { GET } from '../route';

type RouteRequest = Parameters<typeof GET>[0];

function makeReq(): RouteRequest {
  return {} as unknown as RouteRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectWhere.mockResolvedValue([{ count: 0 }]);
});

describe('GET /notify/api/health', () => {
  it('still reports basic service health', async () => {
    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: 'ok', service: 'notify' });
  });

  it('surfaces the recent WS push miss count', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ count: 3 }]);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.recentWsPushMisses).toBe(3);
  });

  it('reports zero misses rather than omitting the field when there are none', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ count: 0 }]);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.recentWsPushMisses).toBe(0);
  });

  it('degrades to omitting the field, without failing the health check, when the count query throws', async () => {
    mockSelectWhere.mockRejectedValueOnce(new Error('connection refused'));

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: 'ok' });
    expect(body.recentWsPushMisses).toBeUndefined();
    expect(logMock.warn).toHaveBeenCalled();
  });
});
