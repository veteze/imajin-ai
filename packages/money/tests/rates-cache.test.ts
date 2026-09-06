import { describe, it, expect, vi } from 'vitest';
import { getRate } from '../src/rates-cache';
import type { AnyDatabase } from '@imajin/db';
import type { EcbDailyRates } from '../src/ecb';

const DAILY: EcbDailyRates = {
  date: '2024-01-15',
  base: 'EUR',
  rates: { USD: '1.0864', CAD: '1.4762', JPY: '157.71' },
};

/** A minimal fake `AnyDatabase` that only implements the `.execute()` call `getRate` makes. */
function createFakeDb(selectRows: unknown[] = []) {
  const executedQueries: unknown[] = [];
  const execute = vi.fn(async (query: unknown) => {
    executedQueries.push(query);
    // The first call getRate makes is always the cache read; every
    // subsequent call is a write, whose return value getRate ignores.
    return executedQueries.length === 1 ? selectRows : [];
  });
  return { db: { execute } as unknown as AnyDatabase, executedQueries, execute };
}

describe('getRate', () => {
  it('returns a same-currency identity snapshot without touching the db or fetching', async () => {
    const { db, execute } = createFakeDb();
    const fetchRates = vi.fn(async () => DAILY);

    const result = await getRate('USD', 'USD', '2024-01-15', db, { fetchRates });

    expect(result).toEqual({ base: 'USD', quote: 'USD', rate: '1', source: 'identity', asOf: '2024-01-15' });
    expect(execute).not.toHaveBeenCalled();
    expect(fetchRates).not.toHaveBeenCalled();
  });

  it('returns the cached row and never calls fetchRates on a cache hit', async () => {
    const { db, execute } = createFakeDb([{ rate: '1.0864', source: 'ecb' }]);
    const fetchRates = vi.fn(async () => DAILY);

    const result = await getRate('EUR', 'USD', '2024-01-15', db, { fetchRates });

    expect(result).toEqual({ base: 'EUR', quote: 'USD', rate: '1.0864', source: 'ecb', asOf: '2024-01-15' });
    expect(execute).toHaveBeenCalledTimes(1); // read only, no write-back needed
    expect(fetchRates).not.toHaveBeenCalled();
  });

  it('fetches from ECB, derives a direct EUR-base rate, and writes it back on a cache miss', async () => {
    const { db, execute } = createFakeDb([]);
    const fetchRates = vi.fn(async () => DAILY);

    const result = await getRate('EUR', 'USD', '2024-01-15', db, { fetchRates });

    expect(result).toEqual({ base: 'EUR', quote: 'USD', rate: '1.0864', source: 'ecb', asOf: '2024-01-15' });
    expect(fetchRates).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2); // one read (miss) + one write-back
  });

  it('derives an inverted rate when quote is EUR', async () => {
    const { db } = createFakeDb([]);
    const fetchRates = vi.fn(async () => DAILY);

    const result = await getRate('USD', 'EUR', '2024-01-15', db, { fetchRates });

    expect(result.base).toBe('USD');
    expect(result.quote).toBe('EUR');
    expect(result.source).toBe('ecb');
    expect(Number(result.rate)).toBeCloseTo(1 / 1.0864, 8);
  });

  it('triangulates through EUR for a non-EUR pair on a cache miss', async () => {
    const { db } = createFakeDb([]);
    const fetchRates = vi.fn(async () => DAILY);

    const result = await getRate('USD', 'CAD', '2024-01-15', db, { fetchRates });

    expect(result.base).toBe('USD');
    expect(result.quote).toBe('CAD');
    expect(result.source).toBe('ecb:triangulated');
    expect(Number(result.rate)).toBeCloseTo(1.4762 / 1.0864, 8);
  });

  it('only ever calls fetchRates once per miss, regardless of how many legs triangulation needs', async () => {
    const { db } = createFakeDb([]);
    const fetchRates = vi.fn(async () => DAILY);

    await getRate('USD', 'CAD', '2024-01-15', db, { fetchRates });

    expect(fetchRates).toHaveBeenCalledTimes(1);
  });
});
