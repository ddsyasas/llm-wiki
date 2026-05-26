# Publishing a release

End-to-end recipe for cutting a new `@syasas/llm-wiki` release. Covers the
git side (commit / tag / push / GitHub release) and the npm side (build /
pack / publish / auth). Live document — when something in the pipeline
changes, update it here.

> Audience: anyone with publish rights on `@syasas/llm-wiki` (currently
> just `syasas`). Most contributors don't need this — bug fixes land via
> PR, and only the maintainer cuts the release.

---

## Prerequisites

- **Node 20+** and **pnpm 10+** in PATH.
- **`gh` CLI** authenticated against `ddsyasas/llm-wiki` (`gh auth status`).
- **`npm` CLI** logged in as `syasas` (`npm whoami`).
- **2FA in place.** The npm account is on `auth-and-writes` mode, so every
  publish needs an OTP, a recovery code, or the browser-based approval flow.
  Details in [`Authenticating the publish`](#authenticating-the-publish).
- **Clean working tree** on `main`, up-to-date with `origin/main`.

---

## Pre-release checklist

Before the version bump:

- [ ] All the work for this release is on `main`. No half-merged PRs.
- [ ] `pnpm test` passes (the chokidar live-watch test is a known flake — re-run if it's the only failure).
- [ ] `pnpm -r typecheck` passes across all workspace packages.
- [ ] If the release fixes bugs visible to existing users, the GitHub
      Issue (or Issues) for those bugs is referenced in the planned
      release notes — so they show up linked under "Linked issues" on
      the release page.

Pick the version per [semver](https://semver.org/):

| Change | Bump |
|---|---|
| Bug fix, security fix, internal refactor | **PATCH** (1.2.1 → 1.2.2) |
| New feature, additive API change, new model slot | **MINOR** (1.2.0 → 1.3.0) |
| Breaking change to wiki on-disk format, settings shape, or CLI surface | **MAJOR** (1.x → 2.0) |

Wiki data is **stable within a major**. A migration story (auto-applied at
next server start) is acceptable inside a major; a breaking on-disk change
is what makes a major bump justified.

---

## 1. Bump the version

Edit two files. Both must match.

```
apps/web/package.json       →  "version": "X.Y.Z"
apps/web/src/components/footer.tsx  →  export const APP_VERSION = "X.Y.Z";
```

Anywhere else? No. The CLI bin reads `apps/web/package.json` at runtime;
the `llm-wiki version` command and the `<footer>` display the same
string. Don't bump anything in `packages/*/package.json` — those stay at
`0.0.0` because workspace consumers reference them via `workspace:*` and
nothing reads their version at runtime.

---

## 2. Commit + tag + push

The repo convention so far: one commit for the actual code changes, a
second commit named `vX.Y.Z — <one-line subject>` that contains only the
version bump in `package.json` + `footer.tsx`. Then an annotated tag on
the version-bump commit.

```bash
# Stage code changes (per-file, not -A — avoids accidentally
# committing .env / OS-keychain caches / dist artifacts).
git add <paths>
git commit -m "feat(area): short subject

Longer rationale, multi-line, why-not-what."

# Stage the version bump and commit it on its own.
git add apps/web/package.json apps/web/src/components/footer.tsx
git commit -m "vX.Y.Z — short release theme"

# Annotated tag on the bump commit + push everything.
git tag -a vX.Y.Z -m "vX.Y.Z — short release theme"
git push origin main
git push origin vX.Y.Z
```

Why a separate version-bump commit? It's the durable anchor for the tag.
If the tag ever needs to move (rare, but recovery scenarios exist), the
bump commit is a clean single-file flip with no other diff to worry about.

---

## 3. Build the publishable tarball

The repo's source `package.json` declares `workspace:*` deps that don't
exist in the published artifact — every workspace package is inlined into
the Next.js standalone bundle at build time. The build script lives at
[`apps/web/scripts/build-publish-tarball.mjs`](../apps/web/scripts/build-publish-tarball.mjs)
and emits a clean, self-contained `dist-publish/` tree.

```bash
pnpm --filter @llm-wiki/web build:publish
```

This runs three things in order:

1. `next build` — compiles the app and produces `.next/standalone/`.
2. `node ./scripts/copy-standalone-assets.mjs` — copies public + static
   into the standalone tree (Next doesn't do this by default).
3. `node ./scripts/build-publish-tarball.mjs` — assembles
   `apps/web/dist-publish/` with:
   - rewritten `package.json` (no `workspace:*` deps, name set to
     `@syasas/llm-wiki`, runtime deps pinned to whatever resolved during
     this install)
   - `bin/llm-wiki.mjs` + `bin/postinstall.mjs`
   - `.next/standalone/` (with pnpm store flattened, per-platform native
     deps stripped so they install fresh on the user's machine)
   - `.next/static/`, `public/`, `README.md`, `LICENSE`

If the build prints `⚠ <name> not found in standalone node_modules`,
something is off in `copy-standalone-assets.mjs` — investigate before
publishing. The stripped per-platform deps (`better-sqlite3`, `keytar`,
`chokidar`, etc.) MUST come back via `npm install` on the user's machine.

---

## 4. Pack + sanity check

```bash
cd apps/web/dist-publish
npm pack
```

Produces `syasas-llm-wiki-X.Y.Z.tgz` (around 27–29 MB). The npm output
includes a file list and the tarball metadata — eyeball the version, the
file count, and the unpacked size. If size jumps significantly (>40 MB)
something has been bundled that shouldn't be.

Optional smoke test before publishing — install the tarball globally,
run, and verify the CLI works against a throwaway folder:

```bash
npm install -g ./syasas-llm-wiki-X.Y.Z.tgz
llm-wiki version    # should match X.Y.Z
llm-wiki start /tmp/llm-wiki-smoke --no-open --port 3939
# Ctrl+C after the server logs Ready.
npm uninstall -g @syasas/llm-wiki
```

Skip-able for a routine patch, but worth doing if the build script or
the standalone bundle layout has changed.

---

## 5. Create the GitHub release

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z — short theme" \
  --notes-file release-notes.md \
  syasas-llm-wiki-X.Y.Z.tgz
```

Or pass `--notes "..."` for short notes inline. Either way, attach the
`.tgz` as a release asset — that's the fallback install path for users
who can't reach npm for whatever reason (corporate proxy, npm outage,
etc.). See past releases for the style:

- Patch (bug fix): one paragraph intro, `## Install`, `## What's fixed`,
  `## Upgrading`. ~30 lines.
- Minor (feature): longer intro, `## Install`, `## What's new` with a
  subsection per major feature, `## Upgrading`. ~80–120 lines.

Reference any GitHub Issues this release closes (`Fixes #N`) in the
notes so they auto-link on the release page.

---

## 6. Publish to npm

```bash
cd apps/web/dist-publish
npm publish --access public
```

`--access public` is required because `@syasas` is a scoped name and
scoped packages default to private. Once npm is happy with auth (see
below), publish takes 10–30s for a 27 MB tarball.

The publish is **irreversible** beyond a 72-hour unpublish window, and
even then the version number is permanently burned — you cannot
re-publish the same version, ever. If something went wrong, bump the
patch and re-cut.

### Authenticating the publish

The npm account is on `auth-and-writes` 2FA (every publish needs a
second factor). Four ways to satisfy it, ranked by ergonomics:

1. **Browser-based approval (recommended for human-driven releases).**
   Run `npm publish --access public` with no `--otp`. npm prints:
   ```
   Authenticate your account at:
   https://www.npmjs.com/auth/cli/<uuid>
   Press ENTER to open in the browser...
   ```
   Hit Enter → browser opens → approve → CLI continues automatically.
   No code to copy. Requires an interactive terminal — won't work in CI
   or backgrounded shells.
2. **TOTP from authenticator app.** Pass `--otp=<6-digit-code>` from
   Google Authenticator / 1Password / Authy. Codes rotate every 30s so
   build + pack first, then grab the code, then publish immediately.
3. **Recovery code.** When 2FA was first enabled, npm gave 10 one-time
   recovery codes. Pass any unused one as `--otp=<code>`. Each works
   exactly once — once consumed, regenerate the set on
   `npmjs.com → Account → Two-factor Authentication`. Useful when you
   don't have the authenticator app at hand.
4. **Granular access token.** Create one on
   `npmjs.com → Account → Access Tokens` with publish rights scoped to
   `@syasas/llm-wiki`. Tokens bypass 2FA and live in
   `~/.npmrc` as `//registry.npmjs.org/:_authToken=<token>`. Use this
   path for CI-driven publishes — never for ad-hoc human ones, since a
   leaked token is harder to detect than a stolen 30s OTP.

A note on `npm login`: classic password login is deprecated. Use
`npm login --auth-type=web` — it opens a browser and authenticates via
the npmjs.com session, same as the browser-based publish approval.

---

## 7. Verify

```bash
npm view @syasas/llm-wiki version dist-tags
# version = 'X.Y.Z'
# dist-tags = { latest: 'X.Y.Z' }
```

Then upgrade your own global install and smoke-test the shipped artifact
end-to-end:

```bash
npm install -g @syasas/llm-wiki@latest
llm-wiki version    # X.Y.Z
llm-wiki doctor     # config + OpenRouter reachability
llm-wiki start      # exercise the change you shipped
```

Going live takes a few seconds for the metadata and up to ~10 minutes
for the unpkg.com / npmjs.com pages to refresh.

---

## 8. Announce (optional)

For a bug-fix patch that affects existing users, consider:

- A pinned GitHub Issue: "Known issues in vA.B.C — upgrade to vA.B.D".
  Pin via `gh issue pin <num>`. Closing happens when the broken version
  is no longer the latest install most people land on.
- A one-line post on whichever channels the project uses (X, Mastodon,
  HN, blog) linking to the release notes.

For a feature minor: a longer-form changelog post, screenshots if it
adds UI, and a mention in the next dev-log entry.

For routine internal refactors: nothing extra. The GitHub release page
+ the CLI's [auto-update notifier](../apps/web/bin/llm-wiki.mjs) (added
in v1.2.2) handle discovery — running users see a yellow banner on
their next `llm-wiki start`.

---

## Common pitfalls

**"You cannot publish over the previously published versions"**
The version in `apps/web/package.json` matches one already on npm. Bump
it and retry. Don't try `npm unpublish` to free the slot — version
numbers are burned permanently.

**`ls dist-publish/` shows no `.next/`**
`ls` hides dotdirs by default. `ls -la dist-publish/` to see the truth.
If `.next/` actually is missing, the build ran but the standalone copy
step didn't — check `pnpm --filter @llm-wiki/web build:publish` output
for errors.

**Tarball is 100+ MB**
Something heavy got bundled that should be a runtime dep. Open the
tarball (`tar -tzf syasas-llm-wiki-X.Y.Z.tgz | head -50`), find the
heaviest paths, and either add them to `PUBLISHED_RUNTIME_PACKAGES` in
`build-publish-tarball.mjs` or trace why they ended up in standalone.

**`npm publish` exits with status 0 but the version is missing from `npm view`**
The publish actually failed but the wrapper swallowed the real exit
code. Re-read the output — look for `npm error` lines. Common causes:
EOTP (missing `--otp`), network blip, or auth token expired. Run the
publish again with explicit auth.

**"Package name too similar to existing packages"**
Doesn't apply once `@syasas/llm-wiki` already exists, but if a future
release renames or splits packages, the npm registry's anti-typosquat
heuristic can flag the new name. Pre-clear with npm support if you're
moving to a new package name.

**Tag pushed but no GitHub Release shows up**
Tags ≠ releases. Tags are git-level; releases are a GitHub layer that
wraps a tag with notes + assets. Run `gh release create vX.Y.Z ...`
explicitly after pushing the tag.

**Update notifier showing the wrong version**
Cache lives at `~/.llm-wiki/update-check.json`. Delete it to force a
fresh fetch on the next `llm-wiki start`. Cache lifetime is 24h; only
the cached value drives the banner so a stale cache doesn't surface a
just-published version until the next start after refresh.

---

## Release-history quick reference

| Version | Date | Type | Highlights |
|---|---|---|---|
| v1.2.2 | 2026-05-26 | patch | CLI update notifier on `llm-wiki start` |
| v1.2.1 | 2026-05-26 | patch | Fix typing crash on Sources/Query + PDF ingest via OpenRouter |
| v1.2.0 | 2026-05-26 | minor | Local models (Ollama) support |
| v1.1.1 | 2026-05-24 | patch | Case-insensitive commands + banner alignment |
| v1.1.0 | 2026-05-24 | minor | Cross-platform npm-installable |
| v1.0.0 | 2026-05-24 | major | First stable release |

Full notes: [GitHub Releases](https://github.com/ddsyasas/llm-wiki/releases).
