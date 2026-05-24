# 13 — Multi-Wiki Switcher

Status: **shipped** (2026-05-24). All phases complete.

---

## What we're building

A way to maintain several wikis (e.g. "Physics", "Machine Learning", "Personal KB") from one app install. Pick which one is "active" via a Settings tab — the entire app re-points to that wiki on the next request. Create a new wiki via an in-app wizard. No restart needed.

**One wiki active at a time.** To browse two side-by-side, open the existing CLI workflow in two terminals on two ports (no V1 work needed for that path). True URL-namespaced multi-tenancy (`/w/<id>/wiki`) is V2 — out of scope here.

---

## Why this is the right scope

Karpathy's pattern is explicitly **one wiki per topic** (`docs/01-vision.md`). The "Physics" and "ML" wikis should be separate corpora, not merged — the LLM uses the schema (`CLAUDE.md`) to stay on topic, and merging dilutes that. The current single-wiki-per-app constraint enforces this hygiene; we just need to make switching painless.

---

## Current chokepoint

Every server-side touchpoint resolves the wiki path through `apps/web/src/lib/server-wiki.ts`:

```ts
export function resolveWikiPath(): string {
  return process.env["LLM_WIKI_PATH"] ?? join(homedir(), "llm-wiki-default");
}
```

Hard-coded to env var or single default. To switch you currently have to restart the server with a different env. Everything downstream (`openWikiContext`, every API route, every server component) inherits whatever this returns.

The fix is right here: read the active wiki from the **global config file** (`~/.llm-wiki/config.json`) which already has a `recentWikis: []` field we built but never wired UI for. Add an `activeWiki?: string` field next to it; `resolveWikiPath()` consults that first. Every other piece of code keeps working unchanged.

---

## File plan

### New

| File | What |
|---|---|
| `apps/web/src/app/api/wikis/route.ts` | `GET` lists recents + active; `POST` (type=switch / type=create / type=remove) mutates |
| `apps/web/src/components/settings/wikis-tab.tsx` | List + switch + create + remove UI inside Settings |
| `docs/13-multi-wiki.md` | This file |

### Modified

| File | Change |
|---|---|
| `packages/core/src/config.ts` | Add `activeWiki?: string` to `GlobalConfig` + `setActiveWiki()` helper |
| `apps/web/src/lib/server-wiki.ts` | `resolveWikiPath()` now: explicit env → global config `activeWiki` → default |
| `apps/web/src/app/settings/page.tsx` | Add "Wikis" tab to the tabs strip |
| `apps/web/src/components/onboarding.tsx` | Mention new-wiki flow in the "what happens next" footer |
| `apps/web/src/components/footer.tsx` or app-header | Optional: show active wiki name somewhere |
| `apps/web/src/app/help/page.tsx` | New section explaining multi-wiki |
| `apps/web/src/app/about/page.tsx` | One-line mention that the app supports multiple wikis |
| `docs/dev-log.md` | Section K |

---

## Resolution order

`resolveWikiPath()` checks, in order:

1. `process.env["LLM_WIKI_PATH"]` — explicit override, wins everything (testing, CI, advanced users who script the CLI)
2. `~/.llm-wiki/config.json` → `activeWiki` field — the in-app picker writes here
3. `~/llm-wiki-default` — fallback when nothing else is set (first run)

Reading config on every request is fine — it's a small JSON file, OS will cache it, the dev server already reads other on-disk state per-request via `openWikiContext`.

---

## API surface

### `GET /api/wikis`

```json
{
  "active": "/Users/ddsyasas/llm-wiki-physics",
  "recents": [
    { "path": "/Users/ddsyasas/llm-wiki-physics", "topic": "Quantum computing", "exists": true },
    { "path": "/Users/ddsyasas/llm-wiki-ml", "topic": "ML papers", "exists": true },
    { "path": "/Users/ddsyasas/llm-wiki-personal", "topic": null, "exists": false }
  ]
}
```

