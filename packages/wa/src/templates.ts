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
