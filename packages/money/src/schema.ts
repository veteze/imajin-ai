/**
 * Drizzle mirror of `migrations/0126_money_fx_rates.sql`. This is a typed
 * reference for consumers, not the source of truth for the DDL — per this
 * repo's migration conventions (docs/MIGRATIONS.md), the plain-SQL file is
 * canonical and this must stay in sync with it by hand. `getRate` in
 * rates-cache.ts talks to the table via raw parameterized SQL rather than
 * this table object, precisely so it works against any caller's `db`
 * handle without requiring them to register this schema first.
 */

import { bigserial, date, numeric, pgSchema, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const moneySchema = pgSchema('money');

export const fxRates = moneySchema.table(
  'fx_rates',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    base: text('base').notNull(),
    quote: text('quote').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    rate: numeric('rate', { precision: 24, scale: 10 }).notNull(),
    source: text('source').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    baseQuoteDateUniq: uniqueIndex('uniq_money_fx_rates_base_quote_date').on(table.base, table.quote, table.date),
  }),
);

export type FxRate = typeof fxRates.$inferSelect;
export type NewFxRate = typeof fxRates.$inferInsert;
