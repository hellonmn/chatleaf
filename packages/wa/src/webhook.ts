import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Verify Meta's `X-Hub-Signature-256` header against the RAW request body.
 * Meta signs `sha256=<hex>` with HMAC-SHA256 using the app secret. We MUST
 * verify on the exact bytes received (not re-serialized JSON) or it won't match.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const computed = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(computed, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

// ── Inbound payload schemas (the subset we act on) ─────────────────────────

const InboundMessageSchema = z.object({
  from: z.string(), // sender wa id (phone, no +)
  id: z.string(), // wa message id
  timestamp: z.string(),
  type: z.string(), // text | image | interactive | button | ...
  text: z.object({ body: z.string() }).optional(),
  image: z.object({ id: z.string(), mime_type: z.string().optional(), caption: z.string().optional() }).optional(),
  video: z.object({ id: z.string(), mime_type: z.string().optional(), caption: z.string().optional() }).optional(),
  audio: z.object({ id: z.string(), mime_type: z.string().optional() }).optional(),
  document: z
    .object({
      id: z.string(),
      mime_type: z.string().optional(),
      filename: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
  sticker: z.object({ id: z.string(), mime_type: z.string().optional() }).optional(),
  interactive: z
    .object({
      type: z.string(),
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
  button: z.object({ text: z.string(), payload: z.string() }).optional(),
});
export type InboundMessage = z.infer<typeof InboundMessageSchema>;

const StatusSchema = z.object({
  id: z.string(), // wa message id this status refers to
  status: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: z.string(),
  recipient_id: z.string(),
  errors: z
    .array(z.object({ code: z.number(), title: z.string() }).passthrough())
    .optional(),
});
export type WaStatus = z.infer<typeof StatusSchema>;

const ChangeValueSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  metadata: z.object({
    display_phone_number: z.string().optional(),
    phone_number_id: z.string(),
  }),
  contacts: z
    .array(
      z.object({
        wa_id: z.string(),
        profile: z.object({ name: z.string() }).optional(),
      }),
    )
    .optional(),
  messages: z.array(InboundMessageSchema).optional(),
  statuses: z.array(StatusSchema).optional(),
});

export const WhatsAppWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(), // WABA id
      changes: z.array(
        z.object({
          field: z.string(),
          value: ChangeValueSchema,
        }),
      ),
    }),
  ),
});
export type WhatsAppWebhook = z.infer<typeof WhatsAppWebhookSchema>;

/** A flattened, easy-to-process unit extracted from the nested webhook payload. */
export type NormalizedChange = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  contactName?: string;
  messages: InboundMessage[];
  statuses: WaStatus[];
};

/**
 * Flatten entry[].changes[] into per-change units keyed by phone_number_id, so
 * the worker can map each to a tenant without re-walking the nested structure.
 */
export function normalizeWebhook(payload: WhatsAppWebhook): NormalizedChange[] {
  const out: NormalizedChange[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const v = change.value;
      out.push({
        wabaId: entry.id,
        phoneNumberId: v.metadata.phone_number_id,
        displayPhoneNumber: v.metadata.display_phone_number,
        contactName: v.contacts?.[0]?.profile?.name,
        messages: v.messages ?? [],
        statuses: v.statuses ?? [],
      });
    }
  }
  return out;
}

/** Best-effort human-readable text from any inbound message type. */
export function extractInboundText(m: InboundMessage): string | undefined {
  if (m.type === "text") return m.text?.body;
  if (m.type === "interactive") {
    return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
  }
  if (m.type === "button") return m.button?.text;
  return undefined;
}
