<!--
Thanks for contributing to LLM Wiki!

Please fill in the sections below. PRs that don't follow this template may get
pushed back with "please fill in the template" — not personal, just keeps
review tractable.

See CONTRIBUTING.md for the full guidance: https://github.com/ddsyasas/llm-wiki/blob/main/CONTRIBUTING.md
-->

## What changed

<!-- One paragraph. What does this PR do? -->

## Why

<!-- Link the issue this closes (e.g. "Closes #123"). If there's no issue, explain why this change is worth merging. -->

Closes #

## How tested

<!-- Tick everything that applies. Add detail for any manual testing. -->

- [ ] `pnpm -r exec tsc --noEmit` passes (typecheck)
- [ ] `pnpm --filter @llm-wiki/core test --run` passes
- [ ] `pnpm --filter @llm-wiki/llm test --run` passes
- [ ] `pnpm --filter @llm-wiki/ingestion test --run` passes
- [ ] Added new tests for the change (describe what they cover)
- [ ] Manually tested in the browser (describe the steps)

## Screenshots

<!-- If this changes any visible UI, include before/after screenshots. Drag-and-drop into this textarea. Skip if no UI change. -->

## Type of change

<!-- Tick one or more. -->

- [ ] 🐛 Bug fix (non-breaking change that fixes broken behavior)
- [ ] 💡 New feature (non-breaking change that adds functionality)
- [ ] 📖 Documentation only
- [ ] 🧹 Refactor / cleanup (no functional change)
- [ ] 🧪 Test additions
- [ ] 💥 Breaking change (changes wiki on-disk format, CLI flag semantics, or API route shape)

## Compatibility

<!-- Only fill in if you ticked "breaking change" above. -->

- **Wiki on-disk format**: unchanged / changed (describe)
- **CLI flags**: unchanged / changed (describe)
- **API route shape**: unchanged / changed (describe)
- **Migration needed**: no / yes (describe)

## Checklist before requesting review

- [ ] I've read [CONTRIBUTING.md](https://github.com/ddsyasas/llm-wiki/blob/main/CONTRIBUTING.md) and my change fits the project direction
- [ ] My code follows the conventions in [CLAUDE.md](https://github.com/ddsyasas/llm-wiki/blob/main/CLAUDE.md) (TypeScript strict, named exports, kebab-case files, why-not-what comments)
- [ ] No `any` types added without a comment explaining why
- [ ] No new dependencies added without discussing first (or, deps added are justified in the "Why" section above)
- [ ] No telemetry, analytics, or remote-storage code added
- [ ] If this PR adds a feature, I've updated the relevant `docs/` file(s) and/or in-app `/help` page

## Anything else for the reviewer

<!-- Tricky parts, design tradeoffs you considered, things you weren't sure about. -->
