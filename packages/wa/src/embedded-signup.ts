/**
 * Meta Embedded Signup — server-side pieces.
 *
 * Flow: the customer authorizes our Meta app in a Facebook popup (client-side
 * FB SDK), which returns a short-lived `code` plus the chosen `waba_id` and
 * `phone_number_id`. We then (server-side):
 *   1. exchange the code for an access token,
 *   2. subscribe our app to that WABA's webhooks,
 *   3. read the number's display details,
 * and store everything (token encrypted). No tokens ever touch the browser.
 */
const GRAPH = "https://graph.facebook.com";

function version(v?: string): string {
  return v ?? process.env.META_GRAPH_API_VERSION ?? "v21.0";
}

async function graphError(res: Response, fallback: string): Promise<never> {
  const json = (await res.json().catch(() => ({}))) as any;
  throw new Error(json?.error?.message ?? `${fallback} (${res.status})`);
}

/** Exchange the Embedded-Signup `code` for a business access token. */
export async function exchangeCodeForToken(opts: {
  code: string;
  appId: string;
  appSecret: string;
  version?: string;
}): Promise<string> {
  const url = new URL(`${GRAPH}/${version(opts.version)}/oauth/access_token`);
  url.searchParams.set("client_id", opts.appId);
  url.searchParams.set("client_secret", opts.appSecret);
  url.searchParams.set("code", opts.code);

  const res = await fetch(url);
  if (!res.ok) return graphError(res, "Token exchange failed");
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("No access_token returned from Meta.");
  return json.access_token;
}

/** Subscribe our app to a WABA so Meta delivers its events to our webhook. */
export async function subscribeAppToWaba(opts: {
  wabaId: string;
  accessToken: string;
  version?: string;
}): Promise<void> {
  const res = await fetch(
    `${GRAPH}/${version(opts.version)}/${opts.wabaId}/subscribed_apps`,
    { method: "POST", headers: { Authorization: `Bearer ${opts.accessToken}` } },
  );
  if (!res.ok) return graphError(res, "Failed to subscribe app to WABA");
}

export type WabaPhoneNumber = {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
};

/** List the phone numbers under a WABA (for display name / quality). */
export async function getWabaPhoneNumbers(opts: {
  wabaId: string;
  accessToken: string;
  version?: string;
}): Promise<WabaPhoneNumber[]> {
  const url = new URL(`${GRAPH}/${version(opts.version)}/${opts.wabaId}/phone_numbers`);
  url.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  if (!res.ok) return graphError(res, "Failed to list phone numbers");
  const json = (await res.json()) as { data?: WabaPhoneNumber[] };
  return json.data ?? [];
}
