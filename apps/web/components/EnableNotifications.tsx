"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

/** A small pill prompting the agent to enable desktop notifications. Hidden once
 *  permission is granted/denied or dismissed. Browsers require a user gesture to
 *  request permission, so it can't auto-prompt. */
export function EnableNotifications() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-pill border border-line bg-white px-3 py-2 shadow-card-lg">
      <Bell className="h-4 w-4 text-brand" />
      <span className="text-xs font-medium text-sub">Get desktop alerts for new chats?</span>
      <button
        onClick={async () => { await Notification.requestPermission(); setShow(false); }}
        className="rounded-btn bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
      >
        Enable
      </button>
      <button onClick={() => setShow(false)} className="grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-canvas">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
