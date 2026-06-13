/**
 * Unit tests for the inbound pipeline's pure logic — STOP/START opt-out keyword
 * detection and business-hours evaluation. Run: npm run test -w @watool/worker
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ENCRYPTION_KEY = "0".repeat(64);
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

import { detectOptKeyword, isWithinBusinessHours } from "@watool/processing/src/inbound";

type Hours = Parameters<typeof isWithinBusinessHours>[1];

// ── STOP / START detection ──────────────────────────────────────────────────
test("detectOptKeyword: recognises opt-out words (whole message only)", () => {
  assert.equal(detectOptKeyword("stop"), "out");
  assert.equal(detectOptKeyword("STOP"), "out");
  assert.equal(detectOptKeyword(" Unsubscribe "), "out");
  assert.equal(detectOptKeyword("opt out"), "out");
  assert.equal(detectOptKeyword("stop!"), "out"); // punctuation stripped
});

test("detectOptKeyword: recognises opt-in words", () => {
  assert.equal(detectOptKeyword("start"), "in");
  assert.equal(detectOptKeyword("subscribe"), "in");
  assert.equal(detectOptKeyword("resume"), "in");
});

test("detectOptKeyword: ignores partial / unrelated messages", () => {
  assert.equal(detectOptKeyword("stop by the store later"), null);
  assert.equal(detectOptKeyword("can you help me"), null);
  assert.equal(detectOptKeyword(undefined), null);
  assert.equal(detectOptKeyword(""), null);
});

// ── business hours ──────────────────────────────────────────────────────────
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Hours config open all day for every weekday. */
function allDaysOpen(): Hours {
  const h: Record<string, { enabled: boolean; open: string; close: string }> = {};
  for (const d of DAYS) h[d] = { enabled: true, open: "00:00", close: "23:59" };
  return h as Hours;
}

test("isWithinBusinessHours: open 24/7 → within", () => {
  assert.equal(isWithinBusinessHours("UTC", allDaysOpen()), true);
});

test("isWithinBusinessHours: no config / all disabled → outside", () => {
  assert.equal(isWithinBusinessHours("UTC", {} as Hours), false);
  const disabled: Record<string, { enabled: boolean; open: string; close: string }> = {};
  for (const d of DAYS) disabled[d] = { enabled: false, open: "09:00", close: "17:00" };
  assert.equal(isWithinBusinessHours("UTC", disabled as Hours), false);
});

test("isWithinBusinessHours: invalid timezone fails open (assume available)", () => {
  assert.equal(isWithinBusinessHours("Not/ARealZone", allDaysOpen()), true);
});
