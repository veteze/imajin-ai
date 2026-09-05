import { describe, it, expect } from 'vitest';
import { convert, triangulate } from '../src/convert';
import { CurrencyMismatchError, FxSnapshotMismatchError } from '../src/errors';
import type { FxSnapshot } from '../src/fx-snapshot';

describe('convert', () => {
  it('converts using the snapshot rate at the quote currency precision', () => {
    const snapshot: FxSnapshot = { base: 'EUR', quote: 'USD', rate: '1.0864', source: 'ecb', asOf: '2024-01-15' };
    // €100.00 -> $108.64
    expect(convert({ amount: 10000, currency: 'EUR' }, snapshot)).toEqual({ amount: 10864, currency: 'USD' });
  });

  it("banker's-rounds an exact tie down to the even minor unit", () => {
    const snapshot: FxSnapshot = { base: 'USD', quote: 'EUR', rate: '0.905', source: 'ecb', asOf: '2024-01-15' };
    // $1.00 * 0.905 = €0.905 exactly -> ties to 90 (even), not 91.
    expect(convert({ amount: 100, currency: 'USD' }, snapshot)).toEqual({ amount: 90, currency: 'EUR' });
  });

  it('handles a currency pair with differing minor-unit exponents (USD -> JPY)', () => {
    const snapshot: FxSnapshot = { base: 'USD', quote: 'JPY', rate: '157.71', source: 'ecb', asOf: '2024-01-15' };
    // $10.00 * 157.71 = 1577.1 JPY -> JPY has 0 decimals -> bankers round to 1577 (0.1 rounds down)
    expect(convert({ amount: 1000, currency: 'USD' }, snapshot)).toEqual({ amount: 1577, currency: 'JPY' });
  });

  it('throws CurrencyMismatchError when money.currency does not match snapshot.base', () => {
    const snapshot: FxSnapshot = { base: 'EUR', quote: 'USD', rate: '1.0864', source: 'ecb', asOf: '2024-01-15' };
    expect(() => convert({ amount: 100, currency: 'GBP' }, snapshot)).toThrow(CurrencyMismatchError);
  });
});

describe('triangulate', () => {
  it('derives a base->quote snapshot from two EUR-base snapshots', () => {
    const eurToUsd: FxSnapshot = { base: 'EUR', quote: 'USD', rate: '1.0864', source: 'ecb', asOf: '2024-01-15' };
    const eurToCad: FxSnapshot = { base: 'EUR', quote: 'CAD', rate: '1.4762', source: 'ecb', asOf: '2024-01-15' };

    const derived = triangulate(eurToUsd, eurToCad);

    expect(derived.base).toBe('USD');
    expect(derived.quote).toBe('CAD');
    expect(derived.source).toBe('ecb:triangulated');
    expect(derived.asOf).toBe('2024-01-15');
    expect(Number(derived.rate)).toBeCloseTo(1.4762 / 1.0864, 8);
  });

  it('throws FxSnapshotMismatchError when either snapshot is not EUR-base', () => {
    const eurToUsd: FxSnapshot = { base: 'EUR', quote: 'USD', rate: '1.0864', source: 'ecb', asOf: '2024-01-15' };
    const usdToCad: FxSnapshot = { base: 'USD', quote: 'CAD', rate: '1.36', source: 'ecb', asOf: '2024-01-15' };
    expect(() => triangulate(eurToUsd, usdToCad)).toThrow(FxSnapshotMismatchError);
  });

  it('throws FxSnapshotMismatchError when the two snapshots have different asOf dates', () => {
    const eurToUsd: FxSnapshot = { base: 'EUR', quote: 'USD', rate: '1.0864', source: 'ecb', asOf: '2024-01-15' };
    const eurToCad: FxSnapshot = { base: 'EUR', quote: 'CAD', rate: '1.4762', source: 'ecb', asOf: '2024-01-16' };
    expect(() => triangulate(eurToUsd, eurToCad)).toThrow(FxSnapshotMismatchError);
  });

  it('a triangulated snapshot converts money consistently with two direct conversions', () => {
    const eurToUsd: FxSnapshot = { base: 'EUR', quote: 'USD', rate: '1.0864', source: 'ecb', asOf: '2024-01-15' };
    const eurToCad: FxSnapshot = { base: 'EUR', quote: 'CAD', rate: '1.4762', source: 'ecb', asOf: '2024-01-15' };
    const usdToCad = triangulate(eurToUsd, eurToCad);

    const direct = convert({ amount: 10000, currency: 'USD' }, usdToCad); // $100.00 -> CAD
    // Cross-check against float math within a cent — the derived rate carries
    // 10 decimal places, so minor-unit rounding should land on the same cent.
    const expectedApprox = (10000 * (1.4762 / 1.0864)) / 100;
    expect(direct.currency).toBe('CAD');
    expect(direct.amount / 100).toBeCloseTo(expectedApprox, 2);
  });
});
