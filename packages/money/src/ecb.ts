/**
 * ECB daily reference rates (free, no API key): a fixed, narrow XML format
 * that has been stable for years. Rather than pull in a general XML parsing
 * dependency for one well-known, tightly-scoped document shape, this reads
 * the two attributes it actually needs (the reference date and each
 * `currency`/`rate` pair) with two bounded, non-backtracking regexes and
 * fails loudly (`EcbParseError`) if the shape ever changes underneath it.
 */

import { EcbParseError } from './errors';

export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

export interface EcbDailyRates {
  /** The ECB reference date (YYYY-MM-DD) this sheet was published for. */
  readonly date: string;
  readonly base: 'EUR';
  /** EUR -> currency decimal-string rates, as published (never floats). */
  readonly rates: Readonly<Record<string, string>>;
}

const DATE_ATTRIBUTE_PATTERN = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/;
const RATE_ELEMENT_PATTERN = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"](\d+(?:\.\d+)?)['"]\s*\/>/g;

/** Parse the raw ECB `eurofxref-daily.xml` document into `{ date, rates }`. */
export function parseEcbDailyXml(xml: string): EcbDailyRates {
  const dateMatch = DATE_ATTRIBUTE_PATTERN.exec(xml);
  if (!dateMatch) {
    throw new EcbParseError('ECB daily XML is missing the reference date (<Cube time="...">)');
  }

  const rates: Record<string, string> = {};
  for (const match of xml.matchAll(RATE_ELEMENT_PATTERN)) {
    rates[match[1]] = match[2];
  }
  if (Object.keys(rates).length === 0) {
    throw new EcbParseError('ECB daily XML contains no currency rate entries');
  }

  return { date: dateMatch[1], base: 'EUR', rates };
}

export type FetchLike = typeof fetch;

/** Fetch and parse the live ECB daily reference rates. Never called in tests — inject `fetchImpl` to avoid network. */
export async function fetchEcbDailyRates(fetchImpl: FetchLike = fetch): Promise<EcbDailyRates> {
  const response = await fetchImpl(ECB_DAILY_URL);
  if (!response.ok) {
    throw new EcbParseError(`ECB daily rates fetch failed with HTTP status ${response.status}`);
  }
  return parseEcbDailyXml(await response.text());
}
