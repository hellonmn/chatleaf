import { requireActiveContext } from "@/lib/session";
import { prisma } from "@watool/db";
import { canManageOrg } from "@watool/types";
import { revokeInviteAction } from "@/lib/actions/team";
import { InviteForm } from "./InviteForm";

export default async function TeamPage() {
  const ctx = await requireActiveContext();
  const manage = canManageOrg(ctx.role);

  const [members, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { orgId: ctx.orgId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({
      where: { orgId: ctx.orgId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Team</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage who has access to {ctx.orgName}.
        </p>
      </div>

      {manage && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Invite a teammate
          </h2>
          <InviteForm />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          Members ({members.length})
        </h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0"
            >
              <div>
                <div className="text-sm font-medium text-slate-900">
                  {m.user.name ?? m.user.email}
                </div>
                <div className="text-xs text-slate-500">{m.user.email}</div>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {m.role.toLowerCase()}
              </span>
            </div>
          ))}
        </div>
      </section>

      {invites.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            Pending invites ({invites.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    {inv.email}
                  </div>
                  <div className="text-xs text-slate-500">
                    {inv.role.toLowerCase()} · invite link:{" "}
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">
                      /invite/{inv.token.slice(0, 12)}…
                    </code>
                  </div>
                </div>
                {manage && (
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="inviteId" value={inv.id} />
                    <button className="text-xs font-medium text-red-600 hover:underline">
                      Revoke
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
