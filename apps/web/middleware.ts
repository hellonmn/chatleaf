import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { isAdminIpAllowed, ipFromHeaders } from "@/lib/ip-allowlist";

// Build an edge-safe NextAuth instance from the lightweight config so the
// Node-only Credentials provider (bcrypt/prisma/crypto) never reaches the edge.
const { auth } = NextAuth(authConfig);

/**
 * Protects the dashboard and the platform-admin area. Unauthenticated users
 * hitting /dashboard/* or /admin/* are bounced to /login. Platform-admin rights
 * are enforced in the /admin layout (it needs the DB). Auth.js v5 exposes
 * `auth` as middleware directly.
 */
export default auth(async (req) => {
  const isLoggedIn = !!req.auth;
  const path = req.nextUrl.pathname;
  const isAdmin = path.startsWith("/admin");
  const isProtected = path.startsWith("/dashboard") || isAdmin;

  // Request log for the admin inspector. On in dev; in production set
  // REQUEST_LOG=on to enable. Awaited so the write reliably lands (edge
  // fire-and-forget gets dropped). Note: in-memory + single-instance.
  if (process.env.NODE_ENV !== "production" || process.env.REQUEST_LOG === "on") {
    try {
      await fetch(new URL("/api/request-log", req.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: req.method,
          path,
          ts: Date.now(),
          ua: req.headers.get("user-agent") ?? undefined,
          ip: ipFromHeaders(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip")) ?? undefined,
        }),
      }).catch(() => {});
    } catch {
      /* never let logging break a request */
    }
  }

  // IP allowlist for the admin area (no-op unless ADMIN_IP_ALLOWLIST is set).
  if (isAdmin) {
    const ip = ipFromHeaders(
      req.headers.get("x-forwarded-for"),
      req.headers.get("x-real-ip"),
    );
    if (!isAdminIpAllowed(ip)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  if (isProtected && !isLoggedIn) {
    // Clone the incoming URL so the redirect stays on the host the user is on
    // (e.g. an ngrok tunnel), rather than a reconstructed/localhost origin.
    const url = req.nextUrl.clone();
    const from = url.pathname;
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("from", from);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  // Run on everything (so the inspector sees all routes) except static assets
  // and the log endpoint itself (which would loop).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/request-log).*)"],
};
