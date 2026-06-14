"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ShieldCheck, ShieldOff } from "lucide-react";
import {
  updateProfileAction,
  changePasswordAction,
  confirmTwoFactorAction,
  disableTwoFactorAction,
  startTwoFactorAction,
  type AccountState,
} from "@/lib/actions/account";
import { SubmitButton } from "@/components/SubmitButton";

const field =
  "w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const label = "mb-1 block text-xs font-semibold text-sub";
const card = "rounded-card border border-line bg-white p-5 shadow-card space-y-3";

function Note({ s }: { s: AccountState }) {
  if (s?.error) return <p className="rounded-md bg-rose/10 px-3 py-2 text-sm text-rose">{s.error}</p>;
  if (s?.ok) return <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{s.ok}</p>;
  return null;
}

export function AccountClient({
  name,
  email,
  twoFactorEnabled,
}: {
  name: string;
  email: string;
  twoFactorEnabled: boolean;
}) {
  return (
    <div className="space-y-5">
      <ProfileSection name={name} email={email} />
      <PasswordSection />
      <TwoFactorSection enabled={twoFactorEnabled} />
    </div>
  );
}

function ProfileSection({ name, email }: { name: string; email: string }) {
  const [state, action] = useActionState<AccountState, FormData>(updateProfileAction, undefined);
  return (
    <form action={action} className={card}>
      <h3 className="text-base font-bold text-ink">Profile</h3>
      <div>
        <label className={label}>Name</label>
        <input name="name" defaultValue={name} className={field} />
      </div>
      <div>
        <label className={label}>Email</label>
        <input name="email" type="email" defaultValue={email} className={field} />
      </div>
      <Note s={state} />
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}

function PasswordSection() {
  const [state, action] = useActionState<AccountState, FormData>(changePasswordAction, undefined);
  return (
    <form action={action} className={card}>
      <h3 className="text-base font-bold text-ink">Password</h3>
      <div>
        <label className={label}>Current password</label>
        <input name="currentPassword" type="password" autoComplete="current-password" className={field} />
      </div>
      <div>
        <label className={label}>New password</label>
        <input name="newPassword" type="password" autoComplete="new-password" placeholder="At least 8 characters" className={field} />
      </div>
      <Note s={state} />
      <SubmitButton>Change password</SubmitButton>
    </form>
  );
}

function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmState, confirmAction] = useActionState<AccountState, FormData>(confirmTwoFactorAction, undefined);
  const [disableState, disableAction] = useActionState<AccountState, FormData>(disableTwoFactorAction, undefined);

  useEffect(() => {
    // Reflect the new state in the server component after a successful change.
    if (confirmState?.ok || disableState?.ok) router.refresh();
  }, [confirmState?.ok, disableState?.ok, router]);

  async function start() {
    setStarting(true);
    try {
      const { secret, otpauthUrl } = await startTwoFactorAction();
      setSecret(secret);
      setQr(await QRCode.toDataURL(otpauthUrl));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className={card}>
      <div className="flex items-center gap-2">
        <h3 className="text-base font-bold text-ink">Two-factor authentication</h3>
        {enabled && (
          <span className="inline-flex items-center gap-1 rounded-pill bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <ShieldCheck className="h-3 w-3" /> On
          </span>
        )}
      </div>
      <p className="-mt-1 text-sm text-sub">
        Add a one-time code from an authenticator app (Google Authenticator, Authy…) at sign-in.
      </p>

      {enabled ? (
        <form action={disableAction} className="space-y-2">
          <label className={label}>Enter a current code to turn off 2FA</label>
          <input name="code" inputMode="numeric" placeholder="6-digit code" className={`${field} max-w-[180px]`} />
          <Note s={disableState} />
          <button className="inline-flex items-center gap-1.5 rounded-btn border border-rose/30 bg-rose/5 px-3 py-2 text-sm font-semibold text-rose hover:bg-rose/10">
            <ShieldOff className="h-4 w-4" /> Disable 2FA
          </button>
        </form>
      ) : !qr ? (
        <button
          onClick={start}
          disabled={starting}
          className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60"
        >
          <ShieldCheck className="h-4 w-4" /> {starting ? "Generating…" : "Set up 2FA"}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="2FA QR code" className="h-40 w-40 rounded-lg border border-line" />
            <div className="text-sm text-sub">
              <p>Scan with your authenticator app, or enter this key manually:</p>
              <code className="mt-1 inline-block break-all rounded bg-canvas px-2 py-1 text-xs">{secret}</code>
            </div>
          </div>
          <form action={confirmAction} className="space-y-2">
            <label className={label}>Enter the 6-digit code to finish</label>
            <input name="code" inputMode="numeric" placeholder="6-digit code" autoFocus className={`${field} max-w-[180px]`} />
            <Note s={confirmState} />
            <SubmitButton>Verify &amp; enable</SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
