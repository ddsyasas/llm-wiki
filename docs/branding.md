# Branding

The LLM Wiki visual identity is intentionally minimal — a typographic wordmark, no illustrative mark, two fonts, one accent color. The branding files live in `apps/web/public/` so they're served by the running app and accessible to anyone who clones the repo.

## Files

| File | What it is | When to use it |
|---|---|---|
| [`apps/web/public/logo.svg`](../apps/web/public/logo.svg) | Horizontal wordmark — `[[ LLM Wiki` inline | Header / nav bar / inline contexts where the brand sits next to other content |
| [`apps/web/public/logo-hero.svg`](../apps/web/public/logo-hero.svg) | Stacked wordmark with tagline, 800×400 | README hero, GitHub social preview, npm card, landing pages |
| [`apps/web/public/favicon.svg`](../apps/web/public/favicon.svg) | Just the `[[` mark, square | Browser tab icon, app icon, anywhere only the mark fits |

All three are vector SVG — scale to any size without quality loss. They include a `@media (prefers-color-scheme: dark)` rule so they automatically swap colors on dark backgrounds.

## Design rationale

The mark — `[[` — is the literal opening of a wikilink, the syntax the LLM agent uses when cross-linking pages (`[[grovers-algorithm]]`). It signals what the product does in one symbol: this is a wiki where pages get linked. JetBrains Mono renders it crisply at any size because the brackets are designed for code.

The wordmark — `LLM Wiki` — uses Fraunces, a contemporary serif that reads as "scholarly without being stuffy." Pairs well with the mono mark (geometric vs. humanist) without feeling decorative.

## Colors

| Token | Light theme | Dark theme | Used for |
|---|---|---|---|
| Primary (accent) | `#991b1b` (deep red) | `#f87171` (coral) | The `[[` mark, links, primary CTAs |
| Foreground (text) | `#171717` (near-black) | `#fafaf9` (near-white) | The `LLM Wiki` wordmark, body text |
| Background | `#fafaf9` (near-white) | `#0a0a0a` (near-black) | Page background |

Full color tokens are in [`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css).

## Fonts

| Role | Family | Source | Fallback |
|---|---|---|---|
| Display + wordmark | Fraunces (semibold, opsz auto) | Google Fonts | Georgia, serif |
| Brand mark `[[` | JetBrains Mono (medium / bold) | Google Fonts | Menlo, monospace |
| Body + UI | Inter | Google Fonts | system-ui, sans-serif |
| Body serif | Crimson Pro | Google Fonts | Georgia, serif |

The SVGs reference the Google Fonts CDN inside `<style>` so the typography renders correctly when viewed in a browser. If you use the SVG in a context that can't fetch external resources (e.g. some PDF renderers), the system fallback fonts kick in — still readable, just less brand-faithful.

## Converting to PNG

For places that need raster (favicon variants for older browsers, GitHub social preview card, social media platforms that don't accept SVG):

### Option A — Online converter (easiest)

1. Open https://cloudconvert.com/svg-to-png
2. Upload `logo-hero.svg`
3. Pick the output size you need (1280×640 for GitHub social preview, 1200×630 for Twitter cards, 512×512 for app icons)
4. Download

### Option B — Command-line with ImageMagick

```bash
# Install once
brew install imagemagick                              # macOS
sudo apt install imagemagick                          # Ubuntu/Debian

# Convert the hero logo to a 1280×640 PNG (GitHub social preview)
magick convert apps/web/public/logo-hero.svg \
  -resize 1280x640 \
  apps/web/public/logo-hero-1280.png

# Convert the favicon to a 32×32 PNG
magick convert apps/web/public/favicon.svg \
  -resize 32x32 \
  apps/web/public/favicon-32.png
```

ImageMagick uses its own SVG renderer which may not fetch web fonts — pre-install Fraunces + JetBrains Mono system-wide first if you need full font fidelity, or use Option A.

### Option C — Headless browser (highest fidelity)

If you need pixel-perfect rendering with the actual web fonts, use a headless browser:

```bash
# Install once
npx playwright install chromium

# Render
npx playwright screenshot \
  apps/web/public/logo-hero.svg \
  apps/web/public/logo-hero-1280.png \
  --viewport-size=1280,640
```

This route renders the SVG the same way Chrome does — fonts load from Google, colors are exact.

## Setting the GitHub repo's social preview

GitHub uses a separate image for the link-preview card that shows on Twitter/Slack/LinkedIn when someone shares the repo URL.

1. Generate `logo-hero.png` at 1280×640 (one of the methods above)
2. Open https://github.com/ddsyasas/llm-wiki/settings → scroll to **"Social preview"**
3. Click **"Edit"** → upload the PNG
4. Test by pasting `https://github.com/ddsyasas/llm-wiki` into any social network's preview box

The repo home page itself uses the README's first image (currently the home-page screenshot), so the social preview is a separate, complementary setting.

## In-app usage

The favicon is wired automatically — Next.js looks for `apps/web/public/favicon.svg` (or `favicon.ico`) at the project root and serves it.

To use the wordmark inside the app (e.g. in a marketing landing page or an external page that embeds the brand):

```tsx
<img
  src="/logo.svg"
  alt="LLM Wiki"
  width={280}
  height={64}
/>
```

For React components that need finer control over the wordmark's color/size in different contexts, recreate it inline rather than using the SVG — the SVG bakes in specific font sizes and the in-app version (`apps/web/src/components/app-header.tsx`) can pull the live primary color from CSS variables.

## License

The wordmark + mark are part of the LLM Wiki project and licensed under MIT along with the rest of the codebase. Use freely in articles, blog posts, presentations referencing the project. The only thing we ask: don't modify it to imply endorsement or affiliation of products that aren't actually affiliated.
