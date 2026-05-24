#!/usr/bin/env node
// Assembles a clean, publishable npm tarball in apps/web/dist-publish/.
//
// Why this exists: the source package.json depends on @llm-wiki/* via
// `workspace:*`. `pnpm publish` rewrites those at publish time but only if
// the workspace packages are ALSO being published — which we don't want for
// V1 (the user just wants one published package, not four). Standalone
// builds inline every workspace dep into .next/standalone/, so the
// published tarball doesn't need them at all.
//
// What this script produces:
//   apps/web/dist-publish/
//     package.json        ← clean, no workspace:* deps, only runtime deps
//     README.md
//     LICENSE
//     bin/llm-wiki.mjs
//     .next/standalone/   ← the built server bundle (+ external native deps)
//     .next/static/       ← already inside standalone after copy-assets ran
//     public/             ← same
//
// Then: `cd dist-publish && pnpm pack` (or `npm pack`) produces a tarball.
// Or `cd dist-publish && npm publish --access public` to publish to npm.

import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(PACKAGE_DIR, "..", "..");
const DIST_DIR = join(PACKAGE_DIR, "dist-publish");

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  return JSON.parse(await readFile(p, "utf8"));
}

// Packages the published tarball declares as runtime dependencies (so
// `npm install -g @syasas/llm-wiki` pulls them on the user's machine, which
// gets the right prebuilt binary per platform). Same list as
// serverComponentsExternalPackages in next.config.mjs minus archiver (which
// is pure JS but heavy — keeping it in the bundle is fine, and it's used
// by exactly one route).
//
// Native (must NOT be bundled — bundling locks the tarball to one OS):
//   - better-sqlite3 (.node binary, per-platform)
//   - keytar         (.node binary, per-platform)
//
// Pure JS but with optional native sub-deps (fsevents on macOS for chokidar):
//   - chokidar
//
// Heavy pure-JS extractors we leave to npm install to avoid bloat + keep
// the tarball minimal:
//   - jsdom, mammoth, officeparser, @mozilla/readability
const PUBLISHED_RUNTIME_PACKAGES = [
  "better-sqlite3",
  "keytar",
  "chokidar",
  "jsdom",
  "mammoth",
  "officeparser",
  "@mozilla/readability",
];

// Build the publishable package.json. Strips:
//   - workspace:* deps (everything's in the standalone bundle)
//   - build-time deps (React, Next, Tailwind, etc — all bundled)
//   - devDependencies + scripts (not relevant to consumers)
// Keeps:
//   - `open` for the CLI's browser auto-launch
//   - PUBLISHED_RUNTIME_PACKAGES (see comment above) so npm install fetches
//     the right per-platform binary at install time. Crucial for cross-OS
//     support — bundling these locks the tarball to one OS+arch.
// Sets:
//   - public-facing name (`@syasas/llm-wiki`, per docs/09) instead of the
//     internal workspace name (`@llm-wiki/web`)
//   - description / homepage / repository / bugs / keywords for npmjs.com
function buildPublishablePackageJson(src, packageJsonByName) {
  const runtimeDeps = {
    open: src.dependencies?.open ?? "^10.2.0",
  };
  for (const name of PUBLISHED_RUNTIME_PACKAGES) {
    const pkg = packageJsonByName.get(name);
    if (pkg?.version) {
      // Pin to the major (caret range) so users get patch + minor updates
      // for free but stay on the same major we've tested against.
      runtimeDeps[name] = `^${pkg.version}`;
    }
  }
  return {
    name: "@syasas/llm-wiki",
    version: src.version,
    description:
      "A personal Wikipedia an LLM maintains for you. Local-first, BYOK, single CLI.",
    license: src.license ?? "MIT",
    author: src.author ?? "Yasas",
    repository: {
      type: "git",
      url: "https://github.com/ddsyasas/llm-wiki.git",
    },
    homepage: "https://github.com/ddsyasas/llm-wiki#readme",
    bugs: { url: "https://github.com/ddsyasas/llm-wiki/issues" },
    keywords: [
      "llm",
      "wiki",
      "knowledge-base",
      "markdown",
      "local-first",
      "openrouter",
      "claude",
      "gpt",
      "karpathy",
      "cli",
    ],
    bin: src.bin,
    engines: src.engines ?? { node: ">=20.0.0" },
    // Postinstall prints a friendly welcome banner with next-step commands.
    // Banner-only — no network, no file writes — so the security surface is
    // identical to running a vanilla CLI.
    scripts: {
      postinstall: "node bin/postinstall.mjs",
    },
    dependencies: runtimeDeps,
    files: [
      "bin",
      ".next/standalone",
      ".next/static",
      "public",
      "README.md",
      "LICENSE",
    ],
  };
}

