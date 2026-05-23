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
