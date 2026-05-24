# Security Policy

LLM Wiki is a local-first application that runs entirely on the user's machine and talks only to OpenRouter (the user's chosen LLM provider). The threat surface is small, but it isn't zero — anything that handles user files, parses external content (URLs, PDFs, HTML), or stores API keys is worth thinking about.

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.1.x   | ✅ Yes — current stable, gets security fixes |
| 1.0.x   | ⚠ Best-effort — upgrade to 1.1.x recommended |
| < 1.0   | ❌ Not supported |

When v2.0 ships, 1.1.x will continue to get security fixes for 6 months.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.** Public disclosure before a fix is ready puts users at risk.

Use one of these private channels:

- **GitHub private vulnerability reporting** (preferred): [Open a security advisory](https://github.com/ddsyasas/llm-wiki/security/advisories/new). Only maintainers can see it.
- **Email**: yasas@idersolutions.com — encrypt with PGP if you want, public key on request.

Include in your report:

- What the vulnerability is, in plain language
- Steps to reproduce (or a proof-of-concept if you have one)
- The impact you think it could have
- Your name / handle if you want credit in the fix announcement

## What to expect after you report

| Time | What we do |
|---|---|
| Within 7 days | Acknowledge the report; ask follow-up questions if anything's unclear |
| Within 30 days | Provide an initial assessment — confirmed / not-a-bug / out-of-scope, severity rating, rough fix timeline |
| Variable | Develop and test the fix in a private branch |
| At fix release | Coordinate public disclosure; credit you in the release notes unless you prefer to stay anonymous |

This is a side-project maintained by one person. We'll do best-effort on the timelines above but can't promise enterprise-style SLAs. Critical issues (RCE, key exfiltration, etc.) will be prioritized over lower-severity ones.

## What counts as in-scope

- The published `@syasas/llm-wiki` npm package (any supported version)
- The source code in this repository on the `main` branch
- The CLI (`bin/llm-wiki.mjs`) and its installation flow
- The Next.js server bundle and any API route under `/api/`
- The on-disk format (wiki folder, `.llm-wiki/` metadata directory, `~/.llm-wiki/config.json`)
- Any handling of OpenRouter API keys (in keychain, in the file fallback, in HTTP requests)

## What's out of scope

- Issues in third-party dependencies that aren't exploitable through LLM Wiki itself (file those upstream)
- "The app talks to the internet when it makes LLM calls" — yes, that's by design; the only outbound traffic is to OpenRouter (or whatever provider URL the user configured)
- Issues that require physical access to a machine that's already running LLM Wiki — at that point, the attacker has the user's whole filesystem
- Social engineering attacks against maintainers
- Brute-force attacks on the user's OpenRouter API key (that's OpenRouter's responsibility)
- Issues affecting deprecated versions (< 1.0)

## Known security-relevant design choices

These are intentional and documented for transparency:

- **API keys are stored in the OS keychain when available** (`keytar`), falling back to a `chmod 600` file at `~/.llm-wiki/config.json`. The fallback is acceptable for local-only use but means anyone with shell access to the user's account can read the key.
- **No authentication on the local web server.** The server binds to `127.0.0.1` by default, so it's only reachable from the same machine. Don't expose the port externally without adding your own auth layer.
- **HTML/URL ingestion uses `@mozilla/readability` + `jsdom`** to extract clean text. We do not execute JavaScript from ingested pages, but jsdom does parse them — known CVEs in jsdom are inherited until upgraded.
- **No telemetry, no error reporting, no version-check pings.** Nothing leaves the user's machine except LLM calls to their configured provider.

## Hall of Fame

Reporters who help us fix real security issues will be listed here (with permission). Currently empty — be the first.
