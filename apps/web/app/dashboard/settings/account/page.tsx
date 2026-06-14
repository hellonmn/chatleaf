import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { AccountClient } from "./AccountClient";

export default async function AccountPage() {
  const ctx = await requireActiveContext();
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { name: true, email: true, twoFactorEnabled: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Your account</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your profile, password, and security.</p>
      </div>
      <AccountClient
        name={user?.name ?? ""}
        email={user?.email ?? ctx.email}
        twoFactorEnabled={user?.twoFactorEnabled ?? false}
      />
    </div>
  );
}