// Flatten the .pnpm/ store into top-level node_modules entries. The source
// standalone tree relies on pnpm's symlink graph (set up at `pnpm install`
// time) to resolve packages from .pnpm/ to top-level paths. That graph
// doesn't survive `cp { dereference: true }` + `npm pack`, so requires from
// inside `next/dist/server/...` fail to find their peer deps (styled-jsx
// etc.). Walk every `.pnpm/<pkg>@<version>/node_modules/<pkg>/` and copy it
// to `node_modules/<pkg>/` if no top-level entry exists. Already-present
// entries (the externals we explicitly copied earlier) win — they're real
// dirs by construction. Scoped names (@org/pkg) get their scope dir
// created first.
async function flattenPnpmStore(nodeModulesDir) {
  const pnpmDir = join(nodeModulesDir, ".pnpm");
  let groups;
  try {
    groups = await readdir(pnpmDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let promoted = 0;
  for (const group of groups) {
    if (!group.isDirectory() || group.name.startsWith(".")) continue;
    const innerDir = join(pnpmDir, group.name, "node_modules");
    let entries;
    try {
      entries = await readdir(innerDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      // Inside `.pnpm/<group>/node_modules/` there's the package itself plus
      // its direct deps (as symlinks). We only promote regular directories
      // matching the group's package name — the rest will be handled when
      // we walk THEIR .pnpm groups.
      if (!entry.isDirectory()) continue;
      const packageName = entry.name.startsWith("@")
        ? // scoped: <scope>/<pkg> — readdir gives us the scope dir, recurse
          null
        : entry.name;
      if (entry.name.startsWith("@")) {
        // Scoped namespace dir — iterate inside it.
        const scopeInner = join(innerDir, entry.name);
        const scopedEntries = await readdir(scopeInner, { withFileTypes: true });
        for (const scoped of scopedEntries) {
          if (!scoped.isDirectory()) continue;
          const fullName = `${entry.name}/${scoped.name}`;
          const dest = join(nodeModulesDir, fullName);
          if (await fileExists(dest)) continue;
          await mkdir(dirname(dest), { recursive: true });
          await cp(join(scopeInner, scoped.name), dest, {
            recursive: true,
            dereference: true,
          });
          promoted++;
        }
        continue;
      }
      const dest = join(nodeModulesDir, packageName);
      if (await fileExists(dest)) continue;
      await cp(join(innerDir, entry.name), dest, {
        recursive: true,
        dereference: true,
      });
      promoted++;
    }
  }
  return promoted;
}

async function main() {
  // Sanity: standalone bundle must exist.
  const standaloneServer = join(PACKAGE_DIR, ".next", "standalone", "apps", "web", "server.js");
  if (!(await fileExists(standaloneServer))) {
    console.error(
      `Standalone server not found at ${standaloneServer}.\n` +
        `Run 'pnpm --filter @llm-wiki/web build' first.`,
    );
    process.exit(1);
  }

  console.log("Building publishable tarball directory...");

  // Clean slate.
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  // Discover the on-disk version of each runtime-published package by
  // reading its package.json from the source standalone bundle. Used to
  // pin the published dependency range to whatever we actually tested
  // against, not whatever floats by next time `npm install` runs upstream.
  const standaloneNm = join(PACKAGE_DIR, ".next", "standalone", "node_modules");
  const packageJsonByName = new Map();
  for (const name of PUBLISHED_RUNTIME_PACKAGES) {
    try {
      const pkg = await readJson(join(standaloneNm, name, "package.json"));
      packageJsonByName.set(name, pkg);
    } catch {
      // Will be silently omitted from runtimeDeps — the script logs a
      // warning below so it doesn't slip past the operator.
    }
  }
  for (const name of PUBLISHED_RUNTIME_PACKAGES) {
    if (!packageJsonByName.has(name)) {
      console.warn(
        `  ⚠ ${name} not found in standalone node_modules — skipping runtime dep. ` +
          `Did copy-standalone-assets.mjs run?`,
      );
    }
  }

  // Rewritten package.json.
  const srcPkg = await readJson(join(PACKAGE_DIR, "package.json"));
  const pubPkg = buildPublishablePackageJson(srcPkg, packageJsonByName);
  await writeFile(
    join(DIST_DIR, "package.json"),
    JSON.stringify(pubPkg, null, 2) + "\n",
    "utf8",
  );
  console.log(`  ✓ package.json (${Object.keys(pubPkg.dependencies).length} runtime deps)`);

  // CLI bin + postinstall banner.
  await mkdir(join(DIST_DIR, "bin"), { recursive: true });
  await cp(join(PACKAGE_DIR, "bin", "llm-wiki.mjs"), join(DIST_DIR, "bin", "llm-wiki.mjs"));
  await cp(join(PACKAGE_DIR, "bin", "postinstall.mjs"), join(DIST_DIR, "bin", "postinstall.mjs"));
  console.log("  ✓ bin/llm-wiki.mjs + bin/postinstall.mjs");

  // Standalone bundle (server.js + standalone/node_modules + everything).
  // The .next/static and public dirs were already copied INTO the standalone
  // tree by copy-standalone-assets.mjs, so we just need to mirror the whole
  // standalone/ subtree into the published .next/standalone/.
  await mkdir(join(DIST_DIR, ".next"), { recursive: true });
  await cp(
    join(PACKAGE_DIR, ".next", "standalone"),
    join(DIST_DIR, ".next", "standalone"),
    { recursive: true, dereference: true },
  );
  console.log("  ✓ .next/standalone/");

  // Flatten the standalone node_modules so packages buried in .pnpm/ are
  // also accessible via plain Node resolution from top-level. Without this,
  // require('styled-jsx/package.json') from inside Next's bundled server
  // 500s on every request, even though the package's files are on disk.
  const promoted = await flattenPnpmStore(
    join(DIST_DIR, ".next", "standalone", "node_modules"),
  );
  console.log(`  ✓ flattened ${promoted} pnpm packages to top-level`);

  // Strip the externalized packages out of the bundle. They're declared as
  // runtime deps in the published package.json, so `npm install` pulls them
  // on the user's machine — which gets the correct prebuilt native binary
  // for that platform. Bundling them here would lock the tarball to one
  // OS+arch (whatever this build host happens to be).
  //
  // We delete both the top-level node_modules/<name>/ AND the .pnpm/<name>@*
  // store entry, otherwise the resolver could still load the bundled (wrong-
  // arch) copy via the pnpm path.
  const distNm = join(DIST_DIR, ".next", "standalone", "node_modules");
  let stripped = 0;
  for (const name of PUBLISHED_RUNTIME_PACKAGES) {
    const topLevel = join(distNm, name);
    if (await fileExists(topLevel)) {
      await rm(topLevel, { recursive: true, force: true });
      stripped++;
    }
    // Walk .pnpm/ for any group matching this name@... and remove.
    const pnpmDir = join(distNm, ".pnpm");
    try {
      const groups = await readdir(pnpmDir);
      for (const group of groups) {
        // pnpm store dirs look like `<name>@<version>[_<peer>]`.
        // For scoped packages, `@` is encoded as `+`: `@mozilla+readability@...`.
        const pnpmEncoded = name.replace("/", "+");
        if (group.startsWith(`${pnpmEncoded}@`)) {
          await rm(join(pnpmDir, group), { recursive: true, force: true });
        }
      }
    } catch {
      // No .pnpm dir, nothing to clean.
    }
  }
  console.log(`  ✓ stripped ${stripped} per-platform packages from bundle`);

  // .next/static at the published-package root (some Next versions expect
  // it there in addition to inside standalone). Cheap to ship both — the
  // dir is small (~hundreds of KB), and the alternative is a confusing
  // "works locally, breaks once published" failure mode.
  if (await fileExists(join(PACKAGE_DIR, ".next", "static"))) {
    await cp(
      join(PACKAGE_DIR, ".next", "static"),
      join(DIST_DIR, ".next", "static"),
      { recursive: true, dereference: true },
    );
    console.log("  ✓ .next/static/");
  }

  // Public assets at the published-package root.
  if (await fileExists(join(PACKAGE_DIR, "public"))) {
    await cp(
      join(PACKAGE_DIR, "public"),
      join(DIST_DIR, "public"),
      { recursive: true, dereference: true },
    );
    console.log("  ✓ public/");
  }

  // README from repo root, license from repo root.
  for (const f of ["README.md", "LICENSE"]) {
    const src = join(REPO_ROOT, f);
    if (await fileExists(src)) {
      await cp(src, join(DIST_DIR, f));
      console.log(`  ✓ ${f}`);
    }
  }

  console.log("");
  console.log(`Done. Next steps:`);
  console.log(`  Local test:  cd ${DIST_DIR} && npm pack`);
  console.log(`  Publish:     cd ${DIST_DIR} && npm publish --access public`);
}

await main();
