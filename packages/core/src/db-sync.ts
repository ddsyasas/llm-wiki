import type { Db } from "./db";
import type { SyncStateRow } from "./types";

export function getSyncState(db: Db, relPath: string): SyncStateRow | null {
  const row = db
    .prepare(`SELECT * FROM sync_state WHERE rel_path = ?`)
    .get(relPath) as SyncStateRow | undefined;
  return row ?? null;
}

export function upsertSyncState(db: Db, row: SyncStateRow): void {
  db.prepare(
    `INSERT INTO sync_state (rel_path, mtime_ms, size_bytes, synced_at)
     VALUES (@rel_path, @mtime_ms, @size_bytes, @synced_at)
     ON CONFLICT(rel_path) DO UPDATE SET
       mtime_ms = excluded.mtime_ms,
       size_bytes = excluded.size_bytes,
       synced_at = excluded.synced_at`,
  ).run(row);
}

export function deleteSyncState(db: Db, relPath: string): void {
  db.prepare(`DELETE FROM sync_state WHERE rel_path = ?`).run(relPath);
}

export function listSyncedPaths(db: Db, prefix?: string): string[] {
  const rows = prefix
    ? (db
        .prepare(`SELECT rel_path FROM sync_state WHERE rel_path LIKE ? ORDER BY rel_path`)
        .all(`${prefix}%`) as Array<{ rel_path: string }>)
    : (db
        .prepare(`SELECT rel_path FROM sync_state ORDER BY rel_path`)
        .all() as Array<{ rel_path: string }>);
  return rows.map((r) => r.rel_path);
}
