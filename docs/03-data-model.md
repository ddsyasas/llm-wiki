# 03 Data Model

## Two storage layers

1. **The wiki folder** (user's chosen location): All content. Plain `.md` files plus raw source files. This is what the user owns.
2. **SQLite** (inside the wiki folder, in `.llm-wiki/`): Operational metadata only. Safe to delete; nothing important is lost.

## Wiki folder layout

When the user runs `llm-wiki start ~/research/quantum-computing`, the folder ends up looking like this:

```
~/research/quantum-computing/
├── CLAUDE.md                      # the schema, editable by user
├── index.md                       # auto-maintained catalog of pages
├── log.md                         # append-only event log
├── raw/                           # immutable source files
│   ├── 2026-04-15-shor-algorithm.pdf
│   ├── 2026-04-20-quantum-supremacy.html
│   ├── 2026-05-01-my-notes.md
│   └── ...
├── wiki/                          # LLM-maintained pages
│   ├── shors-algorithm.md
│   ├── peter-shor.md
│   ├── quantum-supremacy.md
│   ├── overview.md
│   └── ...
├── chats/                         # chat threads, organized by folders
│   ├── inbox/
│   │   └── 2026-05-23-1430-error-correction.md
│   ├── deep-dives/
│   │   └── 2026-05-22-shor-vs-grover.md
│   ├── archive/
│   └── ...
├── .llm-wiki/                     # tooling state (gitignore this)
│   ├── meta.sqlite                # SQLite metadata (regenerable)
│   ├── settings.json              # per-wiki settings (topic, model slots)
│   ├── page-history/              # backup before every page edit
│   ├── schema-history/            # backup before every CLAUDE.md save (last 10)
│   └── trash/                     # soft-deletes, auto-pruned after 30 days
│       ├── chats/                 # deleted chat threads
│       ├── wiki/                  # deleted wiki pages (Undo from /wiki banner)
│       └── raw/                   # deleted raw source files
└── .gitignore                     # auto-generated, ignores .llm-wiki/
```

## File format conventions

### Wiki pages (`wiki/*.md`)

Filename is the slug (kebab-case). Each page has frontmatter:

```markdown
---
title: Shor's Algorithm
slug: shors-algorithm
type: concept
created: 2026-04-15
updated: 2026-05-23
sources: [shor-1994-paper, my-notes]
tags: [quantum, algorithm, cryptography]
---

# Shor's Algorithm

A quantum algorithm for [[integer-factorization]] that runs in polynomial time.
Discovered by [[peter-shor]] in 1994 at [[bell-labs]].

## Significance

Breaks [[rsa-cryptography]] in principle. See [[post-quantum-cryptography]] for defenses.

> [!contradiction] Source X claims 1995, but Shor's actual paper is dated 1994.
```

Frontmatter `type` is one of: `entity`, `concept`, `source`, `comparison`, `overview`.

### Cross-link syntax

`[[slug]]` or `[[slug|Display Name]]`. The LLM uses these in page content. The UI renders them as clickable links. Broken links (slugs that don't exist) render as strikethrough so users can see gaps.

### Index file (`index.md`)

Auto-maintained. Structure:

```markdown
# Wiki Index

## Concepts
- [[shors-algorithm|Shor's Algorithm]]: quantum algorithm for factoring integers
- [[quantum-supremacy|Quantum Supremacy]]: ...

## Entities  
- [[peter-shor|Peter Shor]]: ...

## Sources
- [[shor-1994-paper|Shor (1994)]]: original paper introducing the algorithm

## Overviews
- [[overview|Wiki Overview]]: this wiki's high-level synthesis
```

Categories come from the `type` field on each page. Sort alphabetically within categories.

### Log file (`log.md`)

Append-only. Each entry uses a consistent prefix so `grep "^## \[" log.md` works:

```markdown
# Wiki Log

## [2026-05-23 14:30] ingest | Shor's 1994 paper
- created pages: shors-algorithm, peter-shor, integer-factorization
- updated pages: overview
- model: claude-3-5-sonnet

## [2026-05-23 14:45] query | how does shor's algorithm work?
- pages used: shors-algorithm, integer-factorization

## [2026-05-23 15:00] lint
- 2 issues found: 1 contradiction, 1 orphan page
```

### Chat threads (`chats/**/*.md`)

Filename format: `YYYY-MM-DD-HHMM-short-slug.md`

Each thread is one file with frontmatter and a series of messages:

```markdown
---
title: Error correction approaches
created: 2026-05-23T14:30:00Z
updated: 2026-05-23T15:12:00Z
folder: inbox
model: claude-3-5-sonnet
pinned: false
---

## user [14:30]
What error correction schemes are mentioned in my sources?

## assistant [14:30]
Three are referenced: [[surface-codes]] discussed in detail in the Shor 1995 paper, [[stabilizer-codes]] briefly mentioned in [[gottesman-thesis]], and...

## user [14:35]
Can you compare them?

## assistant [14:35]
...
```

Folders are real directories. Moving a chat to a different folder = moving the file. Pinned chats appear at the top of their folder.

### Raw sources (`raw/*`)

Original files, untouched. Filename format: `YYYY-MM-DD-short-slug.{ext}` for sortability. Original filename is preserved in SQLite.

## SQLite schema

Lives at `.llm-wiki/meta.sqlite`. Used for:
- Indexing for full-text search
- Tracking ingestion state
- Caching LLM responses for repeated queries
- Token usage stats

```sql
-- Sources catalog
CREATE TABLE sources (
  id TEXT PRIMARY KEY,           -- uuid
  filename TEXT NOT NULL,        -- on-disk filename in raw/
  original_name TEXT,            -- name as uploaded
  format TEXT NOT NULL,          -- 'pdf' | 'docx' | 'html' | 'md' | 'txt' | 'url' | 'image'
  size_bytes INTEGER NOT NULL,
  added_at TEXT NOT NULL,        -- ISO 8601
  ingested_at TEXT,              -- null if not yet ingested
  url TEXT,                      -- if originally from a URL
  title TEXT
);

-- Pages catalog (cached for fast UI lookups, source of truth is the files)
CREATE TABLE pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,            -- 'entity' | 'concept' | 'source' | 'comparison' | 'overview'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  tags TEXT                      -- json array
);

-- Full-text search on page content
CREATE VIRTUAL TABLE pages_fts USING fts5(
  slug UNINDEXED,
  title,
  content,
  tags
);

-- Many-to-many: which sources contributed to which pages
CREATE TABLE page_sources (
  page_slug TEXT NOT NULL,
  source_id TEXT NOT NULL,
  PRIMARY KEY (page_slug, source_id),
  FOREIGN KEY (page_slug) REFERENCES pages(slug) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

-- Chat threads catalog
CREATE TABLE chats (
  id TEXT PRIMARY KEY,           -- uuid
  filename TEXT NOT NULL,        -- path relative to chats/
  folder TEXT NOT NULL,          -- 'inbox', 'archive', etc.
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0
);

-- Token usage tracking
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,       -- 'ingest' | 'query' | 'lint' | 'chat'
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_cents REAL,
  created_at TEXT NOT NULL
);

-- Cache LLM responses by content hash
CREATE TABLE response_cache (
  hash TEXT PRIMARY KEY,         -- sha256 of (model + system + user)
  response TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0
);
```

## Sync strategy: files are source of truth

If the user edits a markdown file directly (in Obsidian, VS Code, vim), the next time the app starts or refreshes, it re-scans the wiki folder and updates SQLite. SQLite is a cache. Files are the source of truth.

Implementation:
- On startup: compare mtimes between files and SQLite, update SQLite for any mismatches
- Watch the wiki folder with `chokidar` while the app is running, sync changes live
- On every write through the app: update both files and SQLite atomically (file first, then DB)

## Settings file (`.llm-wiki/settings.json`)

Per-wiki preferences. Safe to commit (no secrets).

```json
{
  "version": 1,
  "topic": "Quantum Computing Research",
  "defaultModels": {
    "ingest": "anthropic/claude-3-5-haiku",
    "query": "anthropic/claude-3-5-sonnet",
    "lint": "anthropic/claude-3-5-sonnet",
    "vision": "anthropic/claude-3-5-sonnet"
  },
  "autoLintAfterIngest": false,
  "showCostEstimates": true
}
```

## Global config (`~/.llm-wiki/config.json`)

Cross-wiki user settings. NOT committed (contains the API key).

```json
{
  "version": 1,
  "openrouterKey": "sk-or-v1-...",
  "activeWiki": "/Users/yasas/research/quantum",
  "recentWikis": ["/Users/yasas/research/quantum", "/Users/yasas/personal"],
  "uiTheme": "auto"
}
```

For security, the API key should ideally live in the OS keychain (use `keytar` npm package) and only be written to disk as fallback.

The `activeWiki` field (added 2026-05-24, see [`docs/13-multi-wiki.md`](13-multi-wiki.md)) is what the in-app wiki switcher writes when the user picks a wiki. `apps/web/src/lib/server-wiki.ts` `resolveWikiPath()` consults it on every request, after the `LLM_WIKI_PATH` env override and before the `~/llm-wiki-default` fallback. Absent on first run.
