import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { timeAgo } from "@/lib/format";
import {
  removeTagAction,
  removeAttributeAction,
  setOptInAction,
} from "@/lib/actions/contacts";
import { TagForm } from "./TagForm";
import { AttributeForm } from "./AttributeForm";

const OPTIN_OPTIONS = ["UNKNOWN", "OPTED_IN", "OPTED_OUT"] as const;

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const ctx = await requireActiveContext();
  const { contactId } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId: ctx.orgId },
    include: {
      contactTags: { include: { tag: true } },
      conversations: {
        orderBy: { lastMessageAt: "desc" },
        take: 1,
        select: { id: true, status: true, lastMessageAt: true },
      },
    },
  });
  if (!contact) notFound();

  const attributes = Object.entries(
    (contact.attributes as Record<string, unknown>) ?? {},
  );
  const convo = contact.conversations[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/contacts" className="text-slate-400 hover:text-slate-600">
          ←
        </Link>
        <div className="grid h-11 w-11 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand-ink">
          {(contact.name ?? contact.waId).slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            {contact.name ?? contact.phone ?? contact.waId}
          </h1>
          <div className="text-xs text-slate-500">
            {contact.waId}
            {contact.lastInboundAt ? ` · last seen ${timeAgo(contact.lastInboundAt)}` : ""}
          </div>
        </div>
        {convo && (
          <Link
            href={`/dashboard/inbox/${convo.id}`}
            className="ml-auto rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Open conversation
          </Link>
        )}
      </div>

      {/* Opt-in */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Opt-in status</h2>
        <div className="flex gap-2">
          {OPTIN_OPTIONS.map((opt) => (
            <form key={opt} action={setOptInAction}>
              <input type="hidden" name="contactId" value={contact.id} />
              <input type="hidden" name="status" value={opt} />
              <button
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
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
        <p className="mt-2 text-xs text-slate-400">
          Marketing broadcasts may only go to opted-in contacts (Meta policy).
        </p>
      </section>

      {/* Tags */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Tags</h2>
          <TagForm contactId={contact.id} />
        </div>
        <div className="flex flex-wrap gap-2">
          {contact.contactTags.length === 0 && (
            <span className="text-sm text-slate-400">No tags yet.</span>
          )}
          {contact.contactTags.map((ct) => (
            <span
              key={ct.tagId}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
            >
              {ct.tag.name}
              <form action={removeTagAction} className="inline">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="tagId" value={ct.tagId} />
                <button className="text-slate-400 hover:text-red-600">×</button>
              </form>
            </span>
          ))}
        </div>
      </section>

      {/* Custom attributes */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Attributes</h2>
          <AttributeForm contactId={contact.id} />
        </div>
        {attributes.length === 0 ? (
          <span className="text-sm text-slate-400">No attributes yet.</span>
        ) : (
          <div className="divide-y divide-slate-100">
            {attributes.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-slate-500">{k}</span>
                <span className="flex items-center gap-2">
                  <span className="text-slate-900">{String(v)}</span>
                  <form action={removeAttributeAction} className="inline">
                    <input type="hidden" name="contactId" value={contact.id} />
                    <input type="hidden" name="key" value={k} />
                    <button className="text-slate-400 hover:text-red-600">×</button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
