# 08 UI Design

## Design philosophy

This is a tool for thinking, not a consumer SaaS. The UI should feel like:

- A serious research tool (think: a well-designed academic reader, not Slack)
- Reading-first (typography matters, lots of whitespace)
- Calm, not loud (subdued accent color, not gradients or rainbows)
- Quick to navigate (keyboard shortcuts for power users)
- Out of the way (the wiki content is the star, the chrome is silent)

Specifically NOT:
- No glassmorphism
- No purple gradients (the AI-product cliché)
- No "Welcome aboard 🎉" emoji-heavy UX
- No tutorial overlays after the first run
- No marketing-style hero sections inside the app

## Color palette

Two themes: light (default) and dark. Both use a warm, paper-inspired palette.

### Light theme

```css
--bg-primary: #faf7f2;       /* warm cream paper */
--bg-secondary: #f3ede2;     /* slightly darker for sidebars */
--bg-elevated: #ffffff;      /* cards, modals */
--text-primary: #1c1917;     /* warm near-black */
--text-secondary: #57534e;   /* warm gray */
--text-muted: #a8a29e;       /* light warm gray */
--border: #d6d3d1;
--accent: #991b1b;           /* deep red, used sparingly */
--accent-soft: #fee2e2;      /* red 50, for backgrounds */
--success: #166534;
--warning: #92400e;
--error: #991b1b;
```

### Dark theme

```css
--bg-primary: #1c1917;
--bg-secondary: #292524;
--bg-elevated: #44403c;
--text-primary: #f5f5f4;
--text-secondary: #d6d3d1;
--text-muted: #78716c;
--border: #44403c;
--accent: #f87171;
--accent-soft: #450a0a;
--success: #4ade80;
--warning: #fb923c;
--error: #f87171;
```

## Typography

- **Display / headings**: Fraunces (variable serif, scholarly feel)
- **Body / reading**: Crimson Pro (refined serif for prose)
- **UI text**: Inter (clean sans, good at small sizes)
- **Monospace**: JetBrains Mono

Load from Google Fonts. Self-host if performance matters.

Type scale:
- h1: 2.5rem (40px), Fraunces 600
- h2: 1.875rem (30px), Fraunces 600
- h3: 1.5rem (24px), Fraunces 500
- h4: 1.25rem (20px), Fraunces 500
- body: 1.0625rem (17px), Crimson Pro 400 (reading-friendly)
- ui: 0.875rem (14px), Inter 400
- caption: 0.75rem (12px), Inter 500 uppercase tracking-wide

Line height: 1.65 for body, 1.3 for headings.

## Layout

### App shell

```
┌────────────────────────────────────────────────────────────────────┐
│  [[ LLM Wiki  [⌂ {topic} ▾]   Wiki Graph Sources Query Chats Lint │ ← header (56px)
├────────┬───────────────────────────────────────────────────────────┤
│        │                                                            │
│ sidebar│  main content                                              │
│ (256px)│                                                            │
│        │                                                            │
│        │                                                            │
│        │                                                            │
├────────┴───────────────────────────────────────────────────────────┤
│  LLM Wiki by Yasas · v1.0.0 · About · Help · Developers · GitHub  │ ← footer
└────────────────────────────────────────────────────────────────────┘
```

The header nav switches the main view. The sidebar contents depend on the view:
- Wiki view: page tree with filter
- Chats view: chat list grouped by folder
- Other views: hidden or contextual

The `[⌂ {topic} ▾]` chip next to the wordmark is the **active-wiki indicator + switcher** (added post-V1.0, see [`docs/13-multi-wiki.md`](13-multi-wiki.md)). Always shows the active wiki's topic; click → dropdown of recents + "Create new wiki" / "Manage wikis…" links. Switching uses `router.refresh()` so the current page stays put but its data refreshes for the new wiki.

### Key screens

#### 1. First-run setup (modal flow)

Three steps:
1. Welcome screen: brief explanation, "Set up wiki folder" button
2. Folder picker: choose or create the wiki directory
3. API key: paste OpenRouter key, "Where do I get this?" link

After setup, land on the Wiki view with the index (which says "No pages yet").

#### 2. Wiki view

