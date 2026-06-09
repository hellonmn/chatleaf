"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AuthTabs() {
  const pathname = usePathname();
  const onSignup = pathname.startsWith("/signup");
  const base = "flex-1 rounded-btn px-4 py-2 text-center text-sm font-semibold transition-colors";
  return (
    <div className="mb-6 flex gap-1 rounded-card bg-white/70 p-1">
      <Link href="/login" className={`${base} ${!onSignup ? "bg-white text-ink shadow-card" : "text-sub hover:text-ink"}`}>
        Sign in
      </Link>
      <Link href="/signup" className={`${base} ${onSignup ? "bg-white text-ink shadow-card" : "text-sub hover:text-ink"}`}>
        Create account
      </Link>
    </div>
  );
}
