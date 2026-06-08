import Link from "next/link";
import { requireActiveContext } from "@/lib/session";
import { prisma } from "@watool/db";

export default async function DashboardOverview() {
  const ctx = await requireActiveContext();

  const [memberCount, waAccount] = await Promise.all([
    prisma.membership.count({ where: { orgId: ctx.orgId } }),
    prisma.whatsAppAccount.findFirst({ where: { orgId: ctx.orgId } }),
  ]);

  const steps = [
    {
      title: "Workspace created",
      done: true,
      desc: `${ctx.orgName} is ready.`,
    },
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
      done: false,
      desc: "Coming in Phase 3 — the visual flow builder.",
      soon: true,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-900">
        Welcome{ctx.name ? `, ${ctx.name.split(" ")[0]}` : ""} 👋
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Let&apos;s get your WhatsApp chatbot portal set up.
      </p>

      <div className="mt-6 space-y-3">
        {steps.map((s) => (
          <div
            key={s.title}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${
                  s.done
                    ? "bg-brand text-white"
                    : "border border-slate-300 text-slate-400"
                }`}
              >
                {s.done ? "✓" : ""}
              </span>
              <div>
                <div className="text-sm font-medium text-slate-900">
                  {s.title}
                  {s.soon && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                      soon
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500">{s.desc}</div>
              </div>
            </div>
            {s.href && !s.done && (
              <Link
                href={s.href}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
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
