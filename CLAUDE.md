# Chatleaf — Claude handoff & working context

> Read this first. It's the current-state companion to `ARCHITECTURE.md` (the
> original design/roadmap). ARCHITECTURE.md = *what we set out to build*; this
> file = *what exists now, how to work in it, and the gotchas*.

## What this is

**Chatleaf** — a multi-tenant WATI/SendPulse-style SaaS. A business connects its
own **WhatsApp Cloud API** number and gets: a visual chatbot **flow builder**, a
live team **inbox**, **contacts/CRM**, **message templates**, **broadcasts**,
**analytics**, and AI assist. Repo: `github.com/hellonmn/chatleaf` (branch
`master`). Git user/name: Naman. Status: **all originally-planned phases done**,
plus a large second wave of features (see *Feature inventory*).

## Stack

- **Turborepo** monorepo, **npm workspaces** (NOT pnpm — pnpm install fails here).
- Packages: `@watool/db` (Prisma+Neon Postgres), `@watool/types` (zod schemas,
  roles, plan limits, **FlowGraph**), `@watool/wa` (WhatsApp Cloud API client,
  crypto, webhook, templates, media, embedded-signup), `@watool/queue` (BullMQ +
  ioredis + the **realtime pub/sub bus**), `@watool/processing` (inbound
  pipeline, **flow engine**, broadcast sender, AI).
- Apps: `@watool/web` (Next.js **15** App Router, **React 19**),
  `@watool/worker` (BullMQ consumer, runs via `tsx`).
- Auth.js **v5** (credentials, JWT, `trustHost`). Tailwind with a custom brand
  theme. Anthropic SDK for AI. WhatsApp **Cloud API** (Graph v21).

## Run it

```bash
npm install                 # root
npm run db:generate         # prisma client
npm run dev                 # turbo: web + worker
npm run typecheck           # all packages — DO THIS before committing
npm run build               # full next build (best pre-push verification)
npm run db:push             # apply schema.prisma to the DB (no migration files)
```

**Windows gotchas (this is a Windows dev box):**
- **Prisma DLL lock**: `db:push`/`db:generate` fail with
  `EPERM … query_engine-windows.dll.node` while `npm run dev`/the worker is
  running (they hold the DLL). Kill the dev tree first, then regenerate:
  ```powershell
  Get-CimInstance Win32_Process | ? { $_.CommandLine -match 'watool' -and $_.CommandLine -match 'tsx|next|turbo' } | % { Stop-Process -Id $_.ProcessId -Force }
  ```
- **`.next` stale cache** → runtime `Cannot read properties of undefined (reading 'call')`
  or build `Failed to collect page data for /api/auth/...`. Fix: `rm -rf apps/web/.next`
  then restart. The auth page-data error is also just **flaky on retry** — re-run `next build`.
- Files are LF; git warns LF→CRLF on add — harmless.

## Environment (`.env` at repo root; `.env.example` lists keys)

`DATABASE_URL` (Neon pooler, `pgbouncer=true`, no `channel_binding`), `REDIS_URL`
(optional — Upstash `rediss://`; **unset = inline processing + in-process
realtime**), `AUTH_SECRET`, `NEXTAUTH_URL`, `ENCRYPTION_KEY` (AES for tokens/keys
at rest), `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_API_VERSION`,
`META_APP_ID` + `NEXT_PUBLIC_*` (embedded signup), `ANTHROPIC_API_KEY` (optional —
per-org key in Settings overrides it), `CRON_SECRET` (for scheduled broadcasts).
The **Neon DB is live and already migrated to the current schema** (db:push).

## Repo map (where things live)

- `packages/db/prisma/schema.prisma` — the data model (source of truth).
- `packages/types/src/flow.ts` — **FlowGraph** zod schema + `validateFlowGraph`.
- `packages/processing/src/engine.ts` — **flow execution engine** (event-driven
  state machine over FlowGraph; runs nodes until a wait/end).
- `packages/processing/src/inbound.ts` — webhook→contacts/convos/messages, away
  replies, STOP/opt-out, publishes realtime.
- `packages/queue/src/realtime.ts` — **pub/sub bus** (Redis when configured, else
  in-process EventEmitter). `apps/web/lib/realtime.ts` delegates to it.
- `apps/web/lib/actions/*` — server actions (inbox, contacts, broadcasts, flows,
  templates, settings, saved-replies).
- `apps/web/app/flows/[flowId]/NodeFlowBuilder.tsx` — **custom node-graph flow
  editor** (full-screen, no dashboard chrome). NOT React Flow — hand-rolled
  canvas (drag nodes, draw edges, pan/zoom, auto-arrange, V/H layout toggle).
- `apps/web/app/dashboard/**` — the app shell + every screen.
- `apps/web/app/api/webhooks/whatsapp/route.ts` — Meta webhook (verify + ingest).
- `apps/web/app/api/inbox/stream/route.ts` — SSE for realtime inbox.
- `apps/web/app/api/cron/broadcasts/route.ts` — scheduled-broadcast dispatcher.

## Conventions (follow these)

- **Server actions** live in `apps/web/lib/actions/*`, start with `"use server"`,
  call `requireActiveContext()` (`lib/session.ts`) → `{ orgId, userId, role,
  plan, orgName }`, and gate with `canManageOrg` / `canHandleConversations`
  (`@watool/types/roles`). Always scope queries by `orgId` (multi-tenant).
