import type { FlowGraph } from "@watool/types";

/**
 * Starter flow templates. Each `build()` returns a fresh, publish-valid
 * FlowGraph (one trigger, wired edges) that's cloned into a new draft flow.
 */
type N = FlowGraph["nodes"][number];
type E = FlowGraph["edges"][number];

function graph(nodes: N[], edges: E[]): FlowGraph {
  return { nodes, edges };
}
const trigger = (data: any): N => ({ id: "trigger", type: "trigger", position: { x: 80, y: 40 }, data } as N);
const edge = (source: string, target: string, sourceHandle: string | null = null): E =>
  ({ id: `e_${source}_${target}_${sourceHandle ?? "o"}`, source, target, sourceHandle } as E);

export type FlowTemplate = {
  key: string;
  name: string;
  description: string;
  build: () => FlowGraph;
};

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    key: "welcome",
    name: "Welcome greeter",
    description: "Reply to every first message with a friendly welcome.",
    build: () =>
      graph(
        [
          trigger({ mode: "anyMessage", keywords: [], matchType: "contains" }),
          { id: "m1", type: "sendMessage", position: { x: 80, y: 200 }, data: { bodyType: "text", text: "Hi! 🌿 Thanks for reaching out. How can we help you today?", buttons: [] } } as N,
        ],
        [edge("trigger", "m1")],
      ),
  },
  {
    key: "lead",
    name: "Lead qualification",
    description: "Greet, capture name + interest, tag the lead, hand to an agent.",
    build: () =>
      graph(
        [
          trigger({ mode: "keyword", keywords: ["hi", "hello", "start"], matchType: "contains" }),
          { id: "q1", type: "askQuestion", position: { x: 80, y: 200 }, data: { prompt: "Hi! 👋 What's your name?", variable: "name", validation: "none", buttons: [] } } as N,
          { id: "q2", type: "askQuestion", position: { x: 80, y: 360 }, data: { prompt: "Nice to meet you, {{name}}! What are you interested in?", variable: "interest", validation: "none", buttons: [] } } as N,
          { id: "t1", type: "addTag", position: { x: 80, y: 520 }, data: { tags: ["lead"] } } as N,
          { id: "a1", type: "assignAgent", position: { x: 80, y: 680 }, data: { team: null, note: "New qualified lead" } } as N,
        ],
        [edge("trigger", "q1"), edge("q1", "q2"), edge("q2", "t1"), edge("t1", "a1")],
      ),
  },
  {
    key: "faq",
    name: "FAQ menu",
    description: "Show 3 buttons and answer Pricing / Support / Talk to a human.",
    build: () =>
      graph(
        [
          trigger({ mode: "anyMessage", keywords: [], matchType: "contains" }),
          {
            id: "menu",
            type: "sendMessage",
            position: { x: 80, y: 200 },
            data: {
              bodyType: "buttons",
              text: "Hi! What can we help you with? 🌿",
              buttons: [
                { id: "b_pricing", label: "Pricing" },
                { id: "b_support", label: "Support" },
                { id: "b_human", label: "Talk to us" },
              ],
            },
          } as N,
          { id: "pricing", type: "sendMessage", position: { x: -160, y: 380 }, data: { bodyType: "text", text: "Our plans start at ₹499/month. Reply here for a full breakdown!", buttons: [] } } as N,
          { id: "support", type: "sendMessage", position: { x: 120, y: 380 }, data: { bodyType: "text", text: "Tell us what's going wrong and we'll sort it out right away.", buttons: [] } } as N,
          { id: "human", type: "assignAgent", position: { x: 400, y: 380 }, data: { team: null, note: "Wants a human" } } as N,
        ],
        [
          edge("trigger", "menu"),
          edge("menu", "pricing", "b_pricing"),
          edge("menu", "support", "b_support"),
          edge("menu", "human", "b_human"),
        ],
      ),
  },
  {
    key: "booking",
    name: "Appointment booking",
    description: "Collect a preferred date + time, confirm, and notify an agent.",
    build: () =>
      graph(
        [
          trigger({ mode: "keyword", keywords: ["book", "appointment", "booking"], matchType: "contains" }),
          { id: "q1", type: "askQuestion", position: { x: 80, y: 200 }, data: { prompt: "Sure! What date works for you?", variable: "date", validation: "none", buttons: [] } } as N,
          { id: "q2", type: "askQuestion", position: { x: 80, y: 360 }, data: { prompt: "And what time on {{date}}?", variable: "time", validation: "none", buttons: [] } } as N,
          { id: "m1", type: "sendMessage", position: { x: 80, y: 520 }, data: { bodyType: "text", text: "Thanks! We'll confirm your slot for {{date}} at {{time}} shortly. ✅", buttons: [] } } as N,
          { id: "a1", type: "assignAgent", position: { x: 80, y: 680 }, data: { team: null, note: "Booking request" } } as N,
        ],
        [edge("trigger", "q1"), edge("q1", "q2"), edge("q2", "m1"), edge("m1", "a1")],
      ),
  },
];
