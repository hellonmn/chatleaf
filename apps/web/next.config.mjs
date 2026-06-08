/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship raw TS (main → src/index.ts); Next must transpile them.
  transpilePackages: [
    "@watool/db",
    "@watool/types",
    "@watool/wa",
    "@watool/queue",
    "@watool/processing",
  ],
  // Server-only deps — keep them out of the client/edge bundle.
  serverExternalPackages: ["@prisma/client", "bcryptjs", "bullmq", "ioredis"],
  experimental: {
    // When the app is reached through a tunnel (ngrok), the browser Origin is the
    // tunnel host but the proxied Host header may differ — Next blocks Server
    // Actions on that mismatch. Allow the tunnel host(s) via env (comma-separated,
    // hostnames only, no protocol), e.g. ALLOWED_DEV_ORIGINS="abc123.ngrok-free.app".
    serverActions: {
      allowedOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
  },
};

export default nextConfig;
