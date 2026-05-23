# 11 Attribution and License

## Project naming

- **Product name**: LLM Wiki
- **Package name**: `@yasas/llm-wiki` (npm scoped package)
- **Binary name**: `llm-wiki`
- **Repository**: `github.com/ddsyasas/llm-wiki`
- **Local folder name** (in development): `llm-wiki`

Do NOT use these variations:
- "LLM Wiki Open Source" as the product name (redundant; we say it's open source via README and LICENSE)
- "LLMWiki" (one word; less readable)
- "Yasas LLM Wiki" (author name in product name is not the standard pattern)

## Authorship attribution

The author of this project is **Yasas**. Replace placeholder occurrences of "yasas" or "Yasas" with the actual full handle, name, and contact info before publishing.

### Where Yasas's attribution lives

| Location | What it says | Visible to |
|----------|--------------|------------|
| `package.json` `author` field | `Yasas <email> (https://your-site.com)` | npm users, contributors |
| `package.json` `name` field | `@yasas/llm-wiki` | everyone who installs |
| `LICENSE` copyright line | `Copyright (c) 2026 Yasas` | legal record |
| GitHub repo URL | `github.com/ddsyasas/llm-wiki` | everyone |
| `README.md` top | "Built by [Yasas](link)" | repo visitors |
| `README.md` Credits section | Longer note with links | readers who scroll |
| UI footer (every page) | `LLM Wiki by Yasas · open source · GitHub` | every user, every session |
| About page in app | Full credits, links to your work | curious users |
| First-run welcome screen | Optional one-line credit | first-time users |

### Where Yasas's attribution does NOT appear

To keep the UI clean and product-focused:
- Header / app chrome (just shows "LLM Wiki" + wiki topic)
- Any individual feature view (no "by Yasas" anywhere on the Wiki page, Query page, etc.)
- The wiki folder structure itself (no `BY-YASAS.md`)
- The npm package binary name (just `llm-wiki`)
- Default browser tab title (just "LLM Wiki")

## Karpathy attribution

This project implements a pattern Karpathy publicly shared. Credit him explicitly in:

| Location | What it says |
|----------|--------------|
| `README.md` top section | "Implements [Andrej Karpathy's LLM Wiki pattern](gist-link)" |
| About page in app | "Inspired by Andrej Karpathy. Read the [original gist](link) for the design philosophy." |
| UI footer | `Pattern by Karpathy` link |

Why this matters:
1. It's the ethical thing to do (he originated the idea)
2. People searching for "Karpathy LLM Wiki implementation" find our project
3. Karpathy explicitly framed his gist as an idea file for others to instantiate
4. It signals we understand the lineage of the design

## License: MIT

We license under MIT.

### Why MIT

- Maximally permissive (anyone can use, fork, sell, modify)
- Most commonly used for open source dev tools, so contributors recognize it
- Compatible with virtually everything
- Short and readable

### Why not GPL or AGPL

- GPL would force derivatives to also be open source. That's a stance about software freedom but it scares some users and companies away.
- AGPL closes the network loophole (must share source even when offered as a service). Even more restrictive.
- Our priority is adoption, not compelling downstream openness.

### Why not Apache 2.0

- Apache 2.0 adds patent protection clauses MIT doesn't have. For a tool like this, the added complexity isn't worth it. If we're ever in a position where patents matter, we can relicense (with contributor agreement).

### Why not a "fair source" license like BSL or PolyForm

- These restrict commercial use up to a date. Could be appropriate if we wanted to commercialize later.
- For V1 we explicitly don't want commercial restrictions. Anyone should be able to fork and run this.

### License file

Place `LICENSE` in the repo root with the standard MIT text:

```
MIT License

Copyright (c) 2026 Yasas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Third-party attribution

We use several open source libraries. Their licenses are compatible with MIT (mostly MIT or Apache 2.0 themselves). We don't need to bundle their licenses unless we ship binaries, but it's good practice to:

1. List notable dependencies in `package.json` (already happens)
2. Include an "Acknowledgements" section in `README.md` thanking key libraries
3. Inside the app, on the About page, list major dependencies with links

Key libraries to acknowledge:
- Next.js (Vercel)
- shadcn/ui (Shadcn)
- better-sqlite3 (WiseLibs)
- mammoth (Microsoft / open source)
- openai (OpenAI npm package)

## Contributor License

For V1, accept contributions under the project's MIT license by default. No separate CLA required (CLAs are friction; MIT is permissive enough that they're not strictly necessary).

If the project grows and we want to relicense in the future, having a clean MIT history without a CLA could make that harder. Acceptable tradeoff for V1.

## Trademarks

We don't claim "LLM Wiki" as a trademark. It's a descriptive name; "LLM" is a common acronym and "wiki" is generic. Karpathy used the exact phrase in his gist; we're using it as a descriptor for an implementation of his pattern. No trademark filing.

## Privacy statement

To ship, include `docs/PRIVACY.md` with:

- We collect no data from users.
- The application runs entirely locally on the user's machine.
- API calls go to OpenRouter (or whatever LLM provider the user configures). Their privacy policy applies to those calls; ours does not cover them.
- No analytics, no telemetry, no error reporting back to us.
- The user's wiki content lives only on their device unless they choose to sync it (via git, Dropbox, iCloud, etc.).
- The user's API key is stored in their OS keychain (or a permissions-restricted local file as fallback).

## Code of Conduct

For an open source project with potential contributors, include `CODE_OF_CONDUCT.md`. Use the [Contributor Covenant](https://www.contributor-covenant.org/) v2.1 as a starting point. Standard, recognized, low-friction.

## Final attribution summary

To make this easy to verify before publish, here's the checklist:

- [ ] `package.json` has correct `name`, `author`, `repository`, `license`
- [ ] `LICENSE` file present with correct year and author name
- [ ] `README.md` credits Yasas and Karpathy
- [ ] UI footer credits Yasas and links to GitHub
- [ ] UI About page has full credits and dependency acknowledgements
- [ ] No occurrences of placeholder "Yasas" left where actual name should be
- [ ] No occurrences of "LLM Wiki Open Source" as a literal product name
- [ ] No author name pollution in feature views (only in footer and About)
- [ ] Karpathy gist URL linked from at least three places (README, About, footer)
- [ ] OpenRouter clearly named in setup docs (not just "API provider")
