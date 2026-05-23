/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@llm-wiki/core", "@llm-wiki/ingestion", "@llm-wiki/llm"],
};

export default nextConfig;