Each recent gets enriched server-side with:
- `topic` — read from `<path>/.llm-wiki/settings.json` if present
- `exists` — `fs.stat()` the path, so removed-from-disk wikis can be cleaned up

### `POST /api/wikis` (discriminated body)

```ts
type Body =
  | { type: "switch", path: string }
  | { type: "create", path: string, topic: string }
  | { type: "remove", path: string };  // removes from recents, never touches the folder
```

**switch**: validate path is a dir, call `initWikiFolder(path)` (idempotent), `setActiveWiki(path)`, `addRecentWiki(path)`.

**create**: same as switch, plus write the initial topic to that wiki's settings.

**remove**: pure config edit. Drop from `recentWikis`. If the removed wiki was active, fall back to the default and set that as the new active.

After any mutation, the client does `router.refresh()` — the server-component layer re-resolves on next request and the user sees the new wiki everywhere.

---

## UI: Settings → Wikis tab

Layout:

```
WIKIS
Multiple wikis, switch between them. The active wiki is what every page in
the app reads from until you switch again.

──────────────────────────────────────────────────────────────
ACTIVE          Quantum Computing             ⬤ active
                ~/llm-wiki-physics
──────────────────────────────────────────────────────────────
                Machine Learning              [Switch] [×]
                ~/llm-wiki-ml
──────────────────────────────────────────────────────────────
                Personal Knowledge Base       [Switch] [×]
                ~/llm-wiki-personal

[+ Create new wiki]
```

The create form is inline (collapsed by default):
- Folder path (default: `~/llm-wiki-<slug-from-topic>`)
- Topic (one line)
- "Create + switch to it" button

When user clicks Switch:
1. POST `/api/wikis` `{type: "switch", path}`
2. On success, `router.refresh()` + show a brief "Switched to X" toast
3. The wiki name at the top of the app shows the new topic

Edge cases:
- Switch to a non-existent path → error toast
- Create at a path that already exists → still works (we just init the folder if needed and set the topic — additive)
- Remove the currently-active wiki → confirm dialog ("This removes it from your wiki list. The folder + files stay on disk.") then switch to default

---

## Phases + checklist

### Phase 1: planning doc
- [x] This file

### Phase 2: core — activeWiki + setActiveWiki
- [x] `packages/core/src/config.ts` — added `activeWiki?: string` to `GlobalConfig`, parser
- [x] Added `setActiveWiki(wikiPath)` + `removeRecentWiki(wikiPath)` helpers
- [x] 6 new config-test cases (12 → 18 passing): setActiveWiki persistence, recents reorder on re-activation, removeRecentWiki clears active when removing the active wiki, etc.

### Phase 3: server-wiki — new resolution order
- [x] Updated `apps/web/src/lib/server-wiki.ts` `resolveWikiPath()` to check env → global config `activeWiki` → default
- [x] Sync `readFileSync` of config (runs in server-component paths; small file, OS-cached)
- [x] Falls through silently on ENOENT / malformed JSON

### Phase 4: API surface
- [x] `apps/web/src/app/api/wikis/route.ts` — `GET` + `POST` discriminated by `type`
- [x] GET enriches recents with topic (from per-wiki settings) + exists (via `fs.stat`)
- [x] POST switch validates path exists + is a directory before activating
- [x] POST create runs `initWikiFolder` (idempotent) + stamps topic into settings
- [x] POST remove is config-only — never touches on-disk folder
- [x] Tilde expansion + `resolve()` normalize pasted paths

### Phase 5: Settings tab
- [x] `apps/web/src/components/settings/wikis-tab.tsx`
- [x] Added "Wikis" between "General" and "Models" in the tabs strip
- [x] Active wiki row gets primary-color border + "active" chip
- [x] Folder-missing rows get an amber "folder missing" chip
- [x] Inline create form auto-fills folder path from topic via slugify
- [x] After mutation: `router.refresh()` + flash message

