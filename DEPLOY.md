# Deploying Watool on Render

Two services run in production:

- **Web** (`apps/web`) — the Next.js dashboard + the WhatsApp webhook endpoint.
- **Worker** (`apps/worker`) — the BullMQ consumer (inbound processing, flows, broadcasts).

They share a **Postgres** (Neon) and a **Redis** (Upstash). You already have Neon;
Upstash takes 2 minutes to create.

> **Minimal option:** for low volume you can deploy **only the web service** and skip
> the worker + Redis entirely — the webhook processes inbound messages **inline** when
> `REDIS_URL` is unset. Add the worker later when you need throughput. The rest of this
> guide covers the full setup.

---

## 0. Prerequisites

1. Push this repo to **GitHub** (Render deploys from a Git repo):
   ```bash
   git remote add origin https://github.com/<you>/watool.git
   git push -u origin master
   ```
2. **Neon** Postgres — your existing project works. Grab the **pooled** connection
   string: `postgresql://…-pooler…/neondb?sslmode=require&pgbouncer=true`.
3. **Upstash** Redis — create a database, copy the **`rediss://…` "Redis" URL**
   (the TCP one, *not* the REST URL).
4. Make sure the schema is on the DB (run once from your machine):
   ```bash
   npm run db:push      # pushes packages/db/prisma/schema.prisma to DATABASE_URL
   ```

---

## 1. Deploy with the Blueprint (recommended)

The repo ships a [`render.yaml`](./render.yaml) Blueprint that defines both services.

1. In Render: **New → Blueprint**, pick this repo. Render reads `render.yaml`.
2. It creates **watool-web** and **watool-worker**. You'll be prompted for the
   `sync: false` env vars — fill them in (see the table below).
3. **Apply** → Render builds and deploys both.

### Keep shared secrets in sync (Environment Group)

`ENCRYPTION_KEY`, `DATABASE_URL`, and `REDIS_URL` must be **identical** on both
services (the worker decrypts the same tokens the web app encrypts). The clean way:

- Render → **Env Groups** → New group `watool-shared` with
  `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`,
  `META_GRAPH_API_VERSION`.
- Link the group to **both** services. Then remove those keys from each service's
  individual env.

---

## 2. Or set it up manually

**Web service** — New → Web Service → this repo:

| Field | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci && npm run db:generate && npm run build -w @watool/web` |
| Start command | `npm run start -w @watool/web` |
| Health check path | `/login` |

**Worker** — New → Background Worker → this repo:

| Field | Value |
| --- | --- |
| Build command | `npm ci && npm run db:generate` |
| Start command | `npm run start -w @watool/worker` |

---

## 3. Environment variables

| Key | Web | Worker | Value |
| --- | :-: | :-: | --- |
| `DATABASE_URL` | ✓ | ✓ | Neon pooled URL |
| `REDIS_URL` | ✓ | ✓ | Upstash `rediss://…` |
| `ENCRYPTION_KEY` | ✓ | ✓ | 32-byte hex — **same on both** |
| `AUTH_SECRET` | ✓ | | long random (Render can generate) |
| `AUTH_TRUST_HOST` | ✓ | | `true` |
| `META_APP_SECRET` | ✓ | | Meta app secret (verifies webhooks) |
| `META_WEBHOOK_VERIFY_TOKEN` | ✓ | | any string you choose |
| `META_GRAPH_API_VERSION` | ✓ | ✓ | `v21.0` |
| `ANTHROPIC_API_KEY` | ✓ | ✓ | for the AI node (optional) |
| `NEXT_PUBLIC_META_APP_ID` | ✓ | | for Embedded Signup (build-time) |
| `NEXT_PUBLIC_META_CONFIG_ID` | ✓ | | for Embedded Signup (build-time) |

> `NEXT_PUBLIC_*` are **baked in at build time** — set them *before* the first deploy,
> and redeploy if you change them.

Generate `ENCRYPTION_KEY` / `AUTH_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 4. After it's live

1. Your web URL is `https://watool-web.onrender.com` (or your custom domain).
2. In **Meta → WhatsApp → Configuration**:
   - Callback URL: `https://watool-web.onrender.com/api/webhooks/whatsapp`
   - Verify token: your `META_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
3. In the app: **Settings → WhatsApp** → connect your number (use a **permanent
   System User token**, not a temporary one).
4. Message your number → it appears in the Inbox.

---

## Notes & gotchas

- **Free web instances spin down when idle** → the first request after a lull is
  slow (cold start). Background Workers require a **paid** instance.
- **Signature verification is enforced in production** (`NODE_ENV=production`); the
  dev bypass does not apply. `META_APP_SECRET` must be correct.
- **Media** is proxied through the web service (downloaded from Meta on demand). For
  high volume, re-host media in S3/R2 — a drop-in later upgrade.
- **Migrations:** this project uses `prisma db push`. For stricter prod change
  control, switch to `prisma migrate` and run `prisma migrate deploy` in a
  pre-deploy step.
- **Scaling:** run multiple worker instances for more throughput — BullMQ shares the
  queue across them. The web service can scale horizontally too (it's stateless).
