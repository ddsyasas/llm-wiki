import { estimateCostCents } from "@llm-wiki/llm";

import type { Db } from "./db";
import { OPERATIONS, type Operation, type UsageInsert, type UsageRow } from "./types";

type UsageRowDb = {
  id: number;
  operation: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number | null;
  created_at: string;
};

function rowFromDb(r: UsageRowDb): UsageRow {
  if (!OPERATIONS.includes(r.operation as Operation)) {
    throw new Error(`usage.${r.id}: unknown operation in DB: ${r.operation}`);
  }
  return { ...r, operation: r.operation as Operation };
}

export function insertUsage(db: Db, entry: UsageInsert): number {
  const info = db
    .prepare(
      `INSERT INTO usage (operation, model, input_tokens, output_tokens, cost_cents, created_at)
       VALUES (@operation, @model, @input_tokens, @output_tokens, @cost_cents, @created_at)`,
    )
    .run(entry);
  return info.lastInsertRowid as number;
}

export function listUsageRows(db: Db, limit = 100): UsageRow[] {
  const rows = db
    .prepare(`SELECT * FROM usage ORDER BY id DESC LIMIT ?`)
    .all(limit) as UsageRowDb[];
  return rows.map(rowFromDb);
}

/**
 * Backfill cost_cents for any usage rows missing it. Cheap and idempotent:
 * picks up only rows with NULL cost (caps at one pricing-table lookup
 * each), so safe to call on every DB open. Exists because pre-2026-05-24
 * builds hard-coded `cost_cents: null` at every insertUsage site — once
 * those were fixed, this backfills the historical rows so the dashboard
 * cumulative reflects real spend instead of just spend since the fix.
 *
 * Rows whose model isn't in the pricing table stay NULL (estimateCostCents
 * returns null), so a future pricing-table update can re-run the backfill
 * and pick them up too.
 */
export function backfillUsageCosts(db: Db): number {
  const rows = db
    .prepare(
      `SELECT id, model, input_tokens, output_tokens FROM usage WHERE cost_cents IS NULL`,
    )
    .all() as Array<{ id: number; model: string; input_tokens: number; output_tokens: number }>;
  if (rows.length === 0) return 0;
  const update = db.prepare(`UPDATE usage SET cost_cents = ? WHERE id = ?`);
  let updated = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const cents = estimateCostCents(r.model, r.input_tokens, r.output_tokens);
      if (cents === null) continue;
      update.run(cents, r.id);
      updated++;
    }
  });
  tx();
  return updated;
}

export function getTotalCostCents(db: Db): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(cost_cents), 0) AS total FROM usage`)
    .get() as { total: number };
  return row.total;
}

export type UsageBreakdownRow = {
  model: string;
  operation: Operation;
  call_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_cents: number;
};

/**
 * Aggregates usage by (model, operation) for the Costs tab. Returns rows
 * sorted by total token count descending so the heaviest hitters surface
 * first. cost_cents is rolled up as a sum but is null when no row had
 * pricing data.
 */
export function getUsageBreakdown(db: Db): UsageBreakdownRow[] {
  const rows = db
    .prepare(
      `SELECT model,
              operation,
              COUNT(*) AS call_count,
              COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
              COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
              COALESCE(SUM(cost_cents), 0) AS total_cost_cents
         FROM usage
        GROUP BY model, operation
        ORDER BY (total_input_tokens + total_output_tokens) DESC`,
    )
    .all() as Array<{
    model: string;
    operation: string;
    call_count: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_cents: number;
  }>;
  return rows.map((r) => {
    if (!OPERATIONS.includes(r.operation as Operation)) {
      throw new Error(`usage breakdown: unknown operation ${r.operation}`);
    }
    return { ...r, operation: r.operation as Operation };
  });
}
