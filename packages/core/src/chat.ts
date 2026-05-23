import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";

import { chatComplete, type ChatMessage as LlmChatMessage, type LlmClient } from "@llm-wiki/llm";
import matter from "gray-matter";

import type { Db } from "./db";
import {
  deleteChat as deleteChatRow,
  getChat,
  insertChat,
  listChatRows,
  updateChat,
} from "./db-chats";
import { searchPages } from "./db-pages";
import { insertUsage } from "./db-usage";
import { buildChatSystemPrompt } from "./prompts/chat";
import type { ExistingPageSnippet } from "./prompts/ingest";
import type { ChatRow } from "./types";
import { readIndex, readPage, readSchema, WIKI_PATHS } from "./wiki";

export const DEFAULT_CHAT_FOLDERS = ["inbox", "pinned", "archive"] as const;
const TRASH_DIR = "trash/chats";
const TOP_K_RELEVANT_PAGES = 8;

// ---- file <-> structure --------------------------------------------------

export type ChatMessage = {
  role: "user" | "assistant";
  /** HH:MM:SS local time as written by the app. */
  time: string;
  content: string;
};

export type ChatFile = {
  row: ChatRow;
  messages: ChatMessage[];
};

function chatPath(wikiPath: string, folder: string, filename: string): string {
  return join(wikiPath, WIKI_PATHS.chats, folder, filename);
}

function nowFilenamePrefix(): { date: string; hhmm: string } {
  const d = new Date();
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hhmm: `${pad(d.getHours())}${pad(d.getMinutes())}`,
  };
}

