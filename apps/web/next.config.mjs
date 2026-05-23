/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@llm-wiki/core", "@llm-wiki/ingestion", "@llm-wiki/llm"],
  experimental: {
    serverComponentsExternalPackages: ["keytar", "better-sqlite3", "chokidar"],
  },
  // transpilePackages walks our workspace libs and tries to bundle every
  // import they reach — including the native .node binaries inside keytar
  // and better-sqlite3. Marking those packages as server externals leaves
  // the require() call to be resolved by Node at runtime instead of by
  // webpack at build time.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(externals) ? externals : [externals]),
        {
          keytar: "commonjs keytar",
          "better-sqlite3": "commonjs better-sqlite3",
          chokidar: "commonjs chokidar",
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
