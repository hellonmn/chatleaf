# WhatsApp Chatbot Portal — Architecture & Roadmap

> A multi-tenant SaaS (WATI / SendPulse style) where businesses connect their own
> WhatsApp number via Meta's **WhatsApp Cloud API**, build chatbots in a **visual
> flow builder**, run broadcasts, manage contacts, and handle live chats — all in
> a **Next.js + Node (TypeScript)** stack.

---

## 1. Product scope

### What a customer ("tenant") can do
1. Sign up, create an **organization/workspace**, invite team members (roles).
2. Connect their **WhatsApp Business number** (via Meta Embedded Signup).
3. Build chatbots in a **drag-and-drop flow builder**.
4. Create & submit **message templates** (required by Meta for business-initiated msgs).
5. Run **broadcast campaigns** to contact segments.
6. Use a **shared team inbox** (live agent takeover when the bot can't handle it).
7. Manage **contacts**, tags, custom attributes, and segments.
8. View **analytics** (delivery, read rates, bot completion, agent response time).
9. Configure **billing / plan limits** (messages, seats, contacts).

### Out of scope for v1 (deliberately deferred)
- AI/LLM-powered answering (designed for, added later — see §9 Phase 4).
- Multi-channel (Instagram/Messenger) — architecture stays channel-agnostic but WA only.
- White-label reseller tiers.

---

## 2. Core concepts & vocabulary

| Term | Meaning |
|------|---------|
| **Tenant / Org** | A customer workspace. Hard data-isolation boundary. |
| **WABA** | WhatsApp Business Account (Meta object). One org may have ≥1. |
| **Phone Number** | A specific WA number under a WABA. Sends/receives messages. |
| **Contact** | An end-user (the org's customer) who messages the WA number. |
| **Conversation** | Rolling thread between a Contact and a Phone Number. |
| **Flow** | A versioned chatbot definition (graph of nodes). |
| **Flow Run** | A live execution instance of a Flow for one Contact. |
| **Template** | A pre-approved (by Meta) message format for outbound/business-initiated msgs. |
| **24h Window** | Meta's customer-service window. Free-form replies allowed only ≤24h after the contact's last message; outside it you MUST use an approved template. |

---

## 3. High-level architecture

```
                    ┌─────────────────────────────────────────┐
                    │              Meta WhatsApp                │
                    │            Cloud API + Webhooks           │
                    └───────────────┬───────────────▲──────────┘
                       inbound msgs  │               │ outbound msgs / templates
                       & statuses    ▼               │
        ┌───────────────────────────────────────────────────────────────┐
        │                        BACKEND (Node/TS)                       │
        │                                                                │
        │  ┌───────────────┐   ┌───────────────┐   ┌──────────────────┐  │
        │  │ Webhook Ingest │──▶│  Event Queue  │──▶│  Flow Engine     │  │
        │  │ (verify+enqueue)│   │ (BullMQ/Redis)│   │ (run executor)   │  │
        │  └───────────────┘   └───────┬───────┘   └────────┬─────────┘  │
        │                              │                    │            │
        │  ┌───────────────┐   ┌───────▼───────┐   ┌────────▼─────────┐  │
        │  │ REST/tRPC API  │   │ Broadcast      │   │ WA API Client    │  │
        │  │ (app backend)  │   │ Worker         │   │ (send + rate-lim)│  │
        │  └───────┬───────┘   └───────────────┘   └──────────────────┘  │
        └──────────┼─────────────────────────────────────────────────────┘
                   │ tRPC / REST
        ┌──────────▼──────────┐        ┌──────────────┐     ┌─────────────┐
        │  FRONTEND (Next.js) │        │  PostgreSQL  │     │   Redis     │
        │  - Dashboard        │◀──────▶│  (Prisma)    │     │ queue+cache │
        │  - Flow Builder     │        └──────────────┘     └─────────────┘
        │  - Team Inbox (WS)  │
        └─────────────────────┘
```

**Why this shape:**
- **Webhook ingest is dumb and fast** — it only verifies the signature and pushes the
  raw event onto a queue, then returns `200` immediately. Meta retries aggressively and
  disables webhooks that are slow/erroring, so we never do real work inline.
- **A queue (BullMQ on Redis) decouples** spiky inbound traffic from processing and lets
  us retry, rate-limit, and scale workers independently.
- **The Flow Engine is a separate worker** so a misbehaving bot can't take down the API.
- **Outbound goes through one WA API client** that centralizes Meta's rate limits, the
  24-hour-window check, and template handling.

---

## 4. Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | **TypeScript** everywhere | Shared types between FE/BE. |
| Frontend | **Next.js (App Router)** | Dashboard + builder. Server Components for data, Client for interactive builder. |
| UI | **Tailwind + shadcn/ui** | Fast, consistent, accessible primitives. |
| Flow builder canvas | **React Flow (@xyflow/react)** | Battle-tested node/edge graph editor. |
| API layer | **tRPC** (internal) + **REST** (webhooks/public) | tRPC for type-safe app calls; REST where external systems must reach us. |
| Backend runtime | **Node.js** | Same repo (monorepo) or separate service — see §5. |
| ORM / DB | **Prisma + PostgreSQL** | Strong typing, migrations, JSON columns for flexible attrs. |
| Queue | **BullMQ + Redis** | Inbound events, broadcasts, scheduled sends. |
| Realtime | **WebSockets (Socket.IO)** or Pusher/Ably | Live inbox updates. |
| Auth | **NextAuth/Auth.js** or Clerk | Org-scoped sessions + RBAC. |
| File/media | **S3-compatible** (R2/S3) | WA media is fetched from Meta then re-hosted. |
| Hosting | Vercel (FE) + a long-running host for workers (Railway/Render/Fly/EC2) | Workers can't live on serverless — they're long-running. |
| Observability | Sentry + structured logs (pino) | Webhook failures are silent killers; alert on them. |

> **Monorepo suggestion:** Turborepo with `apps/web` (Next.js), `apps/worker` (queue
> consumers + flow engine), `packages/db` (Prisma), `packages/wa` (Cloud API client),
> `packages/flow-engine` (shared run logic), `packages/types`.

---

## 5. Multi-tenancy & data isolation

- **Single database, shared schema, `orgId` on every tenant-owned row.** Simplest to
  operate at small/mid scale; revisit row-level-security or DB-per-tenant only at scale.
- **Every query is org-scoped.** Enforce with a Prisma middleware/extension that injects
  `orgId` from the request context so a missing filter is impossible to ship by accident.
- **Roles:** `OWNER`, `ADMIN`, `AGENT`, `ANALYST`. RBAC checked in tRPC middleware.
- **Secrets** (Meta access tokens) encrypted at rest (KMS / libsodium sealed box), never
  returned to the frontend.

---

## 6. Data model (core tables)

```
Org(id, name, plan, createdAt)
User(id, email, name, passwordHash?, ...)
Membership(id, orgId, userId, role)                         // user↔org with role

WhatsAppAccount(id, orgId, wabaId, businessId,
                accessTokenEnc, tokenExpiresAt, status)
PhoneNumber(id, whatsAppAccountId, phoneNumberId,           // Meta's phone_number_id
            displayNumber, verifiedName, qualityRating)

Contact(id, orgId, waId, name, phone, optInStatus,
        attributes JSONB, lastInboundAt, createdAt)
Tag(id, orgId, name)
ContactTag(contactId, tagId)
Segment(id, orgId, name, filterJSON)                        // dynamic audience

Conversation(id, orgId, contactId, phoneNumberId,
             status[open|bot|agent|closed], assignedUserId?,
             windowExpiresAt, lastMessageAt)
Message(id, orgId, conversationId, direction[in|out],
        waMessageId, type[text|image|template|interactive|...],
        payload JSONB, status[queued|sent|delivered|read|failed],
        errorJSON?, createdAt)

Template(id, orgId, name, language, category,
         components JSONB, metaStatus[pending|approved|rejected],
         metaTemplateId)

Flow(id, orgId, name, status[draft|published],
     trigger JSONB)                                         // keyword/CTA/optin etc.
FlowVersion(id, flowId, version, graphJSON, publishedAt)    // nodes+edges snapshot
FlowRun(id, orgId, flowId, flowVersionId, contactId,
        conversationId, currentNodeId, state JSONB,
        status[active|completed|failed|expired], updatedAt)

Broadcast(id, orgId, templateId, segmentId, scheduleAt,
          status, stats JSONB)
BroadcastRecipient(id, broadcastId, contactId, status, waMessageId)

WebhookEvent(id, orgId?, raw JSONB, processedAt, error?)    // audit + replay
```

Notes:
- `graphJSON` stores the React Flow node/edge graph **plus** validated, engine-ready
  node configs. Versioned so a published bot keeps running its version even while the
  draft is edited.
- `Message.payload` keeps the exact WA API request/response — invaluable for debugging.
- `FlowRun.state` holds collected variables (answers, computed values) for the run.

---

## 7. WhatsApp Cloud API integration (the heart of it)

### 7.1 Onboarding a number — Meta Embedded Signup
- Use **Facebook Login for Business / Embedded Signup** so the tenant authorizes us and
  selects/creates their WABA + phone number without leaving our app.
- We store the returned `waba_id`, `phone_number_id`, and a **System User access token**.
- Register the number and set up webhooks for that WABA.
- We must be a registered **Meta Tech Provider** (App Review with `whatsapp_business_management`
  + `whatsapp_business_messaging` permissions). **This approval takes time — start early.**

### 7.2 Receiving messages (inbound)
- One webhook endpoint: `POST /api/webhooks/whatsapp`.
- **Verify** `X-Hub-Signature-256` (HMAC-SHA256 with the app secret) before trusting anything.
- Parse `entry[].changes[].value`:
  - `messages[]` → inbound user messages (text, media, interactive replies, button clicks).
  - `statuses[]` → delivery/read/failed updates for our outbound messages.
- **Map `phone_number_id` → Org** to know which tenant this belongs to.
- Enqueue raw event → return `200` instantly.

### 7.3 Sending messages (outbound)
- `POST https://graph.facebook.com/v<ver>/<phone_number_id>/messages`.
- Message types we support: `text`, `image/document/audio/video`, `interactive`
  (buttons, list), and `template`.
- **The 24-hour window rule is enforced in the WA client**, not scattered in flows:
  - Inside 24h of the contact's last inbound msg → free-form messages allowed.
  - Outside → only **approved templates**. The client checks `windowExpiresAt` and rejects
    (or auto-swaps to a template) otherwise.
- Handle Meta **rate limits** and per-number messaging tiers; back off on `131056`/`80007`.
- Persist every send + the returned `waMessageId` so status webhooks can reconcile.

### 7.4 Templates
- Created/edited in our UI → submitted to Meta via API → Meta approves/rejects async →
  status synced back via webhook/poll. Bots and broadcasts can only use **approved** ones.

### 7.5 Media
- Inbound media comes as an ID → download from Meta (auth'd) → store in our S3 → reference
  by our URL. Outbound media uploaded to Meta first (or sent by link).

---

## 8. Visual flow builder + execution engine

### 8.1 Builder (frontend)
- **React Flow** canvas. Left palette of node types, right panel to configure the
  selected node, top bar for Save / Publish / Test.
- Node types (v1):
  - **Trigger** — keyword / "any message" / opt-in / clicked-button entry.
  - **Send Message** — text / media / buttons / list.
  - **Ask Question** — send prompt, wait for reply, store answer in a variable
    (with optional validation: email/number/regex).
  - **Condition** — branch on a variable / tag / attribute.
  - **Set Attribute / Tag** — mutate the contact.
  - **HTTP Request** — call an external API, map response into variables.
  - **Assign to Agent** — hand the conversation to the human inbox.
  - **Delay / Wait** — time-based pause.
  - **End**.
- On **Publish**: validate the graph (no dangling edges, every wait-node reachable, all
  templates approved) → snapshot to a new `FlowVersion`.

### 8.2 Execution engine (worker)
- The engine is an **event-driven state machine**, not a long-running loop — critical,
  because a bot may wait hours/days for a human reply.
- On an inbound message:
  1. Find/create `Conversation`; refresh `windowExpiresAt`.
  2. If an `active FlowRun` is **waiting at an Ask node** → feed the message in as the
     answer, validate, store to `state`, advance.
  3. Else evaluate **triggers** of published flows → start a new `FlowRun`.
  4. Execute nodes synchronously until hitting a node that **waits** (Ask, Delay) or
     **ends** — persist `currentNodeId` + `state` and stop.
- **Idempotency:** dedupe on `waMessageId` (Meta re-delivers). Each step is safe to retry.
- **Timeouts:** a `FlowRun` waiting past N hours can expire / re-prompt (scheduled job).
- **Human handoff:** `Assign to Agent` flips `Conversation.status = agent`; the engine
  stops auto-replying until the agent closes/returns it to the bot.

---

## 9. Phased roadmap

> Goal: a **usable product early**, each phase shippable. Don't build the whole thing
> before anything works.

### Phase 0 — Foundations *(scaffold)*
- Monorepo (Turborepo), Next.js app, Prisma schema, Postgres + Redis, auth, org/membership,
  RBAC, base dashboard shell. **Deliverable:** you can sign up, create an org, invite a teammate.

### Phase 1 — WhatsApp connectivity *(the make-or-break)*
- Meta app + Tech Provider review **(begin immediately — it gates everything)**.
- Embedded Signup → store WABA/number/token. Webhook ingest + signature verify + queue.
- WA API client with 24h-window logic. **Deliverable:** receive a real WA message into the
  DB and reply with a hardcoded "hello" — end-to-end proof.

### Phase 2 — Inbox + contacts *(immediately useful even without bots)*
- Team inbox (realtime), conversation list, send/receive free-form, contact records, tags,
  attributes. **Deliverable:** a business can do live WhatsApp support from the portal.

### Phase 3 — Flow builder + engine *(the headline feature)*
- React Flow builder, node configs, publish/versioning, the execution engine, "test bot".
  Start with Trigger/Send/Ask/Condition/Tag, then HTTP + Assign-to-Agent.
- **Deliverable:** a no-code keyword chatbot that collects info and hands off to an agent.

### Phase 4 — Templates, broadcasts, analytics *(growth features)*
- Template management + Meta submission. Segments + broadcast worker (respecting tiers/limits).
  Analytics dashboards. **Deliverable:** marketing campaigns + reporting.

### Phase 5 — Monetization & polish
- Plans, usage metering, message/seat limits, billing (Stripe), audit logs, webhooks-out,
  API for customers.

### Phase 6 (optional) — AI layer
- LLM (Claude) node + knowledge-base answering; AI-assisted flow building. Slots into the
  existing engine as a new node type — no rearchitecture.

---

## 10. Key risks & compliance (read before building)

1. **Meta approval latency.** Tech Provider / App Review can take weeks. **Start the Meta
   Business + App Review process on day one**, in parallel with Phase 0.
2. **Opt-in is mandatory.** Messaging contacts without proven opt-in gets numbers banned.
   Track `optInStatus` and source; never broadcast to non-opted contacts.
3. **24-hour window & templates.** The most common cause of "why won't my message send."
   Centralize the rule (§7.3) so it's enforced in one place.
4. **Quality rating & tiers.** Spammy sends downgrade a number's quality and cap volume.
   Surface quality in the UI; throttle broadcasts.
5. **Webhook reliability.** Slow/erroring webhooks get disabled by Meta. Keep ingest <1s,
   process async, alert on failures, store raw events for replay.
6. **Per-tenant token security.** Encrypt access tokens; rotate; scope to the WABA.
7. **Cost.** Meta charges per conversation/template category. Plan billing around it from
   the start so you don't lose money per message.

---

## 11. Suggested repo layout

```
watool/
├─ apps/
│  ├─ web/                 # Next.js dashboard + flow builder + inbox
│  └─ worker/             # BullMQ consumers: ingest processor, flow engine, broadcasts
├─ packages/
│  ├─ db/                 # Prisma schema + client + org-scoping middleware
│  ├─ wa/                 # WhatsApp Cloud API client (send, templates, media, 24h logic)
│  ├─ flow-engine/        # node executors + state machine (shared by worker & "test bot")
│  └─ types/              # shared TS types / zod schemas (incl. flow graph schema)
├─ ARCHITECTURE.md        # this file
└─ turbo.json
```

---

### Immediate next steps
1. **Today:** kick off the Meta Business account + WhatsApp/Tech-Provider App Review.
2. **Phase 0:** scaffold the monorepo, DB schema, and auth (I can generate this on request).
3. **Phase 1:** wire the webhook + WA client and get one real message round-tripping.

> When you're ready, tell me which phase to start coding and I'll scaffold it.
