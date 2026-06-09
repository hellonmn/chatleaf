"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Script from "next/script";
import { Loader2 } from "lucide-react";
import { completeEmbeddedSignupAction } from "@/lib/actions/embedded-signup";

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID ?? "";
const GRAPH_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION ?? "v21.0";

type FbWindow = Window & {
  FB?: {
    init: (o: Record<string, unknown>) => void;
    login: (cb: (r: any) => void, opts: Record<string, unknown>) => void;
  };
};

export function EmbeddedSignup() {
  // The WABA + phone id arrive via a postMessage; the code arrives via FB.login.
  const session = useRef<{ waba_id?: string; phone_number_id?: string }>({});
  const [ready, setReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      ) {
        return;
      }
      try {
        const data = JSON.parse(event.data);
        if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          session.current = {
            waba_id: data.data?.waba_id,
            phone_number_id: data.data?.phone_number_id,
          };
        }
      } catch {
        /* not our message */
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function initFb() {
    (window as FbWindow).FB?.init({
      appId: APP_ID,
      autoLogAppEvents: true,
      xfbml: false,
      version: GRAPH_VERSION,
    });
    setReady(true);
  }

  function launch() {
    const FB = (window as FbWindow).FB;
    if (!FB) {
      setMsg({ kind: "err", text: "Facebook SDK still loading — try again in a moment." });
      return;
    }
    setMsg(null);
    FB.login(
      (response: any) => {
        const code = response?.authResponse?.code;
        const { waba_id, phone_number_id } = session.current;
        if (!code) {
          setMsg({ kind: "err", text: "Signup was cancelled." });
          return;
        }
        if (!waba_id || !phone_number_id) {
          setMsg({ kind: "err", text: "Meta didn't return a number — please retry." });
          return;
        }
        startTransition(async () => {
          const res = await completeEmbeddedSignupAction({
            code,
            wabaId: waba_id,
            phoneNumberId: phone_number_id,
          });
          setMsg(res.error ? { kind: "err", text: res.error } : { kind: "ok", text: res.ok ?? "Connected." });
        });
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: "3" },
      },
    );
  }

  return (
    <div className="space-y-3">
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="afterInteractive"
        onLoad={initFb}
      />
      <button
        onClick={launch}
        disabled={pending || !ready}
        className="inline-flex items-center gap-2 rounded-md bg-[#1877F2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0f66d0] disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
          </svg>
        )}
        Connect with Facebook
      </button>
      {!ready && <p className="text-xs text-slate-400">Loading Facebook…</p>}
      {msg && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            msg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
