import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Protects the dashboard. Unauthenticated users hitting /dashboard/* are
 * bounced to /login. Auth.js v5 exposes `auth` as middleware directly.
 */
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard");

  if (isDashboard && !isLoggedIn) {
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
  matcher: ["/dashboard/:path*"],
};
