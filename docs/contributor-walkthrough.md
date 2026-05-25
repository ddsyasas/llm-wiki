# First-time contributor walkthrough

This doc is for **people who have never sent a pull request before** and want to contribute to LLM Wiki. It walks through every step concretely, with the exact commands you'd type.

If you've contributed to other open-source projects, [CONTRIBUTING.md](../CONTRIBUTING.md) has the work list and the project-specific conventions; this doc is the gentler introduction to the workflow itself.

---

## What you'll need before you start

| Thing | How to check | How to get it |
|---|---|---|
| **Git** | `git --version` should print something | [git-scm.com/downloads](https://git-scm.com/downloads) |
| **Node.js 20+** | `node --version` should print v20+ | [nodejs.org](https://nodejs.org) (LTS) |
| **pnpm 8+** | `pnpm --version` should print 8+ | `npm install -g pnpm` |
| **A GitHub account** | log in at github.com | [github.com/join](https://github.com/join) — free |
| **A code editor** | anything — VS Code, vim, Cursor | If you have none, [VS Code](https://code.visualstudio.com) is the most beginner-friendly |
| **(For testing LLM features) An OpenRouter API key** | n/a | [openrouter.ai/keys](https://openrouter.ai/keys) — ~$5 lasts most users 2-4 weeks |

If everything checks out, you're ready.

---

## The mental model — what's actually happening

Five things to keep straight. They sound abstract until you do them once, then they're obvious forever.

```
GitHub.com (the cloud)
│
├── github.com/ddsyasas/llm-wiki        ← THE original repo (the "upstream")
│   Only the maintainer can push to this directly.
│
├── github.com/yourname/llm-wiki        ← YOUR fork (a complete copy you own)
│   You can push to this freely.
│   Created when you click the "Fork" button.
│
your-laptop/llm-wiki                    ← Your LOCAL clone of your fork
    Where you actually edit files and run tests.
    Created when you run `git clone <your-fork-url>`.
```

The dance:

1. **Fork** the original repo on GitHub → you get your own copy at `github.com/yourname/llm-wiki`
2. **Clone** your fork to your laptop → you have a working folder you can edit
3. Make changes locally, **commit** them
4. **Push** your commits up to your fork on GitHub
5. **Open a pull request** from your fork to the original → the maintainer reviews + merges

That's it. Now let's walk through it for real.

---

## Step 0 — Find something to work on

Pick one of these starting points:

- **Browse open issues** at [github.com/ddsyasas/llm-wiki/issues](https://github.com/ddsyasas/llm-wiki/issues) — look for ones tagged `good-first-issue`
- **Read CONTRIBUTING.md's "Quick wins" list** — 5 small tasks that are good starter PRs
- **Found a bug while using the app?** → [open an issue first](https://github.com/ddsyasas/llm-wiki/issues/new/choose), then fix it
- **Have an idea for an improvement?** → [open a feature request](https://github.com/ddsyasas/llm-wiki/issues/new/choose) first to discuss it before writing code

**Important: comment on the issue saying "I'd like to take this"** before you start. Avoids two people independently working on the same thing. Maintainer will give a thumbs-up and you're good to go.

---

## Step 1 — Fork the repo

1. Go to [github.com/ddsyasas/llm-wiki](https://github.com/ddsyasas/llm-wiki) in your browser
2. Look at the top-right corner of the page. There's a button labeled **"Fork"** with a fork count next to it.
3. Click it.
4. GitHub asks where to create the fork. Confirm by clicking **"Create fork"**.
5. After a few seconds, your browser redirects to `github.com/yourname/llm-wiki` — your fork.

That's it. You now own a complete copy.

---

## Step 2 — Clone your fork to your laptop

On YOUR fork's page (`github.com/yourname/llm-wiki`), click the green **"Code"** button → copy the HTTPS URL. It looks like `https://github.com/yourname/llm-wiki.git`.

In a terminal:

```bash
# Pick a folder where you keep code projects (e.g. ~/code)
cd ~/code

# Clone your fork
git clone https://github.com/yourname/llm-wiki.git

# Move into the new folder
cd llm-wiki
```

You now have a local folder with all the source code + full git history.

---

## Step 3 — Install dependencies + verify the project runs

```bash
pnpm install
```

This downloads everything the project needs (~1 minute on a warm machine).

Verify it works:

```bash
pnpm dev
```

You should see:

```
- Local:        http://localhost:3000
✓ Ready in 1.5s
```

Open `http://localhost:3000` in your browser. The first-run wizard appears. You don't need to complete it unless you want to test LLM features (which need the API key) — for code/doc fixes you can skip it.

Hit `Ctrl+C` in the terminal to stop the server when done.

---

## Step 4 — Create a branch for your change

**Don't work directly on `main`.** Create a branch named after what you're doing.

```bash
# Branch naming convention:
#   fix/<short-description>     for bug fixes
#   feat/<short-description>    for new features
#   docs/<short-description>    for documentation only
#   chore/<short-description>   for cleanup / refactor

# Example:
git checkout -b fix/help-page-typo
```

`git checkout -b <name>` is shorthand for "create this branch and switch to it." After this command, anything you commit lands on `fix/help-page-typo`, not on `main`.

---

## Step 5 — Make your change

Open the file you're editing. Make your changes. Save.

For a typo fix, this might be one file and one line. For a feature, it might touch several files.

**Run the tests + typecheck** before you commit:

```bash
# Typecheck the whole monorepo
pnpm -r exec tsc --noEmit

# Run the test suites
pnpm --filter @llm-wiki/core test --run
pnpm --filter @llm-wiki/llm test --run
pnpm --filter @llm-wiki/ingestion test --run
```

All should pass before you continue.

If your change touches UI, also verify visually: `pnpm dev` and click through the affected screens in the browser.

---

## Step 6 — Commit your changes

A commit is a saved snapshot of your changes with a message describing them.

```bash
# See what files you changed
git status

# Stage the specific files you want to commit
git add apps/web/src/app/help/page.tsx

# Commit with a clear message
git commit -m "Fix typo in Setup section of help page"
```

**Commit message guidelines** (don't overthink these, but):

- First line: short, imperative ("Fix typo" not "Fixed typo")
- Around 50-72 characters for the first line
- Optional: leave a blank line and add more detail if needed

Bad: `"fixes"` or `"various changes"` or `"asdf"`

Good: `"Fix typo in Setup section of help page"` or `"Add Windows install fallback for native deps"`

---

## Step 7 — Push your branch to your fork

```bash
git push origin fix/help-page-typo
```

`origin` is the name git automatically gave to your fork on GitHub (when you cloned). `fix/help-page-typo` is your branch name.

After this, refresh your fork's page on GitHub. You'll see a yellow banner at the top:

> Your recently pushed branches: `fix/help-page-typo` (a minute ago) [Compare & pull request]

---

## Step 8 — Open the pull request

Click that **"Compare & pull request"** button.

GitHub takes you to the PR creation page. Two key things to check:

1. **The merge direction** at the top: should say `base: ddsyasas:main` ← `compare: yourname:fix/help-page-typo`. This means "merge MY branch INTO the original repo's main branch." If it shows something else, change it.
2. **The PR description box** is pre-filled with the project's PR template. Fill in each section honestly:
   - **What changed** — one paragraph
   - **Why** — link the issue you're closing (e.g. `Closes #42`)
   - **How tested** — tick the boxes for what you ran
   - **Screenshots** — attach if there's a visible UI change
   - **Type of change** — tick the right category
   - **Checklist** — confirm you read CONTRIBUTING.md, no `any` types, etc.

Click **"Create pull request"**.

The PR now appears on the original repo at `github.com/ddsyasas/llm-wiki/pulls`. The maintainer gets a notification.

---

## Step 9 — Wait for review

How long it takes depends. This is a side project maintained by one person, so:

- Simple fixes (typos, doc updates): usually within a few days
- Bigger PRs (features, refactors): a week or two for the first review
- Brand-new contributor: maintainer might take an extra look — totally normal

What you might see:

- ✅ **Approval + merge** — done. Your PR is merged into `main`, your name shows up in the contributor list.
- 💬 **Comments asking for changes** — maintainer leaves inline notes on specific lines. Address them (see Step 10).
- ❓ **Questions** — they want to understand a decision you made. Reply in the thread.
- ❌ **Rejection** — rare for "what we need" items, but can happen if the PR conflicts with the project direction. Don't take it personally; the design contract is in `docs/01-vision.md`.

---

## Step 10 — Respond to review feedback

If the maintainer requests changes, you don't open a new PR. You **add commits to your existing branch** and they automatically appear in the same PR.

```bash
# Make sure you're still on your branch
git checkout fix/help-page-typo

# Edit the file again to address feedback
# ...

git add apps/web/src/app/help/page.tsx
git commit -m "Address review: rewrite setup paragraph for clarity"
git push origin fix/help-page-typo
```

After the push, the PR auto-updates. The maintainer gets a notification. Click "Re-request review" on the PR if they don't notice within a couple days.

**Don't force-push** unless asked. Force-push rewrites history and makes review threads harder to follow. Just keep adding commits.

When you and the maintainer agree everything's good, they click **"Merge pull request"** on GitHub. The branch is merged into `main`. You're done.

---

## Step 11 — Clean up + celebrate

Optional but tidy:

```bash
# Switch back to main
git checkout main

# Get the latest from the original repo (we'll set this up below if you haven't)
git pull origin main

# Delete your local branch (it's already merged)
git branch -d fix/help-page-typo

# Optionally delete the branch on your fork too (GitHub UI has a "Delete branch" button on the merged PR page)
```

Your name now appears on the contributors list at `github.com/ddsyasas/llm-wiki/graphs/contributors`. Welcome to the project.

---

## Setting up "upstream" — for repeat contributors

If you only ever send one PR, you can skip this section. If you're going to send more, you need a way to keep your fork in sync with the original repo.

When you forked, git only knows about ONE remote (your fork, named `origin`). Add a second remote that points at the original repo:

```bash
git remote add upstream https://github.com/ddsyasas/llm-wiki.git

# Verify both remotes exist
git remote -v
```

You should see:

```
origin    https://github.com/yourname/llm-wiki.git (fetch)
origin    https://github.com/yourname/llm-wiki.git (push)
upstream  https://github.com/ddsyasas/llm-wiki.git (fetch)
upstream  https://github.com/ddsyasas/llm-wiki.git (push)
```

Now you can pull the latest changes from the original repo into your local `main`:

```bash
git checkout main
git pull upstream main
git push origin main   # also update your fork to match
```

Do this before starting any new branch so you're working off the latest code.

---

## Common stumbles + how to fix them

### "I committed to `main` by accident"

Easy fix as long as you haven't pushed yet:

```bash
# Create a branch from your current state (which includes the accidental commit)
git checkout -b fix/whatever-i-was-doing

# Reset main back to where the original repo is
git checkout main
git reset --hard upstream/main

# Switch back to your new branch and continue
git checkout fix/whatever-i-was-doing
```

If you already pushed to your fork's main, force-push to reset your fork's main:

```bash
git checkout main
git reset --hard upstream/main
git push --force origin main
```

(`--force` is normally scary, but you're force-pushing your OWN fork, not the original repo, so the blast radius is just you.)

### "Tests are failing on my PR but not on my laptop"

Possible causes:

- You forgot to commit some files. Run `git status` and check.
- Tests passed locally because of cached state. Try `pnpm install` again and re-run.
- The chokidar live-watch flake (`packages/core/src/sync.test.ts`) — known flaky. Re-run; usually passes on second try.

If it's still failing, comment on the PR with the exact error message and the maintainer will help diagnose.

### "I got merge conflicts"

When your branch was made, `main` was at one state. Now `main` has new commits that conflict with your changes.

```bash
git checkout main
git pull upstream main

git checkout fix/help-page-typo
git rebase main
# Git tells you which files have conflicts. Open each one, find the
# <<<<< / ===== / >>>>> markers, decide which version to keep, save.

git add <the-conflicted-files>
git rebase --continue
git push --force-with-lease origin fix/help-page-typo
```

`--force-with-lease` is the "polite" force-push — it refuses to overwrite if someone else has pushed to your branch in the meantime (saves you from accidents).

### "My commits show the wrong email"

Probably you set up git globally with one email and want a different one for this project. Inside the repo:

```bash
git config user.email "your-correct-email@example.com"
```

This only affects future commits, not past ones. If you've already pushed commits with the wrong email and want to fix them, ask the maintainer for guidance — usually not worth rewriting history.

### "I don't know what to do — am I doing it right?"

Comment on your PR or on the related issue with the question. Maintainer would rather answer a "how do I X?" question than have you guess wrong and need to redo work.

---

## Going further

After your first PR is merged, you've done the hardest part. Future PRs are way easier because:

- You know the local setup works
- You know the workflow
- You know what the PR template expects
- The maintainer knows you and trusts your code

If you find yourself contributing repeatedly:

- Watch the repo (top-right "Watch" button → "All Activity") to get notified of new issues + PRs
- Open an issue suggesting something bigger you'd like to build
- Help triage other people's issues by leaving comments — "this looks related to #42" or "I can't reproduce on macOS — what version of Node are you using?"
- If you become a regular contributor, the maintainer may eventually invite you as a co-maintainer (see CONTRIBUTING.md → "Recognition")

That's how open-source projects sustainably grow.

---

## TL;DR — the commands, in order

For your visual memory:

```bash
# 1. Fork on GitHub (in browser, click "Fork" button)

# 2. Clone your fork
git clone https://github.com/yourname/llm-wiki.git
cd llm-wiki

# 3. Install + verify
pnpm install
pnpm dev   # Ctrl+C when verified

# 4. Create a branch
git checkout -b fix/short-description

# 5. Make changes, then:
pnpm -r exec tsc --noEmit
pnpm --filter @llm-wiki/core test --run

# 6. Commit + push
git add <files>
git commit -m "Clear message"
git push origin fix/short-description

# 7. Open PR (in browser, click "Compare & pull request")

# 8. Address review feedback by adding more commits to the same branch
```

That's the full loop. Welcome to open source.

---

## Questions?

- Read [CONTRIBUTING.md](../CONTRIBUTING.md) for project-specific guidance
- Open a [GitHub Discussion](https://github.com/ddsyasas/llm-wiki/discussions) for general questions
- Comment on an issue or PR if it's specific to that work

Don't email the maintainer with "how do I contribute" questions — the answer is "follow this doc" and a GitHub issue/discussion is more useful (other future contributors can find the answer too).
