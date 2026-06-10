import { redirect } from "next/navigation";
import { prisma } from "@watool/db";
import { canManageOrg } from "@watool/types";
import { requireActiveContext } from "@/lib/session";
import { HoursForm } from "./HoursForm";

export const metadata = { title: "Business hours — Chatleaf" };

type Day = { enabled: boolean; open: string; close: string };
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Mon–Fri 9–6, weekends off. */
function defaultHours(): Record<string, Day> {
  const out: Record<string, Day> = {};
  for (const k of DAY_KEYS) {
    const weekend = k === "sat" || k === "sun";
    out[k] = { enabled: !weekend, open: "09:00", close: "18:00" };
  }
  return out;
}

export default async function BusinessHoursPage() {
  const ctx = await requireActiveContext();
  if (!canManageOrg(ctx.role)) redirect("/dashboard");

  const s = await prisma.orgSettings.findUnique({ where: { orgId: ctx.orgId } });

  const stored = (s?.hoursJSON as Record<string, Day> | undefined) ?? {};
  const base = defaultHours();
  const hours: Record<string, Day> = {};
  for (const k of DAY_KEYS) hours[k] = stored[k] ?? base[k]!;

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-1">
      <div>
        <h1 className="text-xl font-bold text-ink">Business hours</h1>
        <p className="mt-1 text-sm text-sub">
          Set when your team is available, and auto-reply to anyone who messages after hours.
        </p>
      </div>
      <HoursForm
        timezone={s?.timezone ?? "Asia/Kolkata"}
        awayEnabled={s?.awayEnabled ?? false}
        awayMessage={s?.awayMessage ?? "Thanks for your message! 🌿 Our team is away right now — we'll get back to you during business hours."}
        hours={hours}
      />
    </div>
  );
}
