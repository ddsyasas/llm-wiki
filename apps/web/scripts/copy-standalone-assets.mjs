#!/usr/bin/env node
// Postbuild step. Next.js standalone output keeps server.js inside
// .next/standalone/apps/web/, but it expects `.next/static/` and `public/` to
// sit alongside it for static asset serving. Next leaves those copies to us.
// See: https://nextjs.org/docs/app/api-reference/next-config-js/output#automatically-copying-traced-files
//
// Second job: copy the native + heavy "external" deps into the standalone
// bundle. Next's nft tracer marks anything listed in
// serverComponentsExternalPackages as "do not bundle" — but in this workspace
// (pnpm + transpilePackages walking into @llm-wiki/core) it ALSO drops them
// from the standalone trace, so the bundle ships without `better-sqlite3` /
// `keytar` / etc. and every request 500s with MODULE_NOT_FOUND. We resolve
// each by walking through the package require graph from this script's
// location, then deep-copy the resolved directory into
// .next/standalone/node_modules/<name>/. After this, `node server.js` finds
// every external package via plain CommonJS resolution.

import { cp, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(SCRIPT_DIR, "..");

// Where the standalone server.js lives. The "apps/web" suffix mirrors the
// workspace's directory layout under outputFileTracingRoot.
const STANDALONE_APP_DIR = join(PACKAGE_DIR, ".next", "standalone", "apps", "web");
const STANDALONE_NODE_MODULES = join(PACKAGE_DIR, ".next", "standalone", "node_modules");

// Keep this list in sync with `serverComponentsExternalPackages` +
// `webpack.externals` in next.config.mjs. Each entry must be the package's
// import name (what `require()` is called with), not a workspace shorthand.
const EXTERNAL_PACKAGES = [
  "better-sqlite3",
  "keytar",
  "chokidar",
  "jsdom",
  "mammoth",
  "officeparser",
  "@mozilla/readability",
  "archiver",
];

const require = createRequire(import.meta.url);

async function dirExists(p) {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  if (!(await dirExists(src))) {
    console.log(`  · skipped (no ${src})`);
    return;
  }
  await cp(src, dest, { recursive: true });
  console.log(`  ✓ copied ${src} → ${dest}`);
}

// Workspace roots where these external packages might live. Most native deps
// belong to `packages/core` (the data layer), not `apps/web`. archiver is
// the lone exception — it's imported directly by an apps/web route.
const REPO_ROOT = resolve(PACKAGE_DIR, "..", "..");
const RESOLVE_FROM = [
  PACKAGE_DIR,
  join(REPO_ROOT, "packages", "core"),
  join(REPO_ROOT, "packages", "ingestion"),
  join(REPO_ROOT, "packages", "llm"),
  REPO_ROOT,
];

// Resolve a package's root directory by walking up from a known internal
// file until we hit a `package.json` whose `name` matches. require.resolve()
// hands us a deep entry point; we want the package root so we can copy the
// whole tree (including `build/`, `bindings/`, the native .node file).
// Tries each workspace root in turn — pnpm hoists deps per-package, so the
// same `require.resolve` from `apps/web` can't reach `packages/core`'s deps.
//
// `extraPaths` is appended to the search roots. Used by the recursive copy
// so transitive deps that live in a parent package's own node_modules (e.g.
// chokidar's `readdirp`) get found.
async function resolvePackageRoot(name, extraPaths = []) {
  let entry = null;
  for (const fromDir of [...extraPaths, ...RESOLVE_FROM]) {
    try {
      entry = require.resolve(`${name}/package.json`, { paths: [fromDir] });
      break;
    } catch {
      // try next root
    }
    try {
      entry = require.resolve(name, { paths: [fromDir] });
      break;
    } catch {
      // try next root
    }
  }
  if (!entry) return null;
  if (entry.endsWith("package.json")) {
    return dirname(entry);
  }
  let dir = dirname(entry);
  for (let i = 0; i < 10; i++) {
    const pkgPath = join(dir, "package.json");
    try {
      const raw = await readFile(pkgPath, "utf8");
      const pkg = JSON.parse(raw);
      if (pkg.name === name) return dir;
    } catch {
      // keep walking
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Copy a package and recursively every dep it declares in its
// package.json. dereference: true follows pnpm's symlinks so the standalone
// tree is portable. The `copied` set prevents cycles + redundant work
// across packages that share transitive deps (lodash, etc.).
async function copyPackageRecursive(name, copied, fromPath = null) {
  if (copied.has(name)) return;
  copied.add(name);

  // When recursing from a parent package, include that package's own dir
  // in the search paths so transitives nested in its node_modules resolve.
  const extraPaths = fromPath ? [fromPath] : [];
  const root = await resolvePackageRoot(name, extraPaths);
  if (!root) {
    console.log(`  · skipped ${name} (not resolvable)`);
    return;
  }
  const realRoot = await realpath(root);
  const dest = join(STANDALONE_NODE_MODULES, name);

  // Scoped names (@mozilla/readability) need their scope dir made first.
  await mkdir(dirname(dest), { recursive: true });
  if (!(await dirExists(dest))) {
    await cp(realRoot, dest, { recursive: true, dereference: true });
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  · ${name} (already present)`);
  }

  // Recurse into runtime deps. devDependencies + peerDependencies are
  // intentionally skipped — the former isn't shipped, the latter is the
  // host app's responsibility (and we already top-level-list anything that
  // applies here).
  let pkg;
  try {
    const raw = await readFile(join(realRoot, "package.json"), "utf8");
    pkg = JSON.parse(raw);
  } catch {
    return;
  }
  const deps = Object.keys(pkg.dependencies ?? {});
  for (const dep of deps) {
    await copyPackageRecursive(dep, copied, realRoot);
  }
}

// Copy external native packages (and all their deps) into
// standalone/node_modules. We resolve the real path (deref pnpm symlinks)
// so the standalone bundle is portable — moving it to another machine
// won't break on a stale .pnpm path.
async function copyExternalPackages() {
  await mkdir(STANDALONE_NODE_MODULES, { recursive: true });
  const copied = new Set();
  for (const name of EXTERNAL_PACKAGES) {
    await copyPackageRecursive(name, copied);
  }
  console.log(`  → ${copied.size} packages total (externals + transitive deps)`);
}

async function main() {
  if (!(await dirExists(STANDALONE_APP_DIR))) {
    console.error(
      `standalone output not found at ${STANDALONE_APP_DIR}; ` +
        `did 'next build' complete with output: 'standalone'?`,
    );
    process.exit(1);
  }
  console.log("Copying standalone assets...");
  await copyDir(join(PACKAGE_DIR, ".next", "static"), join(STANDALONE_APP_DIR, ".next", "static"));
  await copyDir(join(PACKAGE_DIR, "public"), join(STANDALONE_APP_DIR, "public"));
  console.log("Copying external native packages...");
  await copyExternalPackages();
}

await main();
