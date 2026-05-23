import type { Db } from "./db";
import type { ChatRow } from "./types";

type ChatRowDb = {
  id: string;
  filename: string;
  folder: string;
  title: string;
  created_at: string;
  updated_at: string;
  pinned: number;
  message_count: number;
};

function rowFromDb(r: ChatRowDb): ChatRow {
  return { ...r, pinned: r.pinned !== 0 };
}

function rowToDb(r: ChatRow): ChatRowDb {
  return { ...r, pinned: r.pinned ? 1 : 0 };
}

export function insertChat(db: Db, chat: ChatRow): void {
  db.prepare(
    `INSERT INTO chats (id, filename, folder, title, created_at, updated_at, pinned, message_count)
     VALUES (@id, @filename, @folder, @title, @created_at, @updated_at, @pinned, @message_count)`,
  ).run(rowToDb(chat));
}

export function updateChat(db: Db, chat: ChatRow): void {
  const info = db
    .prepare(
      `UPDATE chats
         SET filename = @filename,
             folder = @folder,
             title = @title,
             created_at = @created_at,
             updated_at = @updated_at,
             pinned = @pinned,
             message_count = @message_count
       WHERE id = @id`,
    )
    .run(rowToDb(chat));
  if (info.changes === 0) {
    throw new Error(`updateChat: no row with id '${chat.id}'`);
  }
}

export function getChat(db: Db, id: string): ChatRow | null {
  const row = db.prepare(`SELECT * FROM chats WHERE id = ?`).get(id) as ChatRowDb | undefined;
  return row ? rowFromDb(row) : null;
}

export function deleteChat(db: Db, id: string): void {
  db.prepare(`DELETE FROM chats WHERE id = ?`).run(id);
}

export function listChatRows(db: Db, folder?: string): ChatRow[] {
  const rows = folder
    ? (db
        .prepare(
          `SELECT * FROM chats WHERE folder = ? ORDER BY pinned DESC, updated_at DESC`,
        )
        .all(folder) as ChatRowDb[])
    : (db
        .prepare(`SELECT * FROM chats ORDER BY pinned DESC, updated_at DESC`)
        .all() as ChatRowDb[]);
  return rows.map(rowFromDb);
}
