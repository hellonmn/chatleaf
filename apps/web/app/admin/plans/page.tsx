import { requirePlatformAdmin } from "@/lib/platform";
import { getPlanConfigs } from "@/lib/plan-config";
import { SectionCard } from "@/components/ui/Card";
import { PlanConfigForm } from "./PlanConfigForm";

export default async function AdminPlansPage() {
  await requirePlatformAdmin();
  const configs = Object.values(await getPlanConfigs());

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Plans</h2>
        <p className="mt-0.5 text-sm text-sub">
          Edit pricing, limits, and Razorpay plan ids per tier — applied live across
          every workspace, no deploy needed.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {configs.map((c) => (
          <SectionCard key={c.plan} title={`${c.label} (${c.plan})`}>
            <PlanConfigForm config={c} />
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