### Phase 6: doc + nav updates
- [x] `apps/web/src/app/help/page.tsx` — new "Multiple wikis" section + TOC entry
- [x] `apps/web/src/app/about/page.tsx` — "One wiki, or several" section above "Who it's for"
- [x] `docs/dev-log.md` — section K
- [ ] Optional active-wiki indicator in header/footer — deferred (Settings → Wikis is the canonical surface, header stays uncluttered per docs/13 decision log)

### Phase 7: ship it
- [x] Typecheck clean
- [x] Core tests: 140 passing (no regressions, 6 new config cases)
- [x] Commit + push

---

## Risks and unknowns

### 1. Stale server caches
The dev server doesn't cache much per-process — `openWikiContext()` opens a fresh DB connection per request. But if any module hoists a per-process singleton bound to a wiki path, switching would surface stale data. Survey before shipping: grep for module-level state in the API routes.

### 2. SQLite locks across wikis
Each wiki has its own `.llm-wiki/meta.sqlite`. Switching between them just opens a different file — no lock contention since they're separate files. Safe.

### 3. chokidar live-watch on path X after switch to path Y
If the dev server ever starts a chokidar watcher bound to the current wiki path, switching wouldn't migrate the watcher. Current state: watchers are only used in tests + the `sync` module. The dev server uses `syncWikiToDb()` per-request, not persistent watchers. Safe today, but flag it as a thing to check before V1.1 if anyone wires up a persistent watcher.

### 4. The onboarding gate runs per-wiki
A brand-new wiki has empty topic + likely no API key (global). The home-page first-run check already triggers in this case — user gets the wizard on the new wiki, completes it, lands on the dashboard. This is correct behavior, just noting it.

### 5. "Switch" without page reload
The cleanest UX is a hot-swap with no reload, but every server component needs to re-fetch. `router.refresh()` does this — the entire route tree re-renders with fresh server-side data. Verify in practice that the sidebar / pages list / etc. all update immediately and there's no flash of stale content.

### 6. Confusing "active wiki" semantics across browser windows
If the user has two browser tabs pointing at the same dev server and they switch in tab A, tab B will see the new wiki on next interaction (since active is a server-side global). This might surprise some users. Document it; not a bug.

---

## Future enhancements (out of scope for V1.x)

- **Quick switcher in the header** — wordmark dropdown showing active wiki + recents, switch in one click without leaving the page you're on
- **`Cmd+K` integration** — "Switch wiki..." action in the command palette
- **Wiki templates** — when creating a new wiki, offer to pre-fill `CLAUDE.md` from a template (Research / Legal / Clinical / Project)
- **Bulk export** — "export this wiki + all sources as a zip" (the V1 P1 #13 deferred feature, would naturally live in the Wikis tab)
- **True URL-namespaced multi-wiki** (`/w/<id>/...`) — V2 work, lets users browse multiple wikis simultaneously in different browser tabs

---

## Decision log

- **2026-05-24** — picked the in-app switcher (option C from chat) over the full URL-namespaced approach (option D). Reasons: bounded refactor (one chokepoint changes vs. every route), reuses existing `recentWikis` plumbing, and matches the "one wiki = one focused work session" mental model. Option D is additive on top later.
- **2026-05-24** — env var `LLM_WIKI_PATH` keeps winning over global config when set. Reasoning: scripting / CI / advanced users who want explicit control. Most users will leave the env unset and the picker becomes the canonical mechanism.
- **2026-05-24** — `remove` action on a wiki only edits the config, never deletes the on-disk folder. Reasoning: data safety > convenience. If a user truly wants to delete the wiki, they can `rm -rf` the folder themselves.
- **2026-05-24** — UI lives in Settings → Wikis tab, not the header. Reasoning: switching wikis is a session-level action, not something users do dozens of times per session. Header chrome stays uncluttered.
