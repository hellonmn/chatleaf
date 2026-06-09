import Link from "next/link";
import { X, ExternalLink, Phone, Mail, UserPlus, MessageCircle } from "lucide-react";
import { removeTagAction, setOptInAction } from "@/lib/actions/contacts";
import { ContactTagForm } from "@/components/ContactTagForm";
import { timeAgo } from "@/lib/format";

const OPTIN_OPTIONS = ["UNKNOWN", "OPTED_IN", "OPTED_OUT"] as const;

const STAGE_PILL: Record<string, string> = {
  NEW: "bg-canvas text-sub",
  QUALIFIED: "bg-[#e6f1fb] text-[#3179a8]",
  ENGAGED: "bg-warm/15 text-[#c47a2e]",
  CONVERTED: "bg-brand-soft text-brand-ink",
};

type PanelContact = {
  id: string;
  name: string | null;
  waId: string;
  phone: string | null;
  optInStatus: string;
  stage: string;
  lastInboundAt: Date | null;
  attributes: unknown;
  contactTags: { tagId: string; tag: { name: string } }[];
};

export function ContactPanel({ contact }: { contact: PanelContact }) {
  const name = contact.name ?? contact.phone ?? contact.waId;
  const attributes = Object.entries(
    (contact.attributes as Record<string, unknown>) ?? {},
  );

  return (
    <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white lg:flex">
      {/* Identity */}
      <div className="flex flex-col items-center border-b border-slate-100 p-5 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-brand/10 text-lg font-semibold text-brand-ink">
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-900">{name}</div>
        <div className="text-xs text-slate-500">+{contact.waId}</div>
        {contact.lastInboundAt && (
          <div className="mt-0.5 text-[11px] text-slate-400">
            last seen {timeAgo(contact.lastInboundAt)}
          </div>
        )}
        {/* Quick actions */}
        <div className="mt-3 flex items-center gap-2">
          <a href={`tel:+${contact.waId}`} className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-brand hover:bg-brand/15" title="Call">
            <Phone className="h-4 w-4" />
          </a>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-brand opacity-60" title="Email">
            <Mail className="h-4 w-4" />
          </span>
          <Link href={`/dashboard/contacts/${contact.id}`} className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-brand hover:bg-brand/15" title="Full profile">
            <UserPlus className="h-4 w-4" />
          </Link>
        </div>
        <Link
          href={`/dashboard/contacts/${contact.id}`}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-dark hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Full profile
        </Link>
      </div>

      {/* Lifecycle stage */}
      <div className="border-b border-slate-100 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Lifecycle stage</h3>
        <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold ${STAGE_PILL[contact.stage] ?? STAGE_PILL.NEW}`}>
          {contact.stage.toLowerCase()} lead
        </span>
      </div>

      {/* Channel */}
      <div className="border-b border-slate-100 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Channel</h3>
        <span className="inline-flex items-center gap-1.5 text-sm text-ink">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white">
            <MessageCircle className="h-3 w-3" />
          </span>
          WhatsApp
        </span>
      </div>

      {/* Opt-in */}
      <div className="border-b border-slate-100 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Opt-in
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {OPTIN_OPTIONS.map((opt) => (
            <form key={opt} action={setOptInAction}>
              <input type="hidden" name="contactId" value={contact.id} />
              <input type="hidden" name="status" value={opt} />
              <button
                className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                  contact.optInStatus === opt
                    ? "bg-brand text-white"
                    : "border border-slate-300 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {opt.replace("_", " ").toLowerCase()}
              </button>
            </form>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="border-b border-slate-100 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Tags
        </h3>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {contact.contactTags.length === 0 && (
            <span className="text-xs text-slate-400">No tags</span>
          )}
          {contact.contactTags.map((ct) => (
            <span
              key={ct.tagId}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
            >
              {ct.tag.name}
              <form action={removeTagAction} className="inline">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="tagId" value={ct.tagId} />
                <button className="text-slate-400 hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </form>
            </span>
          ))}
        </div>
        <ContactTagForm contactId={contact.id} />
      </div>

      {/* Attributes (collected by flows) */}
      <div className="p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Details
        </h3>
        {attributes.length === 0 ? (
          <span className="text-xs text-slate-400">
            No saved details yet. Flows that ask questions store answers here.
          </span>
        ) : (
          <dl className="space-y-1.5">
            {attributes.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 text-xs">
                <dt className="text-slate-500">{k}</dt>
                <dd className="truncate font-medium text-slate-800">{String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </aside>
  );
}
