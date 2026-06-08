"use client";

import { useActionState } from "react";
import {
  connectWhatsAppAction,
  type ActionState,
  type ConnectValues,
} from "@/lib/actions/whatsapp";
import { SubmitButton } from "@/components/SubmitButton";

const field =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const label = "block text-sm font-medium text-slate-700";

export function ConnectForm({
  defaults,
  hasToken,
}: {
  defaults: ConnectValues;
  hasToken: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    connectWhatsAppAction,
    undefined,
  );

  // Prefer the values the user just submitted (on error), else the saved ones.
  const v = state?.values ?? defaults;

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="wabaId">
            WhatsApp Business Account ID
          </label>
          <input
            id="wabaId"
            name="wabaId"
            className={field}
            placeholder="1029384756"
            defaultValue={v.wabaId ?? ""}
          />
        </div>
        <div>
          <label className={label} htmlFor="phoneNumberId">
            Phone Number ID
          </label>
          <input
            id="phoneNumberId"
            name="phoneNumberId"
            className={field}
            placeholder="1122334455"
            defaultValue={v.phoneNumberId ?? ""}
          />
        </div>
        <div>
          <label className={label} htmlFor="displayNumber">
            Display number
          </label>
          <input
            id="displayNumber"
            name="displayNumber"
            className={field}
            placeholder="+1 555 010 0100"
            defaultValue={v.displayNumber ?? ""}
          />
        </div>
        <div>
          <label className={label} htmlFor="verifiedName">
            Verified business name (optional)
          </label>
          <input
            id="verifiedName"
            name="verifiedName"
            className={field}
            placeholder="Acme Inc."
            defaultValue={v.verifiedName ?? ""}
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="accessToken">
          Access token
        </label>
        <input
          id="accessToken"
          name="accessToken"
          type="password"
          className={field}
          placeholder={hasToken ? "•••••• (leave blank to keep current)" : "EAAG…"}
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-slate-500">
          Stored encrypted (AES-256-GCM).{" "}
          {hasToken
            ? "A token is already saved — only enter a new one to replace it."
            : "Never shown again after saving."}
        </p>
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.ok}
        </p>
      )}

      <SubmitButton>{hasToken ? "Update connection" : "Connect WhatsApp"}</SubmitButton>
    </form>
  );
}
