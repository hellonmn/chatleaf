import { logger } from "./logger";

/**
 * Optional Sentry integration. We never hard-depend on the SDK: if SENTRY_DSN is
 * set AND `@sentry/node` is installed, errors are forwarded; otherwise
 * captureError just logs (structured). To enable:
 *   npm i @sentry/node   &&   set SENTRY_DSN=...
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sentry: any = null;
let initialised = false;

export async function initSentry(): Promise<void> {
  if (initialised) return;
  initialised = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // Non-literal specifier so TS/bundlers don't try to resolve it at build time.
    const name = ["@sentry", "node"].join("/");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(/* webpackIgnore: true */ name);
    mod.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0,
    });
    sentry = mod;
    logger.info("sentry initialised");
  } catch {
    logger.warn("SENTRY_DSN is set but @sentry/node isn't installed — run `npm i @sentry/node`");
  }
}

/** Report an error to Sentry (if active) and always log it (structured). */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  const e = err instanceof Error ? err : new Error(String(err));
  logger.error(e.message, { ...context, stack: e.stack });
  if (sentry) {
    try {
      sentry.captureException(e, context ? { extra: context } : undefined);
    } catch {
      /* never let error reporting throw */
    }
  }
}
