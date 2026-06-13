import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Protects the dashboard and the platform-admin area. Unauthenticated users
 * hitting /dashboard/* or /admin/* are bounced to /login. Platform-admin rights
 * are enforced in the /admin layout (it needs the DB). Auth.js v5 exposes
 * `auth` as middleware directly.
 */
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const path = req.nextUrl.pathname;
  const isProtected = path.startsWith("/dashboard") || path.startsWith("/admin");

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
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
