import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { parseEcbDailyXml, fetchEcbDailyRates, ECB_DAILY_URL } from '../src/ecb';
import { EcbParseError } from '../src/errors';

const FIXTURE_PATH = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/eurofxref-daily.xml');
const FIXTURE_XML = readFileSync(FIXTURE_PATH, 'utf8');

describe('parseEcbDailyXml', () => {
  it('parses the reference date and every currency rate from the fixture', () => {
    const result = parseEcbDailyXml(FIXTURE_XML);
    expect(result).toEqual({
      date: '2024-01-15',
      base: 'EUR',
      rates: {
        USD: '1.0864',
        JPY: '157.71',
        CAD: '1.4762',
        GBP: '0.85980',
        CHF: '0.9345',
      },
    });
  });

  it('throws EcbParseError when the date attribute is missing', () => {
    expect(() => parseEcbDailyXml('<Cube><Cube currency="USD" rate="1.0864"/></Cube>')).toThrow(EcbParseError);
  });

  it('throws EcbParseError when there are no rate entries', () => {
    expect(() => parseEcbDailyXml('<Cube time="2024-01-15"></Cube>')).toThrow(EcbParseError);
  });
});

describe('fetchEcbDailyRates', () => {
  it('fetches the daily URL and parses the response body (network never actually hit — fetch is injected)', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe(ECB_DAILY_URL);
      return new Response(FIXTURE_XML, { status: 200 });
    });

    const result = await fetchEcbDailyRates(fetchImpl as unknown as typeof fetch);
    expect(result.date).toBe('2024-01-15');
    expect(result.rates.USD).toBe('1.0864');
  });

  it('throws EcbParseError on a non-ok HTTP response', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }));
    await expect(fetchEcbDailyRates(fetchImpl as unknown as typeof fetch)).rejects.toThrow(EcbParseError);
  });
});
