import { CurrencyMismatchError, FxSnapshotMismatchError } from './errors';
import { minorUnitExponent } from './currency';
import type { Money } from './money';
import type { FxSnapshot } from './fx-snapshot';
import { bigintToSafeNumber, divideRationals, fractionToDecimalString, parseDecimalToFraction, roundHalfEven } from './decimal';

/** Convert `money` (must be in `snapshot.base`) to `snapshot.quote`, banker's-rounded to the quote's minor units. */
export function convert(money: Money, snapshot: FxSnapshot): Money {
  if (money.currency !== snapshot.base) {
    throw new CurrencyMismatchError(snapshot.base, money.currency);
  }

  const exponentDelta = minorUnitExponent(snapshot.quote) - minorUnitExponent(money.currency);
  const rate = parseDecimalToFraction(snapshot.rate);

  let numerator = BigInt(money.amount) * rate.numerator;
  let denominator = rate.denominator;
  if (exponentDelta >= 0) {
    numerator *= 10n ** BigInt(exponentDelta);
  } else {
    denominator *= 10n ** BigInt(-exponentDelta);
  }

  return { amount: bigintToSafeNumber(roundHalfEven(numerator, denominator), 'convert'), currency: snapshot.quote };
}

/**
 * Derive a `base` -> `quote` snapshot from two EUR-base snapshots (ECB only
 * publishes EUR-base reference rates, so e.g. USD->CAD is always computed
 * via EUR: `rate = (EUR->CAD) / (EUR->USD)`). Both inputs must share the
 * same `asOf` date — triangulating rates from two different days would
 * silently produce a rate that was never actually quoted anywhere.
 */
export function triangulate(eurToBase: FxSnapshot, eurToQuote: FxSnapshot): FxSnapshot {
  if (eurToBase.base !== 'EUR' || eurToQuote.base !== 'EUR') {
    throw new FxSnapshotMismatchError('triangulate requires two EUR-base snapshots');
  }
  if (eurToBase.asOf !== eurToQuote.asOf) {
    throw new FxSnapshotMismatchError(
      `triangulate requires matching asOf dates, got "${eurToBase.asOf}" and "${eurToQuote.asOf}"`,
    );
  }

  const derivedRate = divideRationals(parseDecimalToFraction(eurToQuote.rate), parseDecimalToFraction(eurToBase.rate));

  return {
    base: eurToBase.quote,
    quote: eurToQuote.quote,
    // 10 decimal places: comfortably more precision than any downstream
    // minor-unit conversion needs, while still round-tripping through
    // parseDecimalToFraction exactly.
    rate: fractionToDecimalString(derivedRate, 10),
    source: 'ecb:triangulated',
    asOf: eurToBase.asOf,
  };
}
