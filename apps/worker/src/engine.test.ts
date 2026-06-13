/**
 * Unit tests for the flow engine's pure decision logic — trigger matching,
 * condition evaluation, edge routing, validation, interpolation. Zero deps:
 * Node's built-in runner via tsx. Run: npm run test -w @watool/worker
 *
 * Importing the engine module pulls @watool/db (a Prisma singleton) and
 * @watool/wa (crypto), so we set dummy env BEFORE the import. None of the pure
 * helpers touch the DB, so no real connection is made.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ENCRYPTION_KEY = "0".repeat(64);
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

import {
  matchesTrigger,
  ruleMatches,
  evalCondition,
  isValid,
  interpolate,
  nextNode,
  edgeTargetExact,
  getPath,
} from "@watool/processing/src/engine";

type TriggerData = Parameters<typeof matchesTrigger>[0];
type CondNode = Parameters<typeof evalCondition>[0];
type Graph = Parameters<typeof nextNode>[0];

const trigger = (d: object) => d as unknown as TriggerData;
const graph = (nodes: object[], edges: object[]) =>
  ({ nodes, edges }) as unknown as Graph;

// ── trigger matching ────────────────────────────────────────────────────────
test("matchesTrigger: anyMessage always matches", () => {
  assert.equal(matchesTrigger(trigger({ mode: "anyMessage" }), undefined), true);
  assert.equal(matchesTrigger(trigger({ mode: "anyMessage" }), "anything"), true);
});

test("matchesTrigger: keyword contains is case-insensitive", () => {
  const t = trigger({ mode: "keyword", keywords: ["Price"], matchType: "contains" });
  assert.equal(matchesTrigger(t, "what is the PRICE?"), true);
  assert.equal(matchesTrigger(t, "hello"), false);
  assert.equal(matchesTrigger(t, undefined), false);
});

test("matchesTrigger: keyword exact requires a full match", () => {
  const t = trigger({ mode: "keyword", keywords: ["hi"], matchType: "exact" });
  assert.equal(matchesTrigger(t, "hi"), true);
  assert.equal(matchesTrigger(t, " HI "), true); // trimmed + lowercased
  assert.equal(matchesTrigger(t, "hi there"), false);
});

// ── condition rules ─────────────────────────────────────────────────────────
test("ruleMatches: operators behave correctly", () => {
  assert.equal(ruleMatches("eq", "yes", "yes"), true);
  assert.equal(ruleMatches("neq", "yes", "no"), true);
  assert.equal(ruleMatches("contains", "Hello World", "world"), true);
  assert.equal(ruleMatches("gt", "10", "5"), true);
  assert.equal(ruleMatches("lt", "3", "5"), true);
  assert.equal(ruleMatches("exists", "x", undefined), true);
  assert.equal(ruleMatches("exists", "", undefined), false);
  assert.equal(ruleMatches("notExists", null, undefined), true);
  assert.equal(ruleMatches("bogus", "x", "x"), false);
});

test("evalCondition: first matching rule wins, else default handle", () => {
  const node = {
    type: "condition",
    data: {
      rules: [
        { variable: "plan", op: "eq", value: "pro", targetHandle: "isPro" },
        { variable: "age", op: "gt", value: "18", targetHandle: "adult" },
      ],
      defaultHandle: "fallback",
    },
  } as unknown as CondNode;

  assert.equal(evalCondition(node, { plan: "pro" }, {}), "isPro");
  assert.equal(evalCondition(node, { age: "25" }, {}), "adult");
  assert.equal(evalCondition(node, {}, { plan: "pro" }), "isPro"); // attributes fallback
  assert.equal(evalCondition(node, { plan: "free", age: "10" }, {}), "fallback");
});

// ── answer validation ───────────────────────────────────────────────────────
test("isValid: email / number / phone / none", () => {
  assert.equal(isValid("email", undefined, "a@b.com"), true);
  assert.equal(isValid("email", undefined, "nope"), false);
  assert.equal(isValid("number", undefined, "-12.5"), true);
  assert.equal(isValid("number", undefined, "12abc"), false);
  assert.equal(isValid("phone", undefined, "+1 (415) 555-1234"), true);
  assert.equal(isValid("none", undefined, "x"), true);
  assert.equal(isValid("none", undefined, "   "), false); // empty after trim
});

test("isValid: regex validates, bad regex is treated as pass", () => {
  assert.equal(isValid("regex", "^\\d{3}$", "123"), true);
  assert.equal(isValid("regex", "^\\d{3}$", "12"), false);
  assert.equal(isValid("regex", "([", "anything"), true); // invalid pattern → pass
});

// ── interpolation ───────────────────────────────────────────────────────────
test("interpolate: state wins over attributes, missing → empty", () => {
  assert.equal(
    interpolate("Hi {{name}}, plan {{plan}}!", { name: "Sam" }, { plan: "pro", name: "X" }),
    "Hi Sam, plan pro!",
  );
  assert.equal(interpolate("Bye {{missing}}.", {}, {}), "Bye .");
});

// ── edge routing ────────────────────────────────────────────────────────────
test("nextNode: follows the edge, optionally by handle", () => {
  const g = graph(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    [
      { source: "a", target: "b", sourceHandle: null },
      { source: "a", target: "c", sourceHandle: "yes" },
    ],
  );
  assert.equal(nextNode(g, "a")?.id, "b"); // first outgoing edge
  assert.equal(nextNode(g, "a", "yes")?.id, "c"); // by handle
  assert.equal(nextNode(g, "z"), undefined); // no edge
});

test("edgeTargetExact: matches the exact handle (null = default)", () => {
  const g = graph(
    [{ id: "m" }, { id: "x" }, { id: "y" }],
    [
      { source: "m", target: "x", sourceHandle: "btn1" },
      { source: "m", target: "y", sourceHandle: null },
    ],
  );
  assert.equal(edgeTargetExact(g, "m", "btn1")?.id, "x");
  assert.equal(edgeTargetExact(g, "m", null)?.id, "y");
  assert.equal(edgeTargetExact(g, "m", "nope"), undefined);
});

// ── path extraction (httpRequest response mapping) ──────────────────────────
test("getPath: reads nested keys, undefined when missing", () => {
  const obj = { data: { user: { name: "Ada" } } };
  assert.equal(getPath(obj, "data.user.name"), "Ada");
  assert.equal(getPath(obj, "data.user.age"), undefined);
  assert.equal(getPath(obj, "nope.x"), undefined);
});
