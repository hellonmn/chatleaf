import { Megaphone, Info, AlertTriangle, Trash2 } from "lucide-react";
import { prisma } from "@watool/db";
import { requirePlatformAdmin } from "@/lib/platform";
import { deleteAnnouncementAction } from "@/lib/actions/admin";
import { SectionCard } from "@/components/ui/Card";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { AnnouncementForm } from "./AnnouncementForm";

export default async function AdminAnnouncementPage() {
  await requirePlatformAdmin();

  const a = await prisma.platformAnnouncement.findUnique({ where: { id: "global" } });
  const message = a?.message ?? "";
  const level = a?.level ?? "info";
  const active = a?.active ?? false;
  const warning = level === "warning";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Announcement banner</h2>
        <p className="mt-0.5 text-sm text-sub">
          Show a global notice across every workspace&apos;s dashboard. Use for
          maintenance windows, outages, or important updates.
        </p>
      </div>

      {/* Live preview */}
      {message && (
        <div>
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-faint">
            Preview {active ? "" : "(currently hidden)"}
          </div>
          <div
            className={`flex items-center gap-2 rounded-card px-4 py-2.5 text-sm ${
              warning ? "bg-warm/15 text-[#9a5a1e]" : "bg-brand-soft text-brand-ink"
            }`}
          >
            {warning ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
            <span>{message}</span>
          </div>
        </div>
      )}

      <SectionCard title="Configure">
        <AnnouncementForm message={message} level={level} active={active} />
      </SectionCard>

      {a && (
        <form action={deleteAnnouncementAction}>
          <ConfirmSubmit
            message="Delete the announcement banner entirely?"
            className="inline-flex items-center gap-1.5 rounded-btn bg-rose/10 px-3 py-1.5 text-sm font-semibold text-rose hover:bg-rose/15"
          >
            <Trash2 className="h-4 w-4" /> Delete announcement
          </ConfirmSubmit>
        </form>
      )}

      <p className="flex items-center gap-1.5 text-xs text-faint">
        <Megaphone className="h-3.5 w-3.5" />
        Appears under the top bar for every signed-in user until you turn it off.
      </p>
    </div>
  );
}