- Sidebar: alphabetical page list with type filter and search
- Main: either the index (default) or a page
- On a page: title, frontmatter info (type, dates), rendered markdown, backlinks at bottom

Editing: pencil icon → in-place markdown editor with live preview side-by-side.

#### 3. Sources view

Two-column layout:
- Left: list of all sources with format icons, dates, ingestion status
- Right: drop zone or paste area + active source detail

For an ingested source, the detail shows: extracted markdown, list of wiki pages it contributed to, "Re-ingest" button.

#### 4. Query view

Centered single-column. Big input at top. Below it, streaming answer with citations. Click citation = jump to that page in a side panel. "Save as wiki page" button after the answer completes.

#### 5. Chats view

Three-column on wide screens:
- Folder list (160px)
- Chat list for selected folder (240px)
- Active chat (rest)

On narrow screens (< 1200px), collapse to two columns with folder list as a dropdown.

#### 6. Lint view

Run button at top. After running:
- Summary card: health rating, issue count by severity
- Issues list grouped by type, each with quick-fix button where applicable
- Suggested questions at the bottom

#### 7. Schema editor

Split view: monaco editor on the left with `CLAUDE.md` content, rendered preview on the right. Save button commits to disk.

#### 8. Settings

Tabs:
- General: wiki topic, theme, language
- Models: dropdowns for each operation (ingest, query, lint, vision)
- API: OpenRouter key field (masked, with "Test connection" button)
- Costs: token usage chart, cumulative spend
- About: version, credits, license, GitHub link

## Components

Use shadcn/ui as the component base. Specifically install:
- Button, Input, Textarea, Select, Switch, Checkbox
- Dialog, AlertDialog, Sheet (slide-out panel)
- Toast (Sonner)
- Tabs, Accordion
- DropdownMenu, ContextMenu
- Tooltip, Popover
- ScrollArea, Separator
- Skeleton (loading states)

Custom components we'll build:
- `<WikiLink slug={slug}>` for `[[wikilinks]]`
- `<MarkdownRenderer content={md} pages={pages} />`
- `<PageEditor slug={slug} />`
- `<ChatMessage role content actions />`
- `<CostEstimate operation tokens model />`
- `<IngestProgress events />`
- `<IssueCard issue onFix />`

## Interactions

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Cmd+K` / `Ctrl+K` | Open command palette |
| `Cmd+P` / `Ctrl+P` | Quick switch to page |
| `Cmd+Shift+N` | New chat |
| `Cmd+/` | Toggle sidebar |
| `Cmd+,` | Open settings |
| `Esc` | Close modal / cancel edit |
| `Cmd+Enter` (in editor) | Save page |
| `Cmd+Enter` (in chat) | Send message |

### Command palette (Cmd+K)

Fuzzy search across:
- All wiki pages
- All chats
- Actions ("Run lint", "New chat", "Open settings")
- Recent operations

### Loading states

Every async operation shows a state:
- Inline: spinner next to the button that triggered it
- Background: status bar indicator with operation name
- Long operations (ingest): toast with progress bar

### Empty states

Each view has a designed empty state that explains what to do:
- Wiki view with no pages: "Add a source to start your wiki"
- Sources view with nothing ingested: drop zone with example formats
- Chats view with no chats: "Start a conversation with your wiki"
- Lint view before first run: "Click Run Lint to check your wiki"

## Motion

Use motion sparingly:
- Page transitions: instant, no fade (snappy feels faster)
- Modal open: 150ms scale + fade
- Hover states: 100ms color change
- Toast in/out: 200ms slide
- Skeleton shimmer: 1.5s pulse

No bouncy springs, no parallax, no scroll-triggered animations.

## Accessibility

- All interactive elements keyboard-accessible
- Visible focus indicators (don't rely on browser default)
- ARIA labels on icon-only buttons
- Color contrast meets WCAG AA at minimum
- Don't rely on color alone (icons + text for status indicators)
- Reduced motion: respect `prefers-reduced-motion` media query

## Footer

Every page has a small footer:

```
LLM Wiki by Yasas · Open source · v0.1.0 · GitHub · Pattern by Karpathy
```

Links: Yasas's profile, the GitHub repo, the original Karpathy gist.
