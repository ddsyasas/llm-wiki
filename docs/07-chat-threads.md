# 07 Chat Threads

## What chats are in this system

Chats are persistent conversations against the wiki. Each chat is a markdown file in `chats/`. Folders are real directories. A chat can be opened, continued, archived, deleted, or promoted into a permanent wiki page.

The distinction from one-off queries: chats persist across sessions and accumulate context across many turns. The query mode is for "ask once and move on."

## File format

One file per chat. Filename: `YYYY-MM-DD-HHMM-{slug}.md`.

```markdown
---
id: 0193abc12345
title: Comparing error correction codes
folder: deep-dives
created: 2026-05-23T14:30:00Z
updated: 2026-05-23T15:12:00Z
model: anthropic/claude-3-5-sonnet
pinned: false
message_count: 6
tags: [quantum, error-correction]
---

## user [14:30:00]
What error correction schemes are mentioned in my sources?

## assistant [14:30:15]
Three are referenced in the wiki: [[surface-codes]] (Shor 1995), [[stabilizer-codes]] (Gottesman thesis), and [[topological-codes]] (Kitaev 2003).

Each has tradeoffs. [[surface-codes]] are the most studied and have the most experimental progress...

## user [14:35:00]
Can you compare them in a table?

## assistant [14:35:45]
| Code type | Threshold | Overhead | Experimental progress |
|-----------|-----------|----------|----------------------|
| [[surface-codes]] | ~1% | High | Most |
| [[stabilizer-codes]] | varies | Medium | Moderate |
| [[topological-codes]] | ~1% (theoretical) | Lower | Early |

The thresholds and overheads are approximate; see [[error-correction-thresholds]] for the latest measurements.

## user [14:40:00]
Promote the comparison to a wiki page.

## assistant [14:40:30]
Done. Created [[error-correction-codes-comparison]] with the table and context. Linked from [[error-correction-thresholds]] and from each individual code page.
```

## Folder organization

Folders are filesystem directories under `chats/`. Default folders created on first launch:

```
chats/
├── inbox/       # default for new chats
├── pinned/      # convention for important chats
└── archive/     # convention for older chats
```

The user can create any folder by typing a folder name in the move dialog. Nested folders are allowed but discouraged in V1 (one level deep only).

A chat is in whatever folder it physically lives in. Moving = `fs.rename`. No abstraction.

## Operations

### Create a chat

User clicks "New chat" or starts typing in the chat composer. We:

1. Generate a UUID and timestamp-based filename
2. Create file in `chats/inbox/` with empty messages array
3. Insert row in `chats` SQLite table
4. Navigate to the chat view

### Send a message

1. Append `## user [HH:MM:SS]` block and message text to the file
2. Build context for the LLM:
   - System prompt: "You are answering questions in a persistent chat thread against an LLM wiki. The user has access to the full wiki content. Cite pages with [[slug]]. Reference earlier messages when relevant."
   - Wiki index
   - Relevant pages (top K based on the latest user message)
   - Full chat history (truncate older messages if context limit approaches)
3. Stream the response, writing to a buffer
4. Append `## assistant [HH:MM:SS]` block with the response to the file
5. Update `updated` timestamp and `message_count` in SQLite

### Rename a chat

1. Update `title` in frontmatter (file content)
2. Update `title` in SQLite
3. Filename stays the same (we keep timestamp-based filenames for sort stability)

### Move a chat to another folder

1. `fs.rename` the file from `chats/{old}/file.md` to `chats/{new}/file.md`
2. Update `folder` in frontmatter
3. Update `folder` in SQLite

### Pin a chat

Set `pinned: true` in frontmatter. Update SQLite. Pinned chats sort to the top of their folder.

### Delete a chat

Move file to `.llm-wiki/trash/chats/`. Delete row from SQLite. Trash is purged after 30 days (background task on startup).

### Promote an assistant message to a wiki page

This is the feature that makes chats valuable for knowledge accumulation. User clicks "Save as wiki page" on any assistant message. We:

1. Show a modal: "Create a wiki page from this answer?"
2. Pre-fill: title, slug, type (let user pick), tags
3. On confirm: extract the message text, write to `wiki/{slug}.md`, update index, update SQLite
4. Add a small "→ saved to [[slug]]" annotation in the chat file after the promoted message

### Ingest the whole chat as a source

For a chat that contains a lot of useful synthesis, the user can ingest the entire chat as a source. This runs the same ingest pipeline as for a PDF or article:

- The chat file is treated as the source
- The LLM extracts entities, concepts, decisions discussed
- Creates and updates wiki pages
- The chat stays where it was; ingestion is non-destructive

## UI views

### Chat list (sidebar or dedicated view)

```
[+ New chat]                                    [search]

PINNED
  ★ Architecture decisions                      2 days ago
  ★ Open questions                              5 days ago

INBOX                                           [collapse ▼]
  ◯ Error correction comparison                 1h ago
  ◯ Shor vs Grover                              3h ago

DEEP DIVES                                      [collapse ▼]
  ◯ Quantum supremacy claim review              yesterday
  ...

ARCHIVE                                         [collapse ▶]
```

Each entry shows: pinned star, title, last-updated relative time. Right-click or hover for menu (rename, move, archive, delete, pin).

### Chat view

**Asymmetric Claude-style layout** (shipped 2026-05-24, commit `087a51a`). User messages render as right-aligned bubbles (`max-w-[80%]`, filled `bg-primary/10`, rounded with a squared top-right corner). Assistant messages flow left-aligned at `max-w-[92%]` with no bubble — long cited answers, tables, and code blocks need width to breathe, so we don't constrain them. Position alone tells you who said what; role badges dropped.

Messages render as markdown with `[[wikilinks]]` clickable. Composer at the bottom. Header shows the chat title (editable inline), folder dropdown for moving, Pin / Ingest → wiki / Delete actions, and the model the chat uses (set on creation, stored in frontmatter).

Each assistant message has a small action row beneath: **Save as wiki page** (opens the promote dialog) plus the timestamp. Whole-chat **Ingest → wiki** lives in the header so a useful thread can be filed back into the permanent wiki layer with one click — per Karpathy's *"good answers can be filed back into the wiki as new pages"*.

## Context window management

Chats can grow long. Strategy:

- Always include: system prompt, wiki index, top-K relevant pages
- Include all messages until we hit 70% of model context
- If we go over: keep the most recent 10 turns verbatim, summarize earlier messages into a compressed system note
- Show the user a banner when summarization kicks in

## Search across chats

Use SQLite FTS5 on chat content. Index every message body. Allow filters: by folder, by date range, by model used. Click a result to open the chat at that message.

## What chats are NOT in V1

- No multi-user chats (single user only)
- No real-time collaboration
- No voice or audio messages
- No chat templates
- No automatic chat naming (user names their own; we generate a default from the first user message)
- No embeddings-based "related chats" feature
- No chat folder sharing or export (the files are markdown, user can copy them manually)
