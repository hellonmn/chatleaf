import { Wallet as WalletIcon } from "lucide-react";
import { prisma } from "@watool/db";
import { requirePlatformAdmin } from "@/lib/platform";
import { Card } from "@/components/ui/Card";
import { WalletAdjustForm } from "./WalletAdjustForm";

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default async function AdminWalletsPage() {
  await requirePlatformAdmin();

  const orgs = await prisma.org.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      wallet: { select: { balancePaise: true, updatedAt: true } },
    },
    orderBy: { name: "asc" },
    take: 500,
  });

  const totalLiability = orgs.reduce((sum, o) => sum + (o.wallet?.balancePaise ?? 0), 0);
  const funded = orgs.filter((o) => (o.wallet?.balancePaise ?? 0) > 0).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Wallets</h2>
        <p className="mt-0.5 text-sm text-sub">
          Prepaid balances across all workspaces. Credit or debit manually for refunds,
          bonuses, or corrections.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-faint">Total balance (liability)</div>
          <div className="mt-1 text-2xl font-extrabold text-ink">{rupees(totalLiability)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-faint">Funded wallets</div>
          <div className="mt-1 text-2xl font-extrabold text-ink">{funded}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-faint">Workspaces</div>
          <div className="mt-1 text-2xl font-extrabold text-ink">{orgs.length}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        {orgs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-faint">No workspaces yet.</div>
        ) : (
          <div className="divide-y divide-line">
            {orgs.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-ink">
                  <WalletIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-ink">{o.name}</div>
                  <div className="truncate text-xs text-faint">
                    {o.slug}
                    {o.wallet?.updatedAt ? ` · updated ${o.wallet.updatedAt.toLocaleDateString("en-IN")}` : " · no wallet yet"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-faint">Balance</div>
                  <div className="text-sm font-extrabold text-ink">{rupees(o.wallet?.balancePaise ?? 0)}</div>
                </div>
                <WalletAdjustForm orgId={o.id} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
