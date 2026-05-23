import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // "standalone" produces a self-contained server bundle in .next/standalone/.
  // The CLI's `start` command prefers that bundle for production installs and
  // falls back to `next dev` from the workspace when it isn't present.
  output: "standalone",
  transpilePackages: ["@llm-wiki/core", "@llm-wiki/ingestion", "@llm-wiki/llm"],
  experimental: {
    // In a monorepo, file-tracing for standalone defaults to the package dir
    // and misses workspace siblings. Point it at the repo root so @llm-wiki/*
    // and the native deps get correctly bundled. (In Next 14.2 this still
    // lives under `experimental`; it graduates in 15.)
    outputFileTracingRoot: resolve(__dirname, "../.."),
    serverComponentsExternalPackages: [
      "keytar",
      "better-sqlite3",
      "chokidar",
      "jsdom",
      "mammoth",
      "officeparser",
    ],
  },
  // transpilePackages walks our workspace libs and tries to bundle every
  // import they reach — including the native .node binaries inside keytar
  // and better-sqlite3 plus the giant DOM emulations inside jsdom etc.
  // Marking those packages as server externals leaves the require() call
  // to be resolved by Node at runtime instead of by webpack at build time.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(externals) ? externals : [externals]),
        {
          keytar: "commonjs keytar",
          "better-sqlite3": "commonjs better-sqlite3",
          chokidar: "commonjs chokidar",
          jsdom: "commonjs jsdom",
          mammoth: "commonjs mammoth",
          officeparser: "commonjs officeparser",
          "@mozilla/readability": "commonjs @mozilla/readability",
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
