import { requirePlatformAdmin } from "@/lib/platform";
import { LogsTable } from "./LogsTable";

export default async function AdminLogsPage() {
  await requirePlatformAdmin();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Request logs</h2>
        <p className="mt-0.5 text-sm text-sub">
          Live view of routes being hit across the app (like ngrok&apos;s inspector).
          Kept in memory — recent requests only, single instance.
        </p>
      </div>
      <LogsTable />
    </div>
  );
}
