/**
 * Typed errors for `@imajin/money`. Every failure mode this package can hit
 * (mixed currencies, an amount too large to stay a safe JS integer, a
 * malformed decimal string, an ECB response that doesn't parse, a
 * triangulation input that doesn't line up) gets its own class rather than a
 * bare `Error`, so callers can `instanceof`-branch instead of string-matching
 * `.message`.
 */

export class CurrencyMismatchError extends Error {
  constructor(
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`Currency mismatch: expected ${expected}, got ${actual}`);
    this.name = 'CurrencyMismatchError';
  }
}

/**
 * Thrown when an arithmetic result can no longer be represented as a safe JS
 * integer number of minor units. `Money.amount` stays a plain `number` (see
 * money.ts for why), so this is the boundary check that keeps "no floats"
 * honest instead of silently overflowing into imprecise territory.
 */
export class MoneyOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyOverflowError';
  }
}

export class InvalidDecimalStringError extends Error {
  constructor(value: string) {
    super(`Invalid decimal string: "${value}"`);
    this.name = 'InvalidDecimalStringError';
  }
}

export class FxSnapshotMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FxSnapshotMismatchError';
  }
}

export class EcbParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EcbParseError';
  }
}
