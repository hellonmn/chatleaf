/**
 * Verifies the Embedded-Signup SERVER flow (the browser FB popup is mocked):
 * code → token exchange → subscribe app to WABA → fetch number → store encrypted.
 * Run: npm run verify-embedded -w @watool/worker
 */
import "dotenv/config";
import { prisma } from "@watool/db";
import {
  exchangeCodeForToken,
  subscribeAppToWaba,
  getWabaPhoneNumbers,
  encryptSecret,
  decryptSecret,
} from "@watool/wa";

const rnd = () => Math.floor(performance.now()).toString(36) + Math.floor(performance.now() * 23).toString(36);
const wabaId = "WABA_" + rnd();
const phoneNumberId = "PN_" + rnd();
let subscribeCalled = false;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (u.includes("oauth/access_token")) {
    return new Response(JSON.stringify({ access_token: "TESTTOKEN" }), { status: 200 });
  }
  if (u.includes("/subscribed_apps")) {
    subscribeCalled = true;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }
  if (u.includes("/phone_numbers")) {
    return new Response(
      JSON.stringify({ data: [{ id: phoneNumberId, display_phone_number: "+1 555 010 1234", verified_name: "Test Biz", quality_rating: "GREEN" }] }),
      { status: 200 },
    );
  }
  return realFetch(url, init);
}) as typeof fetch;

function assert(c: unknown, m: string) { if (!c) throw new Error("ASSERT FAILED: " + m); console.log("✓ " + m); }

async function main() {
  // 1. Exchange + subscribe + fetch number (the wa helpers).
  const token = await exchangeCodeForToken({ code: "CODE", appId: "app", appSecret: "secret" });
  assert(token === "TESTTOKEN", "code exchanged for access token");
  await subscribeAppToWaba({ wabaId, accessToken: token });
  assert(subscribeCalled, "app subscribed to the WABA's webhooks");
  const numbers = await getWabaPhoneNumbers({ wabaId, accessToken: token });
  const match = numbers.find((n) => n.id === phoneNumberId) ?? numbers[0];
  assert(match?.display_phone_number === "+1 555 010 1234", "fetched the number's display details");

  // 2. Store (mirrors completeEmbeddedSignupAction).
  const org = await prisma.org.create({ data: { name: "ES Test", slug: "es-" + rnd() } });
  try {
    const enc = encryptSecret(token);
    const account = await prisma.whatsAppAccount.upsert({
      where: { wabaId },
      create: { orgId: org.id, wabaId, accessTokenEnc: enc, status: "CONNECTED" },
      update: { accessTokenEnc: enc, status: "CONNECTED" },
    });
    await prisma.phoneNumber.upsert({
      where: { phoneNumberId },
      create: { whatsAppAccountId: account.id, phoneNumberId, displayNumber: match!.display_phone_number, verifiedName: match!.verified_name },
      update: { whatsAppAccountId: account.id, displayNumber: match!.display_phone_number },
    });

    const acc2 = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { wabaId } });
    assert(acc2.status === "CONNECTED", "WhatsAppAccount stored as CONNECTED");
    assert(decryptSecret(acc2.accessTokenEnc!) === "TESTTOKEN", "token stored encrypted + decryptable");
    const pn = await prisma.phoneNumber.findUniqueOrThrow({ where: { phoneNumberId } });
    assert(pn.displayNumber === "+1 555 010 1234" && pn.verifiedName === "Test Biz", "phone number stored with display details");

    console.log("\nEMBEDDED SIGNUP (server flow) VERIFIED ✅");
  } finally {
    await prisma.org.delete({ where: { id: org.id } });
    console.log("✓ cleaned up");
  }
}

main().catch((e) => { console.error("\nFAILED ❌\n", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
