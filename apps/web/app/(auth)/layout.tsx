import { MessageCircle, Megaphone, Workflow } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { AuthTabs } from "./AuthTabs";

const FEATURES = [
  { icon: MessageCircle, label: "Shared team inbox across channels" },
  { icon: Megaphone, label: "Broadcasts & campaigns that convert" },
  { icon: Workflow, label: "No-code chatbot automations" },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left — brand panel */}
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        {/* decorative ocean circles */}
        <div className="pointer-events-none absolute -right-16 top-10 h-72 w-72 rounded-full bg-ocean-deep/40" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-ocean-deep/30" />

        <div className="relative">
          <Wordmark size={26} chat="#ffffff" leaf="#2bb3e0" vein="#1c1f2a" />
        </div>

        <div className="relative">
          <h2 className="max-w-md text-4xl font-extrabold leading-[1.1] tracking-tight">
            One inbox for every customer conversation.
          </h2>
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Manage WhatsApp marketing, leads and chatbots for all your clients —
            from a single calm workspace.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.label} className="flex items-center gap-3 text-sm font-medium">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-ocean-light">
                    <Icon className="h-4 w-4" />
                  </span>
                  {f.label}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative text-xs text-white/40">© 2026 Chatleaf · chatleaf.in</div>
      </div>

      {/* Right — form */}
      <div className="flex flex-1 items-center justify-center bg-canvas px-4 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-6">
            <Wordmark size={26} />
          </div>
          <AuthTabs />
          {children}
        </div>
      </div>
    </div>
  );
}
