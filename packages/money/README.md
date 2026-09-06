# @imajin/money

Currency-safe `Money` primitive, signed FX snapshots, and an ECB rate
cache-through. Built for #1950 (D1/D2 of the COGS epic, #1075).

## What this is

- **`Money`** — `{ amount: number, currency: string }`, `amount` always an
  integer number of minor units (e.g. cents). `add`, `subtract`, `multiply`,
  `equals`, `fromDecimalString`, `toDecimalString`, `format`. Every
  arithmetic function does its actual computation in `bigint` and only
  converts back to a plain `number` after confirming the result is still an
  exact safe integer — see `src/money.ts` for why `amount` stays a `number`
  rather than a `bigint` field. Mixing currencies throws
  `CurrencyMismatchError`.
- **`FxSnapshot`** — `{ base, quote, rate, source, asOf }`, `rate` always a
  decimal string. `signFxSnapshot` / `verifyFxSnapshot` sign it with the same
  Ed25519 primitives (`canonicalize` + `crypto.sign`/`crypto.verify`) every
  other signed record in this codebase uses — proof of *which* rate a
  conversion relied on.
- **`convert(money, snapshot)`** — banker's-rounded (round-half-to-even)
  conversion to the quote currency's minor units.
- **`triangulate(eurToBase, eurToQuote)`** — derives a `base`->`quote`
  snapshot from two EUR-base snapshots, since ECB only publishes EUR-base
  rates (e.g. USD->CAD is always triangulated through EUR).
- **ECB daily reference rate fetcher/parser** (`fetchEcbDailyRates`,
  `parseEcbDailyXml`) and **`getRate(base, quote, date, db)`**, a
  table-first, ECB-fetch-on-miss cache-through backed by the
  `money.fx_rates` table (`migrations/0126_money_fx_rates.sql`).

## What this is not

- **Not a pricing table.** `resource -> unit price` (what a token or API
  call costs) is #1150, a different concern entirely. This package only
  knows how to represent, move, and convert amounts of money that some
  other system already computed.
- **Not a general-purpose decimal/BigDecimal library.** The rational
  arithmetic in `src/decimal.ts` exists only to serve `Money`, `convert`,
  and the FX rate math above — it is not meant to be reached for directly
  outside this package.
- **Not a source of currency exchange rates for anything other than ECB's
  free EUR-base daily reference sheet.** There is no support for live
  market rates, spreads, or paid rate providers.
