/**
 * ISO-4217 minor-unit exponents. Most currencies use 2 decimal places
 * (100 minor units = 1 major unit); a handful of well-known exceptions use 0
 * or 3. This is not the full ISO-4217 table — it covers the currencies this
 * codebase actually deals with (COGS settlement/emission currencies) plus
 * every currency ECB publishes a EUR reference rate for, since `convert`
 * and `triangulate` need an exponent for both legs of any pair ECB can
 * produce. Unknown codes default to 2, the overwhelmingly common case.
 */

/** Currencies with zero decimal places (the minor unit IS the major unit). */
const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG',
  'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/** Currencies with three decimal places. */
const THREE_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  'BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND',
]);

/**
 * Number of decimal places between a currency's minor and major unit
 * (e.g. 2 for USD: 100 cents = $1.00). Defaults to 2 for any code this
 * table doesn't recognise, rather than throwing — `Money` accepts any
 * currency string (including non-ISO codes like fair's `MJNX`), and a
 * sensible default keeps arithmetic usable for those too.
 */
export function minorUnitExponent(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}
