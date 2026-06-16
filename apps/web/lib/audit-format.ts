/** Presentation metadata for audit actions — shared by the audit page and org detail. */
export const ACTION_META: Record<string, { label: string; tone: string }> = {
  "org.plan.change": { label: "Plan changed", tone: "bg-sky/15 text-sky" },
  "org.update": { label: "Org edited", tone: "bg-sky/15 text-sky" },
  "org.notes.update": { label: "Notes updated", tone: "bg-slate-100 text-slate-600" },
  "platform.announcement": { label: "Announcement", tone: "bg-violet/15 text-violet" },
  "spotlight.save": { label: "Spotlight updated", tone: "bg-violet/15 text-violet" },
  "platform.settings": { label: "Platform settings", tone: "bg-violet/15 text-violet" },
  "plan.config": { label: "Plan edited", tone: "bg-sky/15 text-sky" },
  "coupon.save": { label: "Coupon saved", tone: "bg-sky/15 text-sky" },
  "coupon.delete": { label: "Coupon deleted", tone: "bg-rose/10 text-rose" },
  "org.suspend": { label: "Suspended", tone: "bg-warm/15 text-[#c47a2e]" },
  "org.unsuspend": { label: "Unsuspended", tone: "bg-brand-soft text-brand-ink" },
  "org.delete": { label: "Deleted org", tone: "bg-rose/10 text-rose" },
  "user.admin.grant": { label: "Granted admin", tone: "bg-ink text-white" },
  "user.admin.revoke": { label: "Revoked admin", tone: "bg-slate-100 text-slate-600" },
  "user.password.reset": { label: "Password reset", tone: "bg-sky/15 text-sky" },
  "user.disable": { label: "Deactivated user", tone: "bg-rose/10 text-rose" },
  "user.enable": { label: "Reactivated user", tone: "bg-brand-soft text-brand-ink" },
  "user.delete": { label: "Deleted user", tone: "bg-rose/10 text-rose" },
  "org.impersonate.start": { label: "Started impersonation", tone: "bg-violet/15 text-violet" },
  "org.impersonate.stop": { label: "Stopped impersonation", tone: "bg-slate-100 text-slate-600" },
};

export function actionMeta(action: string): { label: string; tone: string } {
  return ACTION_META[action] ?? { label: action, tone: "bg-slate-100 text-slate-600" };
}

/** Short human summary of an audit row's metadata (e.g. "FREE → PRO"). */
export function summarizeMetadata(
  action: string,
  metadata: unknown,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  if (action === "org.plan.change" && m.from && m.to) {
    return `${String(m.from)} → ${String(m.to)}`;
  }
  if (action === "org.delete" && m.plan) {
    return `was ${String(m.plan)}`;
  }
  return null;
}
