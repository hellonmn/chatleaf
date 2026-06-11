"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, ExternalLink, Download } from "lucide-react";

// WhatsApp glyph (used in the embed button + preview).
const WA_PATH =
  "M16 .4C7.4.4.4 7.4.4 16c0 2.8.7 5.5 2.1 7.9L.3 31.6l7.9-2.1c2.3 1.3 4.9 1.9 7.6 1.9h.1c8.6 0 15.6-7 15.6-15.6 0-4.2-1.6-8.1-4.6-11C24.1 2 20.2.4 16 .4zm0 28.5h-.1c-2.4 0-4.8-.7-6.9-1.9l-.5-.3-5.1 1.3 1.4-5-.3-.5C3 21.3 2.2 18.7 2.2 16 2.2 8.4 8.4 2.2 16 2.2c3.7 0 7.1 1.4 9.7 4 2.6 2.6 4 6 4 9.7 0 7.6-6.2 13.8-13.7 13.8zm8.4-10.3c-.5-.2-2.7-1.3-3.1-1.5-.4-.2-.7-.2-1 .2-.3.5-1.1 1.3-1.3 1.6-.2.3-.5.3-.9.1-.5-.2-2-.7-3.8-2.3-1.4-1.2-2.3-2.8-2.6-3.2-.3-.5 0-.7.2-.9.2-.2.5-.5.7-.8.2-.3.3-.5.4-.8.1-.3.1-.6 0-.8-.1-.2-1-2.4-1.4-3.3-.4-.9-.7-.7-1-.7h-.8c-.3 0-.8.1-1.2.6-.4.5-1.6 1.5-1.6 3.7s1.6 4.3 1.9 4.6c.2.3 3.2 4.9 7.7 6.8 1.1.5 1.9.8 2.6 1 .9.3 1.7.2 2.4.1.7-.1 2.7-1.1 3.1-2.2.4-1.1.4-2 .3-2.2-.1-.2-.4-.3-.9-.5z";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas"
    >
      {done ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {done ? "Copied" : label}
    </button>
  );
}

export function ChatWidgetTools({ numbers, org }: { numbers: { label: string; digits: string }[]; org: string }) {
  const [digits, setDigits] = useState(numbers[0]!.digits);
  const [message, setMessage] = useState(`Hi ${org}! I'd like to know more.`);
  const [qr, setQr] = useState("");

  const link = `https://wa.me/${digits}${message.trim() ? `?text=${encodeURIComponent(message.trim())}` : ""}`;

  const embed = `<a href="${link}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp" style="position:fixed;right:20px;bottom:20px;z-index:9999;width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#25D366;box-shadow:0 6px 20px rgba(0,0,0,.25)"><svg width="30" height="30" viewBox="0 0 32 32" fill="#fff"><path d="${WA_PATH}"/></svg></a>`;

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 280, color: { dark: "#083f50", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [link]);

  return (
    <div className="space-y-5">
      {/* Builder */}
      <div className="rounded-card border border-line bg-white p-5 shadow-card">
        {numbers.length > 1 && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-ink">WhatsApp number</label>
            <select value={digits} onChange={(e) => setDigits(e.target.value)} className="mt-1 w-full max-w-xs rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand">
              {numbers.map((n) => <option key={n.digits} value={n.digits}>{n.label}</option>)}
            </select>
          </div>
        )}
        <label className="block text-xs font-semibold text-ink">Pre-filled message (optional)</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand" placeholder="Hi! I'd like to know more." />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Link */}
        <div className="rounded-card border border-line bg-white p-5 shadow-card">
          <h2 className="text-sm font-bold text-ink">Click-to-chat link</h2>
          <p className="mt-0.5 text-xs text-sub">Share anywhere — clicking it opens a WhatsApp chat with you.</p>
          <div className="mt-3 break-all rounded-btn bg-canvas px-3 py-2 text-sm text-ink">{link}</div>
          <div className="mt-3 flex gap-2">
            <CopyButton text={link} label="Copy link" />
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas">
              <ExternalLink className="h-4 w-4" /> Test
            </a>
          </div>
        </div>

        {/* QR */}
        <div className="rounded-card border border-line bg-white p-5 shadow-card">
          <h2 className="text-sm font-bold text-ink">QR code</h2>
          <p className="mt-0.5 text-xs text-sub">Print on flyers, packaging, or store displays.</p>
          <div className="mt-3 flex items-center gap-4">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="WhatsApp QR code" className="h-32 w-32 rounded-lg border border-line" />
            ) : (
              <div className="grid h-32 w-32 place-items-center rounded-lg border border-line bg-canvas text-xs text-faint">…</div>
            )}
            {qr && (
              <a href={qr} download="whatsapp-qr.png" className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
                <Download className="h-4 w-4" /> Download
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Embed */}
      <div className="rounded-card border border-line bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink">Website button</h2>
            <p className="mt-0.5 text-xs text-sub">Paste this before <code className="rounded bg-canvas px-1">&lt;/body&gt;</code> for a floating WhatsApp button.</p>
          </div>
          <CopyButton text={embed} label="Copy code" />
        </div>
        <pre className="mt-3 max-h-40 overflow-auto rounded-btn bg-ink/95 p-3 text-[11px] leading-relaxed text-sky-100"><code>{embed}</code></pre>

        {/* live preview */}
        <div className="relative mt-3 h-28 overflow-hidden rounded-card border border-dashed border-line bg-canvas">
          <span className="absolute left-3 top-3 text-[11px] font-semibold text-faint">Preview</span>
          <a href={link} target="_blank" rel="noreferrer" title="Chat on WhatsApp" className="absolute bottom-4 right-4 grid h-14 w-14 place-items-center rounded-full shadow-[0_6px_20px_rgba(0,0,0,.25)]" style={{ background: "#25D366" }}>
            <svg width="30" height="30" viewBox="0 0 32 32" fill="#fff"><path d={WA_PATH} /></svg>
          </a>
        </div>
      </div>
    </div>
  );
}
