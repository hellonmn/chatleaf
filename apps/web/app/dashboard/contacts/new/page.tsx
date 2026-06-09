"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { addContactAction, type ActionState } from "@/lib/actions/contacts";
import { SubmitButton } from "@/components/SubmitButton";

const field =
  "mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const label = "block text-sm font-medium text-ink";

export default function NewContactPage() {
  const [state, action] = useActionState<ActionState, FormData>(addContactAction, undefined);

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/dashboard/contacts" className="mb-4 inline-flex items-center gap-1 text-sm text-sub hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Contacts
      </Link>
      <div className="rounded-card border border-line bg-white p-6 shadow-card">
        <h1 className="text-lg font-bold text-ink">Add a contact</h1>
        <p className="mt-0.5 text-sm text-sub">Manually add a lead to your pipeline.</p>

        <form action={action} className="mt-5 space-y-4">
          <div>
            <label className={label} htmlFor="name">Name</label>
            <input id="name" name="name" className={field} placeholder="Priya Sharma" />
          </div>
          <div>
            <label className={label} htmlFor="waId">WhatsApp number</label>
            <input id="waId" name="waId" className={field} placeholder="+91 98201 11223" />
            <p className="mt-1 text-xs text-faint">Include the country code.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="source">Source</label>
              <input id="source" name="source" className={field} placeholder="WhatsApp Ad" />
            </div>
            <div>
              <label className={label} htmlFor="stage">Stage</label>
              <select id="stage" name="stage" defaultValue="NEW" className={field}>
                <option value="NEW">New</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="ENGAGED">Engaged</option>
                <option value="CONVERTED">Converted</option>
              </select>
            </div>
          </div>

          {state?.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}
          <SubmitButton className="w-full">Add contact</SubmitButton>
        </form>
      </div>
    </div>
  );
}
