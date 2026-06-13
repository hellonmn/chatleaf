import Link from "next/link";
import {
  Rocket,
  MessageCircle,
  Workflow,
  Users,
  UserPlus,
  CheckCircle2,
  ChevronRight,
  X,
  type LucideIcon,
} from "lucide-react";
import { prisma, type Role } from "@watool/db";
import { canManageOrg } from "@watool/types";
import { Card } from "@/components/ui/Card";
import { dismissOnboardingAction } from "@/lib/actions/onboarding";

type Step = {
  key: string;
  title: string;
  desc: string;
  href: string;
  cta: string;
  icon: LucideIcon;
  done: boolean;
};

/**
 * First-run setup checklist shown at the top of the dashboard overview. Visible
 * only to owners/admins (the people who can complete the steps). Each step's
 * "done" flag is derived from real data, so checkmarks appear automatically as
 * the org is set up. Hides itself once every step is done, or when an
 * owner/admin dismisses it (persisted on OrgSettings).
 */
export async function OnboardingChecklist({
  orgId,
  role,
}: {
  orgId: string;
  role: Role;
}) {
  if (!canManageOrg(role)) return null;

  const [settings, waConnected, flows, contacts, members, pendingInvites] =
    await Promise.all([
      prisma.orgSettings.findUnique({
        where: { orgId },
        select: { onboardingDismissedAt: true },
      }),
      prisma.whatsAppAccount.count({ where: { orgId, status: "CONNECTED" } }),
      prisma.flow.count({ where: { orgId } }),
      prisma.contact.count({ where: { orgId } }),
      prisma.membership.count({ where: { orgId } }),
      prisma.invite.count({ where: { orgId, acceptedAt: null } }),
    ]);

  if (settings?.onboardingDismissedAt) return null;

  const steps: Step[] = [
    {
      key: "whatsapp",
      title: "Connect WhatsApp",
      desc: "Link your WhatsApp Business number so you can send and receive messages.",
      href: "/dashboard/settings/whatsapp",
      cta: "Connect",
      icon: MessageCircle,
      done: waConnected > 0,
    },
    {
      key: "flow",
      title: "Build your first automation",
      desc: "Create a no-code chatbot flow to reply and qualify leads automatically.",
      href: "/dashboard/flows",
      cta: "Build",
      icon: Workflow,
      done: flows > 0,
    },
    {
      key: "contacts",
      title: "Add your contacts",
      desc: "Import a CSV or add contacts to start broadcasts and conversations.",
      href: "/dashboard/contacts",
      cta: "Add",
      icon: Users,
      done: contacts > 0,
    },
    {
      key: "team",
      title: "Invite your team",
      desc: "Bring teammates into the shared inbox to handle chats together.",
      href: "/dashboard/team",
      cta: "Invite",
      icon: UserPlus,
      done: members > 1 || pendingInvites > 0,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null; // all set — hide automatically

  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-4 border-b border-line p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <Rocket className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-ink">Get started with Chatleaf</h3>
            <span className="rounded-pill bg-canvas px-2 py-0.5 text-xs font-semibold text-sub">
              {doneCount} of {steps.length}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-sub">
            A few quick steps to get your workspace live.
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <form action={dismissOnboardingAction}>
          <button
            type="submit"
            title="Dismiss setup checklist"
            aria-label="Dismiss setup checklist"
            className="grid h-8 w-8 place-items-center rounded-btn text-faint hover:bg-canvas hover:text-sub"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      </div>

      <div className="divide-y divide-line">
        {steps.map((s) => {
          const Icon = s.icon;
          if (s.done) {
            return (
              <div key={s.key} className="flex items-center gap-3 px-5 py-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <span className="flex-1 text-sm font-semibold text-faint line-through">
                  {s.title}
                </span>
                <span className="text-xs font-semibold text-emerald-600">Done</span>
              </div>
            );
          }
          return (
            <Link
              key={s.key}
              href={s.href}
              className="group flex items-center gap-3 px-5 py-3.5 hover:bg-canvas"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{s.title}</div>
                <div className="truncate text-sm text-sub">{s.desc}</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-btn bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-ink group-hover:bg-brand/15">
                {s.cta}
                <ChevronRight className="h-4 w-4" />
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
