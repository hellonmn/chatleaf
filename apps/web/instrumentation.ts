/**
 * Next.js runs this once when the server starts (the official startup hook).
 * We use it to initialise Sentry (no-op unless SENTRY_DSN is set). Guarded to
 * the Node.js runtime so it never runs on the Edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initSentry } = await import("@watool/observability");
    await initSentry();
  }
}
