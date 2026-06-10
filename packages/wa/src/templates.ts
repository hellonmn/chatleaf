import { z } from "zod";

/**
 * Fetch message templates for a WABA from Meta's Graph API.
 * GET /{waba_id}/message_templates
 *
 * Templates are created/approved on Meta's side; we mirror them locally so the
 * UI (and, in Phase 4, broadcasts) can use only APPROVED ones.
 */
const GRAPH = "https://graph.facebook.com";

const MetaTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string(),
  category: z.string(),
  status: z.string(), // APPROVED | PENDING | REJECTED | PAUSED | DISABLED | ...
  components: z.array(z.any()).optional().default([]),
});
export type MetaTemplate = z.infer<typeof MetaTemplateSchema>;

const ResponseSchema = z.object({
  data: z.array(MetaTemplateSchema),
  paging: z
    .object({ cursors: z.object({ after: z.string().optional() }).optional() })
    .optional(),
});

export async function fetchMessageTemplates(opts: {
  wabaId: string;
  accessToken: string;
  version?: string;
}): Promise<MetaTemplate[]> {
  const version = opts.version ?? process.env.META_GRAPH_API_VERSION ?? "v21.0";
  const url = new URL(`${GRAPH}/${version}/${opts.wabaId}/message_templates`);
  url.searchParams.set("fields", "id,name,language,category,status,components");
  url.searchParams.set("limit", "200");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const err = json?.error ?? {};
    throw new Error(
      err.message
        ? `Meta: ${err.message}${err.code ? ` (code ${err.code})` : ""}`
        : `Failed to fetch templates (${res.status})`,
    );
  }

  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.data;
}

// ── Create / submit a template ──────────────────────────────────────────────

export type TemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string };

export type CreateTemplateInput = {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  body: string;
  header?: string;
  footer?: string;
  buttons?: TemplateButton[];
  /** Sample values for the {{n}} variables in the body (required by Meta). */
  bodyExample?: string[];
};

/** Build the Meta `components` array — also stored locally so the UI can preview
 *  the template without another round-trip. */
export function buildTemplateComponents(input: CreateTemplateInput): unknown[] {
  const components: Record<string, unknown>[] = [];
  if (input.header?.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: input.header.trim() });
  }
  const body: Record<string, unknown> = { type: "BODY", text: input.body };
  if (input.bodyExample && input.bodyExample.length > 0) {
    body.example = { body_text: [input.bodyExample] };
  }
  components.push(body);
  if (input.footer?.trim()) {
    components.push({ type: "FOOTER", text: input.footer.trim() });
  }
  if (input.buttons && input.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: input.buttons.map((b) =>
        b.type === "URL"
          ? { type: "URL", text: b.text, url: b.url }
          : { type: "QUICK_REPLY", text: b.text },
      ),
    });
  }
  return components;
}

/**
 * Create a message template on Meta and submit it for review.
 * POST /{waba_id}/message_templates → { id, status, category }
 */
export async function createMessageTemplate(
  opts: { wabaId: string; accessToken: string; version?: string } & CreateTemplateInput,
): Promise<{ id: string; status: string; category?: string }> {
  const version = opts.version ?? process.env.META_GRAPH_API_VERSION ?? "v21.0";
  const url = `${GRAPH}/${version}/${opts.wabaId}/message_templates`;
  const components = buildTemplateComponents(opts);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: opts.name,
      language: opts.language,
      category: opts.category,
      components,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const err = json?.error ?? {};
    const detail = err.error_user_msg ? ` — ${err.error_user_msg}` : "";
    throw new Error(
      err.message
        ? `Meta: ${err.message}${detail}${err.code ? ` (code ${err.code})` : ""}`
        : `Failed to create template (${res.status})`,
    );
  }
  return { id: json.id, status: json.status ?? "PENDING", category: json.category };
}
