/**
 * Verifies media handling: upload → resolve → download, the payload extractor,
 * and window-gated media sends. Mocks Meta. Run: npm run verify-media -w @watool/worker
 */
import {
  uploadMedia,
  getMediaUrl,
  downloadMedia,
  extractMediaRef,
  mediaKindFromMime,
  createWhatsAppClient,
  WindowClosedError,
} from "@watool/wa";

const json = (o: unknown) =>
  new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });

let sendCalls = 0;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u.includes("/messages")) {
    sendCalls++;
    return json({ messaging_product: "whatsapp", messages: [{ id: "wamid.M" }] });
  }
  if (u.endsWith("/media") && method === "POST") return json({ id: "MEDIA_ID" });
  if (u.includes("lookaside.fbsbx.com")) {
    return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/png" } });
  }
  // getMediaUrl: GET /{mediaId}
  return json({ url: "https://lookaside.fbsbx.com/file", mime_type: "image/png", file_size: 4 });
}) as typeof fetch;

function assert(c: unknown, m: string) { if (!c) throw new Error("ASSERT FAILED: " + m); console.log("✓ " + m); }

async function main() {
  // mime → kind
  assert(mediaKindFromMime("image/png") === "image", "image mime → image kind");
  assert(mediaKindFromMime("application/pdf") === "document", "pdf mime → document kind");
  assert(mediaKindFromMime("video/mp4") === "video", "video mime → video kind");

  // extractor: inbound (id+caption), document (filename), flow (link), text (null)
  const inbound = extractMediaRef({ image: { id: "I1", mime_type: "image/png", caption: "hi" } });
  assert(inbound?.kind === "image" && inbound.id === "I1" && inbound.caption === "hi", "extract inbound image by id");
  const doc = extractMediaRef({ document: { id: "D1", filename: "report.pdf" } });
  assert(doc?.kind === "document" && doc.filename === "report.pdf", "extract document with filename");
  const linkMedia = extractMediaRef({ image: { link: "https://x/y.png" } });
  assert(linkMedia?.link === "https://x/y.png" && !linkMedia.id, "extract flow media by link");
  assert(extractMediaRef({ text: { body: "hi" } }) === null, "text payload → no media ref");

  // upload → resolve → download
  const id = await uploadMedia({ phoneNumberId: "PN", accessToken: "t", data: new Uint8Array([9, 9]), mimeType: "image/png", filename: "a.png" });
  assert(id === "MEDIA_ID", "uploadMedia returns media id");
  const resolved = await getMediaUrl(id, "t");
  assert(resolved.url.includes("lookaside") && resolved.mimeType === "image/png", "getMediaUrl resolves url + mime");
  const dl = await downloadMedia(resolved.url, "t");
  assert(dl.bytes.byteLength === 4 && dl.contentType === "image/png", "downloadMedia returns bytes + content-type");

  // window-gated sends
  const client = createWhatsAppClient({ phoneNumberId: "PN", accessToken: "t" });
  const open = new Date(Date.now() + 3_600_000);
  const r1 = await client.sendMediaById("15551230000", "image", "MEDIA_ID", "cap", open);
  assert(r1.waMessageId === "wamid.M", "sendMediaById sends inside the window");
  const r2 = await client.sendMediaByLink("15551230000", "document", "https://x/y.pdf", undefined, open);
  assert(r2.waMessageId === "wamid.M", "sendMediaByLink sends inside the window");

  sendCalls = 0;
  let threw = false;
  try {
    await client.sendMediaById("15551230000", "image", "MEDIA_ID", undefined, new Date(Date.now() - 1000));
  } catch (e) {
    threw = e instanceof WindowClosedError;
  }
  assert(threw, "media send blocked outside the 24h window");
  assert(sendCalls === 0, "no HTTP call made when window is closed");

  console.log("\nMEDIA MESSAGES VERIFIED ✅");
}

main().catch((e) => { console.error("\nFAILED ❌\n", e); process.exitCode = 1; });
