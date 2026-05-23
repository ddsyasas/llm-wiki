#!/usr/bin/env node
// Postbuild step. Next.js standalone output keeps server.js inside
// .next/standalone/apps/web/, but it expects `.next/static/` and `public/` to
// sit alongside it for static asset serving. Next leaves those copies to us.
// See: https://nextjs.org/docs/app/api-reference/next-config-js/output#automatically-copying-traced-files

import { cp, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(SCRIPT_DIR, "..");

// Where the standalone server.js lives. The "apps/web" suffix mirrors the
// workspace's directory layout under outputFileTracingRoot.
const STANDALONE_APP_DIR = join(PACKAGE_DIR, ".next", "standalone", "apps", "web");

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
}

await main();
