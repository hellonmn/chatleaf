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
  serverExternalPackages: ["@prisma/client", "bcryptjs", "bullmq", "ioredis", "@anthropic-ai/sdk"],
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
      // Server Actions default to a 1 MB body — far too small for media uploads.
      // Match the 16 MB upload guard in sendMediaReplyAction.
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
