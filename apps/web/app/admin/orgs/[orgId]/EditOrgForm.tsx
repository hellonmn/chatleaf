"use client";

import { useActionState } from "react";
import { updateOrgAction, type EditOrgState } from "@/lib/actions/admin";

const field =
  "w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export function EditOrgForm({
  orgId,
  name,
  slug,
  seatOverride,
  planSeats,
  gstin,
}: {
  orgId: string;
  name: string;
  slug: string;
  seatOverride: number | null;
  planSeats: number;
  gstin: string | null;
}) {
  const [state, action] = useActionState<EditOrgState, FormData>(updateOrgAction, undefined);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orgId" value={orgId} />
      <div>
        <label className="mb-1 block text-xs font-semibold text-sub">Name</label>
        <input name="name" defaultValue={name} className={field} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-sub">Slug</label>
        <input name="slug" defaultValue={slug} className={field} />
        <p className="mt-1 text-xs text-faint">Lowercase letters, numbers and dashes. Must be unique.</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-sub">Seat limit override</label>
        <input
          name="seatOverride"
          type="number"
          min={1}
          defaultValue={seatOverride ?? ""}
          placeholder={`Plan default: ${planSeats}`}
          className={field}
        />
        <p className="mt-1 text-xs text-faint">Leave blank to use the plan&apos;s default seat limit.</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-sub">Buyer GSTIN</label>
        <input name="gstin" defaultValue={gstin ?? ""} placeholder="22AAAAA0000A1Z5" className={field} />
        <p className="mt-1 text-xs text-faint">Shown on the org&apos;s tax invoices.</p>
      </div>

      {state?.error && (
        <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>
      )}

      <button className="rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
        Save changes
      </button>
    </form>
  );
}
