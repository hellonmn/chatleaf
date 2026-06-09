/**
 * Unit tests for the pure logic across packages. Zero deps — Node's built-in
 * test runner via tsx. Run: npm run test -w @watool/worker
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// Deterministic key so crypto tests don't depend on a real .env.
process.env.ENCRYPTION_KEY = "0".repeat(64);

import {
  roleAtLeast,
  canManageOrg,
  canHandleConversations,
  planLimits,
  isOverLimit,
  validateFlowGraph,
  type FlowGraph,
} from "@watool/types";
import {
  encryptSecret,
  decryptSecret,
  verifyWebhookSignature,
  extractInboundText,
  normalizeWebhook,
  WhatsAppApiError,
  type WhatsAppWebhook,
} from "@watool/wa";

// ── roles / RBAC ────────────────────────────────────────────────────────────
test("roleAtLeast respects the privilege ladder", () => {
  assert.equal(roleAtLeast("OWNER", "ADMIN"), true);
  assert.equal(roleAtLeast("ADMIN", "ADMIN"), true);
  assert.equal(roleAtLeast("AGENT", "ADMIN"), false);
  assert.equal(roleAtLeast("ANALYST", "AGENT"), false);
});

test("canManageOrg = OWNER/ADMIN only", () => {
  assert.equal(canManageOrg("OWNER"), true);
  assert.equal(canManageOrg("ADMIN"), true);
  assert.equal(canManageOrg("AGENT"), false);
  assert.equal(canManageOrg("ANALYST"), false);
});

test("canHandleConversations excludes ANALYST", () => {
  assert.equal(canHandleConversations("AGENT"), true);
  assert.equal(canHandleConversations("ANALYST"), false);
});

// ── billing limits ──────────────────────────────────────────────────────────
test("plan limits increase with tier", () => {
  assert.ok(planLimits("PRO").seats > planLimits("FREE").seats);
  assert.ok(planLimits("STARTER").messagesPerMonth > planLimits("FREE").messagesPerMonth);
});

test("isOverLimit is inclusive at the ceiling", () => {
  assert.equal(isOverLimit(2, 2), true);
  assert.equal(isOverLimit(1, 2), false);
});

// ── flow graph validation ───────────────────────────────────────────────────
const node = (id: string, type: any, data: any): any => ({ id, type, position: { x: 0, y: 0 }, data });

test("validateFlowGraph flags missing & duplicate triggers", () => {
  const noTrigger: FlowGraph = { nodes: [node("a", "end", {})], edges: [] };
  assert.ok(validateFlowGraph(noTrigger).some((p) => /no trigger/i.test(p)));

  const twoTriggers: FlowGraph = {
    nodes: [
      node("t1", "trigger", { mode: "anyMessage", keywords: [], matchType: "contains" }),
      node("t2", "trigger", { mode: "anyMessage", keywords: [], matchType: "contains" }),
    ],
    edges: [],
  };
  assert.ok(validateFlowGraph(twoTriggers).some((p) => /more than one trigger/i.test(p)));
});

test("validateFlowGraph flags dangling edges", () => {
  const g: FlowGraph = {
    nodes: [node("t1", "trigger", { mode: "anyMessage", keywords: [], matchType: "contains" })],
    edges: [{ id: "e1", source: "t1", target: "ghost" }],
  };
  assert.ok(validateFlowGraph(g).some((p) => /missing node/i.test(p)));
});

test("validateFlowGraph passes a clean graph", () => {
  const g: FlowGraph = {
    nodes: [
      node("t1", "trigger", { mode: "anyMessage", keywords: [], matchType: "contains" }),
      node("e1", "end", {}),
    ],
    edges: [{ id: "x", source: "t1", target: "e1" }],
  };
  assert.deepEqual(validateFlowGraph(g), []);
});

// ── token crypto ────────────────────────────────────────────────────────────
test("encrypt/decrypt round-trips", () => {
  const secret = "EAAG-super-secret-token";
  assert.equal(decryptSecret(encryptSecret(secret)), secret);
});

test("decrypt rejects tampered ciphertext", () => {
  const enc = encryptSecret("token");
  const tampered = enc.slice(0, -2) + (enc.endsWith("A") ? "B" : "A");
  assert.throws(() => decryptSecret(tampered));
});

// ── webhook signature ───────────────────────────────────────────────────────
test("verifyWebhookSignature accepts a valid HMAC and rejects bad ones", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ hello: "world" });
  const good = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, good, secret), true);
  assert.equal(verifyWebhookSignature(body, "sha256=deadbeef", secret), false);
  assert.equal(verifyWebhookSignature(body, null, secret), false);
  assert.equal(verifyWebhookSignature(body + "x", good, secret), false);
});

// ── webhook parsing ─────────────────────────────────────────────────────────
test("extractInboundText handles text, button, and interactive replies", () => {
  assert.equal(extractInboundText({ from: "1", id: "1", timestamp: "1", type: "text", text: { body: "hi" } }), "hi");
  assert.equal(
    extractInboundText({ from: "1", id: "1", timestamp: "1", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "b", title: "Yes" } } }),
    "Yes",
  );
  assert.equal(extractInboundText({ from: "1", id: "1", timestamp: "1", type: "image" }), undefined);
});

test("normalizeWebhook flattens entry/changes by phone_number_id", () => {
  const payload: WhatsAppWebhook = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "PN1" },
              contacts: [{ wa_id: "123", profile: { name: "Al" } }],
              messages: [{ from: "123", id: "m1", timestamp: "1", type: "text", text: { body: "hi" } }],
            },
          },
        ],
      },
    ],
  };
  const [change] = normalizeWebhook(payload);
  assert.equal(change!.phoneNumberId, "PN1");
  assert.equal(change!.wabaId, "WABA1");
  assert.equal(change!.contactName, "Al");
  assert.equal(change!.messages.length, 1);
});

// ── WhatsApp API error classification ───────────────────────────────────────
test("isRateLimited covers 429 + known codes, not 5xx", () => {
  assert.equal(new WhatsAppApiError("x", 131056, 400, {}).isRateLimited, true);
  assert.equal(new WhatsAppApiError("x", undefined, 429, {}).isRateLimited, true);
  assert.equal(new WhatsAppApiError("x", undefined, 500, {}).isRateLimited, false);
  assert.equal(new WhatsAppApiError("x", 131000, 400, {}).isRateLimited, false);
});
