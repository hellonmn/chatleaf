import { requirePlatformAdmin } from "@/lib/platform";
import { getPlatformSettings } from "@/lib/platform-settings";
import { SectionCard } from "@/components/ui/Card";
import { PlatformSettingsForm } from "./PlatformSettingsForm";

export default async function AdminSettingsPage() {
  await requirePlatformAdmin();
  const settings = await getPlatformSettings();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Platform settings</h2>
        <p className="mt-0.5 text-sm text-sub">
          White-label branding and feature flags applied across every workspace.
        </p>
      </div>

      <SectionCard title="Configuration">
        <PlatformSettingsForm settings={settings} />
      </SectionCard>
    </div>
  );
}
