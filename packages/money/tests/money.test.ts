import { describe, it, expect } from 'vitest';
import { add, subtract, multiply, equals, fromDecimalString, toDecimalString, format, type Money } from '../src/money';
import { CurrencyMismatchError, MoneyOverflowError } from '../src/errors';

function usd(amount: number): Money {
  return { amount, currency: 'USD' };
}

describe('add / subtract', () => {
  it('adds two amounts in the same currency', () => {
    expect(add(usd(150), usd(250))).toEqual(usd(400));
  });

  it('subtracts two amounts in the same currency', () => {
    expect(subtract(usd(400), usd(150))).toEqual(usd(250));
  });

  it('throws CurrencyMismatchError when adding different currencies', () => {
    expect(() => add(usd(100), { amount: 100, currency: 'EUR' })).toThrow(CurrencyMismatchError);
  });

  it('throws CurrencyMismatchError when subtracting different currencies', () => {
    expect(() => subtract(usd(100), { amount: 100, currency: 'EUR' })).toThrow(CurrencyMismatchError);
  });

  it('is associative: (a+b)+c === a+(b+c) for many random small amounts', () => {
    const amounts = Array.from({ length: 200 }, (_, i) => usd((i * 37) % 997));
    const [a, b, c] = [amounts[10], amounts[50], amounts[150]];
    expect(add(add(a, b), c)).toEqual(add(a, add(b, c)));
  });

  it('never drifts over many repeated additions (unlike float cents accumulation)', () => {
    let total = usd(0);
    for (let i = 0; i < 100_000; i++) {
      total = add(total, usd(1));
    }
    expect(total).toEqual(usd(100_000));
  });

  it('throws MoneyOverflowError when the sum exceeds Number.MAX_SAFE_INTEGER', () => {
    const huge = usd(Number.MAX_SAFE_INTEGER);
    expect(() => add(huge, usd(1))).toThrow(MoneyOverflowError);
  });
});

describe('multiply', () => {
  it('multiplies by a decimal-string rational factor exactly', () => {
    expect(multiply(usd(100), '0.15')).toEqual(usd(15));
  });

  it('multiplies by a bigint factor', () => {
    expect(multiply(usd(100), 3n)).toEqual(usd(300));
  });

  it('multiplies by an explicit Rational', () => {
    expect(multiply(usd(100), { numerator: 1n, denominator: 3n })).toEqual(usd(33)); // 33.33... -> banker's round to 33
  });

  it("banker's-rounds an exact tie down to the even result", () => {
    // 100 * 0.905 = 90.5 exactly -> ties to 90 (even), not 91.
    expect(multiply(usd(100), '0.905')).toEqual(usd(90));
  });
});

describe('equals', () => {
  it('is true for identical amount and currency', () => {
    expect(equals(usd(500), usd(500))).toBe(true);
  });

  it('is false for differing amount', () => {
    expect(equals(usd(500), usd(501))).toBe(false);
  });

  it('is false for differing currency', () => {
    expect(equals(usd(500), { amount: 500, currency: 'EUR' })).toBe(false);
  });
});

describe('fromDecimalString / toDecimalString', () => {
  it('round-trips a 2-decimal currency', () => {
    const money = fromDecimalString('19.99', 'USD');
    expect(money).toEqual(usd(1999));
    expect(toDecimalString(money)).toBe('19.99');
  });

  it('round-trips a 0-decimal currency (JPY)', () => {
    const money = fromDecimalString('1500', 'JPY');
    expect(money).toEqual({ amount: 1500, currency: 'JPY' });
    expect(toDecimalString(money)).toBe('1500');
  });

  it('round-trips a 3-decimal currency (KWD)', () => {
    const money = fromDecimalString('1.234', 'KWD');
    expect(money).toEqual({ amount: 1234, currency: 'KWD' });
    expect(toDecimalString(money)).toBe('1.234');
  });

  it("banker's-rounds over-precise input", () => {
    // 0.125 at 2dp is an exact tie -> even (0.12)
    expect(fromDecimalString('0.125', 'USD')).toEqual(usd(12));
  });
});

describe('format', () => {
  it('formats USD in en-US', () => {
    expect(format(usd(1999), 'en-US')).toBe('$19.99');
  });

  it('falls back to a plain rendering for a non-ISO currency code', () => {
    expect(format({ amount: 1999, currency: 'MJNX' }, 'en-US')).toBe('19.99 MJNX');
  });
});
