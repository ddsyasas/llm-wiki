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