- **Secrets at rest** (WA token, Claude key): `encryptSecret`/`decryptSecret`
  from `@watool/wa`.
- **Realtime**: publish with `publishInbox(orgId, payload?)`; the SSE payload is
  `"refresh"` or a small JSON (e.g. inbound preview for desktop notifications).
- **Client/server boundary**: never import the `@watool/wa` **barrel** into a
  `"use client"` file — it pulls `node:crypto` and breaks the webpack client
  bundle. Use `apps/web/lib/media-ref.ts` for the client-safe media helper.
- **Flow engine**: a node runs until it WAITS (`askQuestion`, or a buttons
  `sendMessage`) or ENDS; state persists on `FlowRun`. Buttons/questions branch
  via `edge.sourceHandle` (button id / `yes`/`no`); `"out"` ⇄ `sourceHandle:null`.
- Brand tokens (Tailwind): `brand`(ocean), `ink`, `sub`, `faint`, `line`,
  `canvas`, `warm/sky/violet/rose`; `rounded-card/btn/pill`; `shadow-card`; font
  **Figtree**. Match existing screens' style. Icons: **lucide-react**.

## Feature inventory (what's built)

- **Auth/org**: signup→org, memberships/roles, invites, plan limits, billing page.
- **WhatsApp connect**: manual + Embedded Signup; token stored encrypted; expired
  token (Meta code 190) surfaces a reconnect banner and flags the account ERROR.
- **Inbound**: webhook verify (+dev bypass when app secret is placeholder),
  inline processing when no Redis, idempotent on `waMessageId`, 24h window,
  status reconciliation, **away auto-reply** (business hours, tz-aware, 6h
  rate-limit), **STOP/START opt-out** (+ implicit opt-in on first message).
- **Flow builder**: custom node-graph canvas; node types trigger/sendMessage/
  askQuestion(+quick-reply buttons)/condition/setAttribute/addTag/aiReply/
  assignAgent/delay/end; **buttons render in-node with per-button connect dots**;
  auto-arrange; vertical/horizontal layout toggle; **starter templates**
  (`apps/web/lib/flow-templates.ts`); publish rejects empty-keyword triggers;
  `assignAgent` posts a **visible system "handover" note** in the chat.
- **Inbox**: true realtime (SSE + bus), optimistic send, media, **saved replies**
  (`/shortcut` picker), **manual + auto (least-loaded) assignment**, **Run flow**
  on a chat, **AI "Suggest reply"** (Claude), **desktop notifications**, search +
  filters, system notes, interactive-reply text.
- **Contacts/CRM**: lifecycle stages, tags, source, value, notes; **CSV
  import/export**; **bulk actions** (tag/stage/delete); opt-in status.
- **Templates**: grid + **create & submit to Meta** (auto example vars) + sync.
- **Broadcasts**: **segment builder** (tags/stages/source/last-active/opt-in +
  live reach count via `audienceWhere`), send now, **scheduled sends** (cron
  endpoint + atomic due-runner + quota guard), delivery funnel.
- **Analytics**: delivery/read rates, avg first-response, 14-day volume chart,
  per-agent performance, flow completion funnels.
- **Settings**: Business hours + away + auto-assign, Saved replies, **AI
  assistant (per-org Claude key)**, **Chat link & widget** (wa.me + client-side
  QR via `qrcode` + embeddable floating button).

## Schema additions beyond ARCHITECTURE.md

- `Contact`: `stage`(LifecycleStage NEW/QUALIFIED/ENGAGED/CONVERTED), `source`,
  `value`, `notes`, `optInStatus`.
- `OrgSettings` (1:1 org): `timezone`, `awayEnabled`, `awayMessage`, `hoursJSON`,
  `autoAssign`, `aiApiKeyEnc`.
- `SavedReply` (org-scoped canned responses, optional `/shortcut`).
- `AskQuestion` flow node data gained `buttons` (quick replies).

## Known issues / things to watch

- **Realtime + the queue worker**: with `REDIS_URL` set, inbound goes to the
  worker; realtime fans out via Redis pub/sub (publish happens inside
  `processInboundJob`, so both inline and worker paths fire). Without Redis it's
  single-process in-memory — fine for dev / one web instance.
- **Scheduled broadcasts** need `CRON_SECRET` + an external scheduler hitting
  `/api/cron/broadcasts` (Vercel Cron / Render Cron / cron-job.org).
- **No automated tests yet**, no Sentry — the main hardening gaps.
- The dev box's **Meta token is currently expired** — sends fail until a valid
  (ideally permanent **System User**) token is reconnected in Channels.

## Suggested next steps (not yet done)

Email notifications (needs Resend/SMTP + a settings key) · tests for the flow
engine + inbound · Sentry/structured logging · first-run onboarding wizard ·
permanent Meta System User token · Redis in prod + run the worker.

## Workflow rules

Commit/push **only when asked**. End commit messages with the Co-Authored-By
trailer. Run `npm run typecheck` (and ideally `next build`) before committing —
typecheck does NOT catch client-bundle/`node:` import errors; the build does.
