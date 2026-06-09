# Watool — WhatsApp Chatbot Portal

A multi-tenant SaaS (WATI / SendPulse style) where businesses connect their own
WhatsApp number, build chatbots in a visual flow builder, run broadcasts, and
handle live chats. See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full design and roadmap.

## Status

**Phase 0 — Foundations** ✅ — sign up, create an org, invite teammates with roles.

**Phase 1 — WhatsApp connectivity** ✅ — webhook ingest (signature-verified) → BullMQ
queue → worker that stores the message, enforces the 24h window, and auto-replies.
Connect a number from **Settings → WhatsApp**.

**Phase 2 — Team inbox + contacts** ✅ — a shared **Inbox** (conversation list +
message thread) with agent replies (24h-window aware), human **takeover / return to
bot / close**, and **Contacts** with tags, custom attributes, and opt-in status.

**Phase 3 — Flow builder + engine** ✅ — a drag-and-drop **React Flow** canvas
(`Flows`) to build no-code chatbots: trigger, send message, ask question (with
validation + retry), condition branch, set attribute, add tag, assign-to-agent, end.
**Publish** snapshots a version; the **execution engine** (event-driven state machine)
runs published flows on inbound messages — resuming across replies, interpolating
`{{variables}}`, saving answers onto the contact, and handing off to a human.

**Phase 4 — Templates, broadcasts, analytics** ✅ — **Templates** synced from Meta;
**Broadcasts** send an approved template to a segment (opt-in enforced, optional tag
filter) with live per-recipient delivery stats updated from status webhooks; an
**Analytics** overview of contacts, conversations, messages, flows, and broadcasts.

**Phase 5 — Plans & usage limits** ✅ — per-plan ceilings (FREE/STARTER/PRO) on
seats, contacts, monthly messages, and published flows; enforced on invite, publish,
and broadcast-send; a **Billing** page with usage meters and an instant plan switcher
(the seam where Stripe Checkout plugs in).

**Phase 6 — AI node** ✅ — an **"AI reply"** node in the flow builder: Claude
(`@anthropic-ai/sdk`, default `claude-opus-4-8`) answers the customer using the
conversation history + an optional knowledge base, sends the reply, and can save it
to a contact variable. Model is selectable per-node (Opus/Sonnet/Haiku). Enabled by
setting `ANTHROPIC_API_KEY`; the node degrades gracefully (hands off to an agent) when
unset.

**Embedded Signup** ✅ — one-click **"Connect with Facebook"** on Settings → WhatsApp:
the customer authorizes in a popup and picks their number; the server exchanges the
code for a token, subscribes the WABA's webhooks, and stores the number (token
encrypted). Enabled by setting `NEXT_PUBLIC_META_APP_ID` + `NEXT_PUBLIC_META_CONFIG_ID`
(requires a Meta Tech-Provider app); manual token paste remains as the fallback.

**Media messages** ✅ — inbound images/video/audio/documents render in the inbox
(streamed through an authenticated proxy, so no S3 needed for dev); agents attach &
send files from the composer (uploaded to Meta then sent); flow **Send message** nodes
can send media by public URL. All window-gated.

## Stack

| Layer        | Choice                                   |
| ------------ | ---------------------------------------- |
| Monorepo     | Turborepo + npm workspaces               |
| Frontend     | Next.js (App Router) + Tailwind          |
| Auth         | Auth.js v5 (credentials, JWT sessions)   |
| ORM / DB     | Prisma + PostgreSQL                       |
| Shared types | zod schemas in `packages/types`          |

## Layout

```
watool/
├─ apps/
│  ├─ web/          # Next.js dashboard + auth + team + webhook ingest route
│  └─ worker/       # BullMQ consumer: processes inbound WhatsApp events
├─ packages/
│  ├─ db/           # Prisma schema, client singleton, org-scoping guard
│  ├─ types/        # shared zod schemas (roles, flow graph)
│  ├─ wa/           # WhatsApp Cloud API client, webhook verify/parse, token crypto
│  └─ queue/        # BullMQ wiring (Upstash/ioredis) + job types
├─ docker-compose.yml
└─ ARCHITECTURE.md
```

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Environment

```bash
cp .env.example .env   # a .env with generated secrets may already exist
```

`AUTH_SECRET` and `ENCRYPTION_KEY` are pre-generated. Set `DATABASE_URL` to a
running Postgres (see next step).

### 3. Database

**With Docker:**

```bash
docker compose up -d        # starts Postgres + Redis
```

**No Docker?** Use a free managed Postgres (e.g. [Neon](https://neon.tech)) and
put its connection string in `DATABASE_URL`.

Then create the schema and generate the client:

```bash
npm run db:push        # push schema to the database
npm run db:generate    # generate the Prisma client
```

### 4. Run

```bash
npm run dev            # turbo runs the web app on http://localhost:3000
```

Open http://localhost:3000 → **Create a workspace** → you land in the dashboard.
Go to **Team** to invite a teammate.

## Phase 1 — going live with WhatsApp

1. **Redis (Upstash):** create a free database at [upstash.com](https://upstash.com),
   copy the **Redis** (`rediss://…`) URL — *not* the REST URL — into `REDIS_URL`
   in both `apps/web/.env` and `apps/worker/.env`.
2. **Meta:** create a Meta app with the WhatsApp product. Put the **App secret** in
   `META_APP_SECRET` and choose any `META_WEBHOOK_VERIFY_TOKEN` (both in `apps/web/.env`).
3. **Run the worker** alongside the web app:
   ```bash
   npm run dev -w @watool/worker     # BullMQ consumer
   ```
4. **Expose your webhook** so Meta can reach it (localhost isn't public):
   ```bash
   npx ngrok http 3000
   ```
   In Meta → WhatsApp → Configuration, set the callback URL to
   `https://<your-ngrok>.ngrok.app/api/webhooks/whatsapp`, paste the verify token,
   and subscribe to the **messages** field. (The exact URL + token are shown in
   **Settings → WhatsApp**.)
5. **Connect your number** in **Settings → WhatsApp** (WABA id, phone number id,
   access token — Meta gives you a free **test number** that messages up to 5
   verified recipients without full app review).
6. Message your number from WhatsApp → it lands in the DB and you get the
   automated hello reply.

> Verify the processing pipeline offline anytime (no Redis/Meta needed):
> ```bash
> npm run simulate -w @watool/worker
> ```

## Useful scripts

| Command               | What it does                          |
| --------------------- | ------------------------------------- |
| `npm run dev`         | Run all apps in dev (Turborepo)       |
| `npm run build`       | Build everything                      |
| `npm run typecheck`   | Type-check all packages               |
| `npm test`            | Run the unit suite (pure logic)       |
| `npm run db:studio`   | Open Prisma Studio                    |
| `npm run db:push`     | Sync schema to DB (no migration file) |
| `npm run db:migrate`  | Create + apply a migration            |

## Next phase

**Phase 1 — WhatsApp connectivity.** Begin the Meta Tech-Provider / App Review
process now (it gates everything), then wire the webhook ingest + WA API client.
