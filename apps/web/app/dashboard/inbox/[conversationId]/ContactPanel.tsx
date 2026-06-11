import Link from "next/link";
import { X, Phone, Mail, UserPlus, MessageCircle } from "lucide-react";
import { removeTagAction } from "@/lib/actions/contacts";
import { ContactTagForm } from "@/components/ContactTagForm";
import { avatarColor } from "@/lib/avatar";
import { NotesForm } from "./NotesForm";
import { AssignControl } from "./AssignControl";

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
  stage: string;
  notes: string | null;
  contactTags: { tagId: string; tag: { name: string } }[];
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line px-5 py-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{title}</h3>
      {children}
    </div>
  );
}

export function ContactPanel({
  contact,
  conversationId,
  assignedUserId,
  members,
}: {
  contact: PanelContact;
  conversationId: string;
  assignedUserId: string | null;
  members: { id: string; name: string }[];
}) {
  const name = contact.name ?? contact.phone ?? contact.waId;
  const color = avatarColor(name + contact.waId);

  return (
    <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-line bg-white lg:flex">
      {/* Identity */}
      <div className="flex flex-col items-center border-b border-line p-5 text-center">
        <span className="relative">
          <span className="grid h-16 w-16 place-items-center rounded-full text-lg font-bold text-white" style={{ background: color }}>
            {name.slice(0, 2).toUpperCase()}
          </span>
          <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#25D366]" />
        </span>
        <div className="mt-2 text-base font-bold text-ink">{name}</div>
        <div className="text-sm text-sub">{contact.phone ?? "+" + contact.waId}</div>
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
      </div>

      <Section title="Assigned to">
        <AssignControl conversationId={conversationId} assignedUserId={assignedUserId} members={members} />
      </Section>

      <Section title="Lifecycle stage">
        <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold ${STAGE_PILL[contact.stage] ?? STAGE_PILL.NEW}`}>
          {contact.stage.toLowerCase()} lead
        </span>
      </Section>

      <Section title="Tags">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {contact.contactTags.length === 0 && <span className="text-xs text-faint">No tags</span>}
          {contact.contactTags.map((ct) => (
            <span key={ct.tagId} className="inline-flex items-center gap-1 rounded-pill bg-warm/15 px-2 py-0.5 text-xs font-semibold text-[#c47a2e]">
              {ct.tag.name}
              <form action={removeTagAction} className="inline">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="tagId" value={ct.tagId} />
                <button className="text-[#c9a36a] hover:text-rose"><X className="h-3 w-3" /></button>
              </form>
            </span>
          ))}
          <span className="text-xs font-semibold text-brand"><ContactTagForm contactId={contact.id} /></span>
        </div>
      </Section>

      <Section title="Channel">
        <span className="inline-flex items-center gap-1.5 text-sm text-ink">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[#25D366] text-white">
            <MessageCircle className="h-3 w-3" />
          </span>
          WhatsApp
        </span>
      </Section>

      <div className="px-5 py-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Notes</h3>
        <NotesForm contactId={contact.id} notes={contact.notes} />
      </div>
    </aside>
  );
}
