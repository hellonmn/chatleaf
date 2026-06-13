import { Lock } from "lucide-react";

/** Shown in place of a feature's page when an admin has turned it off. */
export function FeatureDisabled({ name }: { name: string }) {
  return (
    <div className="mx-auto max-w-md rounded-card border border-line bg-white p-10 text-center shadow-card">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-canvas text-faint">
        <Lock className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-bold text-ink">{name} is unavailable</h2>
      <p className="mt-1 text-sm text-sub">
        This feature has been turned off by the administrator.
      </p>
    </div>
  );
}
