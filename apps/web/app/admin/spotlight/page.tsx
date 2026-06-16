import { prisma } from "@watool/db";
import { requirePlatformAdmin } from "@/lib/platform";
import { slidesSchema, type Slide } from "@/lib/spotlight-types";
import { SectionCard } from "@/components/ui/Card";
import { SpotlightEditor } from "./SpotlightEditor";

export default async function AdminSpotlightPage() {
  await requirePlatformAdmin();
  const sp = await prisma.spotlight.findUnique({ where: { id: "global" } });
  const parsed = slidesSchema.safeParse(sp?.slidesJSON ?? []);
  const slides: Slide[] = parsed.success ? parsed.data : [];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">What&apos;s new spotlight</h2>
        <p className="mt-0.5 text-sm text-sub">
          Build a deck of slides (new features, tutorials, webinars) shown to users in a
          modal on login. Choose a layout per slide, preview it, then publish.
        </p>
      </div>

      <SectionCard title="Slides">
        <SpotlightEditor initialSlides={slides} initialActive={sp?.active ?? false} />
      </SectionCard>
    </div>
  );
}
