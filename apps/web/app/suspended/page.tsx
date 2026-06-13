import { ShieldAlert, LogOut } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { signOutAction } from "@/lib/actions/signout";

/**
 * Shown when a signed-in user's active org has been suspended by a platform
 * admin. Deliberately does NOT call requireActiveContext (which would redirect
 * back here in a loop).
 */
export default function SuspendedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-6">
        <Wordmark size={28} />
      </div>
      <div className="w-full max-w-md rounded-card border border-line bg-white p-8 text-center shadow-card">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose/10 text-rose">
          <ShieldAlert className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-ink">Workspace suspended</h1>
        <p className="mt-2 text-sm text-sub">
          Access to this workspace has been paused. If you think this is a
          mistake, please contact support to get it restored.
        </p>
        <form action={signOutAction} className="mt-6">
          <button className="inline-flex items-center gap-2 rounded-btn border border-line px-4 py-2 text-sm font-semibold text-sub hover:bg-canvas">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