function nowHms(): string {
  const d = new Date();
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

// ---- create --------------------------------------------------------------

export type CreateChatOptions = {
  folder?: string;
  title?: string;
  model: string;
  tags?: string[];
};

export async function createChat(
  wikiPath: string,
  db: Db,
  opts: CreateChatOptions,
): Promise<ChatRow> {
  const folder = opts.folder ?? "inbox";
  const title = (opts.title ?? "Untitled chat").trim() || "Untitled chat";
  const id = randomUUID();
  const { date, hhmm } = nowFilenamePrefix();
  const filename = `${date}-${hhmm}-${slugify(title)}.md`;
  const folderDir = join(wikiPath, WIKI_PATHS.chats, folder);
  await mkdir(folderDir, { recursive: true });

  const createdIso = new Date().toISOString();
  const frontmatter = {
    id,
    title,
    folder,
    created: createdIso,
    updated: createdIso,
    model: opts.model,
    pinned: false,
    message_count: 0,
    ...(opts.tags && opts.tags.length > 0 ? { tags: opts.tags } : {}),
  };
  const body = matter.stringify("", frontmatter as unknown as Record<string, unknown>);
  await writeFile(join(folderDir, filename), body, "utf8");

  const row: ChatRow = {
    id,
    filename,
    folder,
    title,
    created_at: createdIso,
    updated_at: createdIso,
    pinned: false,
    message_count: 0,
  };
  insertChat(db, row);
  return row;
}

// ---- read ----------------------------------------------------------------

export async function readChat(wikiPath: string, chatId: string, db: Db): Promise<ChatFile> {
  const row = getChat(db, chatId);
  if (!row) throw chatNotFound(chatId);
  const raw = await readFile(chatPath(wikiPath, row.folder, row.filename), "utf8");
  const parsed = matter(raw);
  const messages = parseMessages(parsed.content);
  return { row, messages };
}

const MESSAGE_HEADER_RE = /^##\s+(user|assistant)\s+\[(\d{2}:\d{2}:\d{2})\]\s*$/i;

function parseMessages(body: string): ChatMessage[] {
  const lines = body.split(/\r?\n/);
  const messages: ChatMessage[] = [];
  let current: ChatMessage | null = null;
  let buf: string[] = [];

  function flush() {
    if (current) {
      current.content = buf.join("\n").trim();
      messages.push(current);
    }
    buf = [];
    current = null;
  }

  for (const line of lines) {
    const match = line.match(MESSAGE_HEADER_RE);
    if (match) {
      flush();
      current = {
        role: match[1]!.toLowerCase() as ChatMessage["role"],
        time: match[2]!,
        content: "",
      };
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return messages;
}

// ---- append message ------------------------------------------------------

export async function appendMessage(
  wikiPath: string,
  db: Db,
  chatId: string,
  role: ChatMessage["role"],
  content: string,
): Promise<{ row: ChatRow; message: ChatMessage }> {
  const row = getChat(db, chatId);
  if (!row) throw chatNotFound(chatId);
  const filePath = chatPath(wikiPath, row.folder, row.filename);
  const raw = await readFile(filePath, "utf8");
  const parsed = matter(raw);

  const message: ChatMessage = { role, time: nowHms(), content: content.trim() };

  // Rebuild body: keep prior content, append a separator + new message block.
  const trimmedPrior = parsed.content.replace(/\s+$/u, "");
  const sep = trimmedPrior.length > 0 ? "\n\n" : "";
  const block = `## ${message.role} [${message.time}]\n${message.content}\n`;
  const newBody = `${trimmedPrior}${sep}${block}`;

  const updatedIso = new Date().toISOString();
  const newFrontmatter = {
    ...(parsed.data as Record<string, unknown>),
    updated: updatedIso,
    message_count: row.message_count + 1,
  };
  const out = matter.stringify(newBody, newFrontmatter);
  await writeFile(filePath, out, "utf8");

  const nextRow: ChatRow = {
    ...row,
    updated_at: updatedIso,
    message_count: row.message_count + 1,
  };
  updateChat(db, nextRow);
  return { row: nextRow, message };
}

// ---- rename / move / pin / delete ----------------------------------------

export async function renameChat(
  wikiPath: string,
  db: Db,
  chatId: string,
  newTitle: string,
): Promise<ChatRow> {
  const cleanTitle = newTitle.trim();
  if (!cleanTitle) throw new Error("renameChat: newTitle must be non-empty");
  const row = getChat(db, chatId);
  if (!row) throw chatNotFound(chatId);

  // Update frontmatter `title` only; we keep the timestamped filename for
  // stable sort order even after a rename.
  const filePath = chatPath(wikiPath, row.folder, row.filename);
  const raw = await readFile(filePath, "utf8");
  const parsed = matter(raw);
  const newFrontmatter = { ...(parsed.data as Record<string, unknown>), title: cleanTitle };
  await writeFile(filePath, matter.stringify(parsed.content, newFrontmatter), "utf8");

  const nextRow: ChatRow = { ...row, title: cleanTitle };
  updateChat(db, nextRow);
  return nextRow;
}

export async function moveChat(
  wikiPath: string,
  db: Db,
  chatId: string,
  newFolder: string,
): Promise<ChatRow> {
  const folder = newFolder.trim();
  if (!folder) throw new Error("moveChat: newFolder must be non-empty");
  const row = getChat(db, chatId);
  if (!row) throw chatNotFound(chatId);
  if (folder === row.folder) return row;

  const src = chatPath(wikiPath, row.folder, row.filename);
  const destDir = join(wikiPath, WIKI_PATHS.chats, folder);
  await mkdir(destDir, { recursive: true });
  const dest = join(destDir, row.filename);
  await rename(src, dest);

  // Update frontmatter `folder` to keep file + DB consistent.
  const raw = await readFile(dest, "utf8");
  const parsed = matter(raw);
  const newFrontmatter = { ...(parsed.data as Record<string, unknown>), folder };
  await writeFile(dest, matter.stringify(parsed.content, newFrontmatter), "utf8");

  const nextRow: ChatRow = { ...row, folder };
  updateChat(db, nextRow);
  return nextRow;
}

export async function pinChat(
  wikiPath: string,
  db: Db,
  chatId: string,
  pinned: boolean,
): Promise<ChatRow> {
  const row = getChat(db, chatId);
  if (!row) throw chatNotFound(chatId);
  const filePath = chatPath(wikiPath, row.folder, row.filename);
  const raw = await readFile(filePath, "utf8");
  const parsed = matter(raw);
  const newFrontmatter = { ...(parsed.data as Record<string, unknown>), pinned };
  await writeFile(filePath, matter.stringify(parsed.content, newFrontmatter), "utf8");

  const nextRow: ChatRow = { ...row, pinned };
  updateChat(db, nextRow);
  return nextRow;
}

export async function deleteChat(
  wikiPath: string,
  db: Db,
  chatId: string,
): Promise<{ trashedPath: string }> {
  const row = getChat(db, chatId);
  if (!row) throw chatNotFound(chatId);
  const src = chatPath(wikiPath, row.folder, row.filename);
  const trashDir = join(wikiPath, WIKI_PATHS.tooling, TRASH_DIR);
  await mkdir(trashDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(trashDir, `${stamp}-${basename(src)}`);
  await rename(src, dest);
  deleteChatRow(db, chatId);
  return { trashedPath: dest };
}

// ---- list folders --------------------------------------------------------

export async function listChatFolders(wikiPath: string): Promise<string[]> {
  const chatsDir = join(wikiPath, WIKI_PATHS.chats);
  try {
    const entries = await readdir(chatsDir, { withFileTypes: true });
    const fromDisk = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const set = new Set<string>([...DEFAULT_CHAT_FOLDERS, ...fromDisk]);
    return Array.from(set).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [...DEFAULT_CHAT_FOLDERS];
    throw err;
  }
}

// ---- LLM round-trip ------------------------------------------------------

export type SendChatMessageOptions = {
  wikiPath: string;
  db: Db;
  chatId: string;
  userMessage: string;
  client: LlmClient;
  /** Override the chat's saved model for this turn only. */
  modelOverride?: string;
};

export type SendChatMessageResult = {
  row: ChatRow;
  user: ChatMessage;
  assistant: ChatMessage;
  modelUsed: string;
};

export async function sendChatMessage(
  opts: SendChatMessageOptions,
): Promise<SendChatMessageResult> {
  const before = getChat(opts.db, opts.chatId);
  if (!before) throw chatNotFound(opts.chatId);
  const model = opts.modelOverride ?? (await readChatModel(opts.wikiPath, before));

  // 1. Persist the user's turn first so a mid-call failure doesn't lose their
  // input.
  const userAppend = await appendMessage(opts.wikiPath, opts.db, opts.chatId, "user", opts.userMessage);

  // 2. Build context. Re-read the chat to get the full message history.
  const chat = await readChat(opts.wikiPath, opts.chatId, opts.db);
  const [schema, index] = await Promise.all([
    readSchemaOrDefault(opts.wikiPath),
    readIndexOrDefault(opts.wikiPath),
  ]);
  const relevantPages = await loadRelevantPages(opts.wikiPath, opts.db, opts.userMessage);
  const system = buildChatSystemPrompt({ schema, index, relevantPages });

  const messages: LlmChatMessage[] = [
    { role: "system", content: system },
    ...chat.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // 3. LLM call.
  const result = await chatComplete({
    client: opts.client,
    model,
    messages,
  });

  insertUsage(opts.db, {
    operation: "chat",
    model: result.model,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cost_cents: null,
    created_at: new Date().toISOString(),
  });

  // 4. Persist assistant reply.
  const assistantAppend = await appendMessage(
    opts.wikiPath,
    opts.db,
    opts.chatId,
    "assistant",
    result.text,
  );

  return {
    row: assistantAppend.row,
    user: userAppend.message,
    assistant: assistantAppend.message,
    modelUsed: result.model,
  };
}

async function readChatModel(wikiPath: string, row: ChatRow): Promise<string> {
  // Per docs/07 the chat file frontmatter carries the model. Fall back to a
  // sensible default if the frontmatter is missing the field.
  try {
    const raw = await readFile(chatPath(wikiPath, row.folder, row.filename), "utf8");
    const data = matter(raw).data as { model?: string };
    if (typeof data.model === "string" && data.model.length > 0) return data.model;
  } catch {
    // fall through
  }
  return "anthropic/claude-3-5-sonnet";
}

async function readSchemaOrDefault(wikiPath: string): Promise<string> {
  try {
    return await readSchema(wikiPath);
  } catch {
    return "(no schema set yet)";
  }
}

async function readIndexOrDefault(wikiPath: string): Promise<string> {
  try {
    return await readIndex(wikiPath);
  } catch {
    return "(no index yet)";
  }
}

async function loadRelevantPages(
  wikiPath: string,
  db: Db,
  question: string,
): Promise<ExistingPageSnippet[]> {
  let hits: Array<{ slug: string; title: string }> = [];
  try {
    hits = searchPages(db, question, TOP_K_RELEVANT_PAGES);
  } catch {
    hits = [];
  }
  const out: ExistingPageSnippet[] = [];
  for (const hit of hits) {
    try {
      const page = await readPage(wikiPath, hit.slug);
      out.push({
        slug: page.slug,
        title: page.frontmatter.title,
        type: page.frontmatter.type,
        excerpt: page.content,
      });
    } catch {
      // skip
    }
  }
  return out;
}

// ---- listing -------------------------------------------------------------

export function listChats(db: Db, folder?: string): ChatRow[] {
  return listChatRows(db, folder);
}

// ---- trash maintenance ---------------------------------------------------

const DEFAULT_TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Removes files in .llm-wiki/trash/chats/ older than maxAgeMs. Tolerant of a
 * missing trash directory (returns 0). Returns the number of files deleted.
 */
export async function purgeOldTrash(
  wikiPath: string,
  maxAgeMs: number = DEFAULT_TRASH_TTL_MS,
): Promise<number> {
  const trashDir = join(wikiPath, WIKI_PATHS.tooling, TRASH_DIR);
  const { readdir, stat: statFs, unlink } = await import("node:fs/promises");
  let entries: string[];
  try {
    entries = await readdir(trashDir);
  } catch {
    return 0;
  }
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const name of entries) {
    const p = join(trashDir, name);
    try {
      const s = await statFs(p);
      if (s.isFile() && s.mtimeMs < cutoff) {
        await unlink(p);
        removed++;
      }
    } catch {
      // entry vanished between readdir and stat; skip
    }
  }
  return removed;
}

// ---- helpers -------------------------------------------------------------

class ChatNotFoundError extends Error {
  override readonly name = "ChatNotFoundError";
  readonly id: string;
  constructor(id: string) {
    super(`chat not found: ${id}`);
    this.id = id;
  }
}

function chatNotFound(id: string): ChatNotFoundError {
  return new ChatNotFoundError(id);
}

// re-export for callers
export { stat };
