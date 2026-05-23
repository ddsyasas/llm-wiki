export { CORE_VERSION } from "./version";
export * from "./types";
export * from "./templates";
export * from "./wiki";
export * from "./db";
export * from "./db-pages";
export * from "./db-sources";
export { getChat, insertChat, updateChat, listChatRows } from "./db-chats";
export * from "./db-usage";
export * from "./db-sync";
// db-chats's bare CRUD names collide with chat.ts's high-level operations
// (deleteChat, getChat). Re-export only what callers need at the top level;
// internal modules import directly from "./db-chats" for the low-level row API.
// chat.ts wraps the rest and exposes them under the same names with richer
// behavior (file ops in addition to DB writes).
export * from "./sync";
export * from "./config";
export * from "./secrets";
export * from "./schema";
export * from "./prompts/ingest";
export * from "./prompts/query";
export * from "./prompts/chat";
export * from "./ingest";
export * from "./links";
export * from "./editor";
export * from "./query";
export * from "./chat";
export * from "./lint";
