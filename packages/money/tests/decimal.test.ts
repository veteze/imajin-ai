import { describe, it, expect } from 'vitest';
import {
  parseDecimalToFraction,
  normalizeRational,
  multiplyRationals,
  divideRationals,
  invertRational,
  roundHalfEven,
  fractionToDecimalString,
  bigintToSafeNumber,
} from '../src/decimal';
import { InvalidDecimalStringError, MoneyOverflowError } from '../src/errors';

describe('parseDecimalToFraction', () => {
  it('parses whole numbers', () => {
    expect(parseDecimalToFraction('3')).toEqual({ numerator: 3n, denominator: 1n });
  });

  it('parses decimals exactly', () => {
    expect(parseDecimalToFraction('19.99')).toEqual({ numerator: 1999n, denominator: 100n });
  });

  it('parses negative decimals', () => {
    expect(parseDecimalToFraction('-0.5')).toEqual({ numerator: -1n, denominator: 2n });
  });

  it('reduces to lowest terms', () => {
    expect(parseDecimalToFraction('0.50')).toEqual({ numerator: 1n, denominator: 2n });
  });

  it('throws InvalidDecimalStringError for garbage input', () => {
    expect(() => parseDecimalToFraction('not-a-number')).toThrow(InvalidDecimalStringError);
    expect(() => parseDecimalToFraction('1.2.3')).toThrow(InvalidDecimalStringError);
    expect(() => parseDecimalToFraction('')).toThrow(InvalidDecimalStringError);
  });
});

describe('normalizeRational', () => {
  it('moves a negative denominator sign to the numerator', () => {
    expect(normalizeRational({ numerator: 1n, denominator: -2n })).toEqual({ numerator: -1n, denominator: 2n });
  });

  it('throws on a zero denominator', () => {
    expect(() => normalizeRational({ numerator: 1n, denominator: 0n })).toThrow(RangeError);
  });
});

describe('multiplyRationals / divideRationals / invertRational', () => {
  it('multiplies two fractions', () => {
    expect(multiplyRationals({ numerator: 1n, denominator: 2n }, { numerator: 2n, denominator: 3n }))
      .toEqual({ numerator: 1n, denominator: 3n });
  });

  it('divides two fractions', () => {
    expect(divideRationals({ numerator: 1n, denominator: 2n }, { numerator: 1n, denominator: 4n }))
      .toEqual({ numerator: 2n, denominator: 1n });
  });

  it('inverts a fraction', () => {
    expect(invertRational({ numerator: 3n, denominator: 4n })).toEqual({ numerator: 4n, denominator: 3n });
  });

  it('throws dividing/inverting by zero', () => {
    expect(() => divideRationals({ numerator: 1n, denominator: 2n }, { numerator: 0n, denominator: 5n })).toThrow(RangeError);
    expect(() => invertRational({ numerator: 0n, denominator: 5n })).toThrow(RangeError);
  });
});

describe('roundHalfEven', () => {
  it('rounds below the halfway point down', () => {
    expect(roundHalfEven(9n, 4n)).toBe(2n); // 2.25 -> 2
  });

  it('rounds an exact tie to the nearest even neighbour', () => {
    expect(roundHalfEven(5n, 2n)).toBe(2n); // 2.5 -> 2 (even)
    expect(roundHalfEven(15n, 2n)).toBe(8n); // 7.5 -> 8 (even)
    expect(roundHalfEven(-5n, 2n)).toBe(-2n); // -2.5 -> -2 (even)
  });

  it('rounds non-ties to the nearest integer regardless of parity', () => {
    expect(roundHalfEven(7n, 2n)).toBe(4n); // 3.5 -> tie -> 4 (even)
    expect(roundHalfEven(9n, 4n)).toBe(2n); // 2.25 -> 2
    expect(roundHalfEven(11n, 4n)).toBe(3n); // 2.75 -> 3
  });

  it('throws on a zero denominator', () => {
    expect(() => roundHalfEven(1n, 0n)).toThrow(RangeError);
  });
});

describe('fractionToDecimalString', () => {
  it('renders a simple fraction at the given precision', () => {
    expect(fractionToDecimalString({ numerator: 1999n, denominator: 100n }, 2)).toBe('19.99');
  });

  it('renders zero decimal places', () => {
    expect(fractionToDecimalString({ numerator: 1500n, denominator: 1n }, 0)).toBe('1500');
  });

  it('renders negative values', () => {
    expect(fractionToDecimalString({ numerator: -1999n, denominator: 100n }, 2)).toBe('-19.99');
  });

  it('banker rounds when the target precision truncates the value', () => {
    // 1/8 = 0.125 at 2dp is an exact tie between 0.12 and 0.13 -> even (0.12)
    expect(fractionToDecimalString({ numerator: 1n, denominator: 8n }, 2)).toBe('0.12');
  });
});

describe('bigintToSafeNumber', () => {
  it('converts an in-range bigint', () => {
    expect(bigintToSafeNumber(1999n, 'test')).toBe(1999);
  });

  it('throws MoneyOverflowError outside the safe integer range', () => {
    const tooBig = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(() => bigintToSafeNumber(tooBig, 'test')).toThrow(MoneyOverflowError);
    const tooSmall = BigInt(Number.MIN_SAFE_INTEGER) - 1n;
    expect(() => bigintToSafeNumber(tooSmall, 'test')).toThrow(MoneyOverflowError);
  });
});
