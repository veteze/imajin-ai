/**
 * Exact rational arithmetic on `bigint`. Every decimal string this package
 * touches (FX rates, `Money.fromDecimalString`, tax/discount multipliers) is
 * parsed into an exact `numerator/denominator` pair here — never into a JS
 * `number` — so no operation in this package can introduce floating-point
 * drift. `roundHalfEven` is the single rounding primitive `Money.multiply`,
 * `Money.fromDecimalString`, `Money.toDecimalString`, and `convert` all
 * share, so every place this package rounds does it the same (banker's
 * rounding) way.
 */

import { InvalidDecimalStringError, MoneyOverflowError } from './errors';

export interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/** Parse a plain decimal string (e.g. "19.99", "-0.5", "3") into an exact fraction. */
export function parseDecimalToFraction(value: string): Rational {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) {
    throw new InvalidDecimalStringError(value);
  }
  const [, sign, whole, fraction = ''] = match;
  const numerator = BigInt(`${sign}${whole}${fraction}`);
  const denominator = 10n ** BigInt(fraction.length);
  return normalizeRational({ numerator, denominator });
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x === 0n ? 1n : x;
}

/** Reduce a fraction to lowest terms with a positive denominator. */
export function normalizeRational(r: Rational): Rational {
  if (r.denominator === 0n) {
    throw new RangeError('Rational denominator cannot be zero');
  }
  const sign = r.denominator < 0n ? -1n : 1n;
  const numerator = r.numerator * sign;
  const denominator = r.denominator * sign;
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function multiplyRationals(a: Rational, b: Rational): Rational {
  return normalizeRational({ numerator: a.numerator * b.numerator, denominator: a.denominator * b.denominator });
}

export function divideRationals(a: Rational, b: Rational): Rational {
  if (b.numerator === 0n) {
    throw new RangeError('Cannot divide by a zero-valued rational');
  }
  return normalizeRational({ numerator: a.numerator * b.denominator, denominator: a.denominator * b.numerator });
}

export function invertRational(r: Rational): Rational {
  if (r.numerator === 0n) {
    throw new RangeError('Cannot invert a zero-valued rational');
  }
  return normalizeRational({ numerator: r.denominator, denominator: r.numerator });
}

/**
 * Round `numerator/denominator` to the nearest integer using round-half-to-
 * even (banker's rounding): exact ties round to whichever neighbour is even,
 * rather than always up. This avoids the systematic upward bias plain
 * "round half up" introduces over many roundings (e.g. FX conversions across
 * a large ledger) and is the algorithm the issue calls for explicitly for
 * `convert`.
 */
export function roundHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new RangeError('Rational denominator cannot be zero');
  }
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const twiceRemainder = remainder * 2n;
  const roundsUp = twiceRemainder > d || (twiceRemainder === d && quotient % 2n === 1n);
  const rounded = roundsUp ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Render a fraction as a fixed-`precision`-decimal-place string, banker's-rounded. */
export function fractionToDecimalString(r: Rational, precision: number): string {
  const scale = 10n ** BigInt(precision);
  const scaledValue = roundHalfEven(r.numerator * scale, r.denominator);
  const negative = scaledValue < 0n;
  const digits = (negative ? -scaledValue : scaledValue).toString().padStart(precision + 1, '0');
  const wholePart = precision === 0 ? digits : digits.slice(0, -precision);
  const fractionPart = precision === 0 ? '' : digits.slice(-precision);
  const magnitude = fractionPart ? `${wholePart}.${fractionPart}` : wholePart;
  return negative ? `-${magnitude}` : magnitude;
}

/**
 * Convert a `bigint` to a `number`, throwing `MoneyOverflowError` rather
 * than silently losing precision once it falls outside the safe integer
 * range. Every arithmetic function that returns a `Money.amount` goes
 * through this.
 */
export function bigintToSafeNumber(value: bigint, context: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyOverflowError(`${context}: result ${value.toString()} exceeds Number.MAX_SAFE_INTEGER minor units`);
  }
  return Number(value);
}
