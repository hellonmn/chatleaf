import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { prisma } from "@watool/db";

export default async function DashboardOverview() {
  const ctx = await requireActiveContext();

  const [memberCount, waAccount, publishedFlows] = await Promise.all([
    prisma.membership.count({ where: { orgId: ctx.orgId } }),
    prisma.whatsAppAccount.findFirst({ where: { orgId: ctx.orgId } }),
    prisma.flow.count({ where: { orgId: ctx.orgId, status: "PUBLISHED" } }),
  ]);

  const steps = [
    { title: "Workspace created", done: true, desc: `${ctx.orgName} is ready.` },
    {
      title: "Invite your team",
      done: memberCount > 1,
      desc: "Add teammates as agents or admins.",
      href: "/dashboard/team",
      cta: "Invite",
    },
    {
      title: "Connect WhatsApp",
      done: !!waAccount,
      desc: "Link your WhatsApp Business number via the Meta Cloud API.",
      href: "/dashboard/settings/whatsapp",
      cta: "Connect",
    },
    {
      title: "Build your first chatbot",
      done: publishedFlows > 0,
      desc: "Design a no-code flow on the canvas and publish it.",
      href: "/dashboard/flows",
      cta: "Build",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-3 text-sm font-semibold text-sub">Get set up</h2>
      <div className="space-y-3">
        {steps.map((s) => (
          <div
            key={s.title}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start gap-3">
              {s.done ? (
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
              ) : (
                <Circle className="mt-0.5 h-6 w-6 shrink-0 text-slate-300" />
              )}
              <div>
                <div className="text-sm font-medium text-slate-900">{s.title}</div>
                <div className="text-sm text-slate-500">{s.desc}</div>
              </div>
            </div>
            {s.href && !s.done && (
              <Link
                href={s.href}
                className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
              >
                {s.cta}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
