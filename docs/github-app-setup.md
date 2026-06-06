# GitHub App + Inngest setup (Epic 3 — the Ship Feed pipeline)

This is the **live validation** for Story 3.1 (the "moat spike"). The code is shipped and
**inert** until these secrets are set. Do it once; the secrets persist.

The pipeline: a GitHub event → `POST /api/webhooks/github` (HMAC-verified, deduped) → an
Inngest `github/event.received` event → the `process-github-event` function → **one candidate
`ship_updates` row** (visible only to you, the freelancer).

---

## 1. Register the GitHub App

Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App** (or for an
org: the org's settings). Fill in:

| Field | Value |
| --- | --- |
| **GitHub App name** | e.g. `Soloist (CJ)` — must be globally unique |
| **Homepage URL** | `https://soloist.cjjutba.com` |
| **Webhook → Active** | ✅ checked |
| **Webhook URL** | **Prod:** `https://soloist.cjjutba.com/api/webhooks/github` · **Local dev:** your smee channel URL (see §3) |
| **Webhook secret** | generate a strong random string — **save it**, it becomes `GITHUB_APP_WEBHOOK_SECRET` |

**Repository permissions** (least-privilege, read-only):
- **Contents** → Read-only
- **Metadata** → Read-only (mandatory)
- **Pull requests** → Read-only

**Subscribe to events:** **Push**, **Pull request**, **Release**.

**Where can this app be installed?** → "Only on this account" (you) is fine for v1.

Click **Create GitHub App**. Then on the App's page:
- Note the **App ID** → `GITHUB_APP_ID`.
- Note the **Client ID** → `GITHUB_APP_CLIENT_ID`.
- Note the **app slug** (the URL `…/apps/<slug>`) → `GITHUB_APP_SLUG`.
- **Generate a private key** (downloads a `.pem`) → its contents become `GITHUB_APP_PRIVATE_KEY` (only needed to mint tokens in Story 3.3 — set it now anyway).

---

## 2. Set the secrets

Add to **`.env.local`** (local) **and** Vercel (Project → Settings → Environment Variables →
Production + Preview + Development):

```
GITHUB_APP_ID=...
GITHUB_APP_CLIENT_ID=...
GITHUB_APP_SLUG=...
GITHUB_APP_WEBHOOK_SECRET=...        # the webhook secret from §1
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
INNGEST_EVENT_KEY=...                # from the Inngest dashboard (prod)
INNGEST_SIGNING_KEY=...              # from the Inngest dashboard (prod)
```

> The PEM is multi-line — paste it as a single value with literal `\n` (or use Vercel's
> multiline paste). All are validated as optional in `src/env.ts`, so a missing one won't
> break the build — but the webhook handler returns **503** until `GITHUB_APP_WEBHOOK_SECRET`
> is set, and `inngest.send` needs the Inngest keys (or the local dev server) to deliver.

After setting Vercel env vars, **redeploy** (`vercel --prod`) so prod picks them up.

---

## 3. Local dev loop (test it end-to-end before prod)

You need three things running locally + a public tunnel for GitHub to reach your machine:

```bash
# Terminal 1 — the app
npm run dev                                   # http://localhost:3000

# Terminal 2 — the Inngest dev server (no keys needed locally)
npx inngest-cli@latest dev                    # http://localhost:8288 (auto-discovers /api/inngest)

# Terminal 3 — a public webhook tunnel (smee.io)
#   create a channel at https://smee.io/new, copy its URL, then:
npx smee-client --url https://smee.io/<your-channel> --target http://localhost:3000/api/webhooks/github
```

Set the **GitHub App's Webhook URL** to your **smee channel URL** (`https://smee.io/<channel>`)
while testing locally. (For prod, it's `https://soloist.cjjutba.com/api/webhooks/github`.)

> The Inngest dev server reads functions from `http://localhost:3000/api/inngest`. Make sure
> the app is running first. In dev, `inngest.send` talks to the dev server — no keys needed.

---

## 4. Install + trigger + verify

1. **Install the App** on a test repo: the App page → **Install App** → pick a repo.
2. Make sure there is **exactly one active Engagement** in the Cockpit (the spike attaches the
   candidate to it — Story 3.2 adds the real repo→engagement mapping).
3. **Trigger an event:** push a commit, or open/merge a PR, or publish a release on that repo.
4. **Verify:**
   - **Webhook:** the smee terminal shows the delivery; the app logs a 202; a `webhook_events`
     row appears (dedupe ledger).
   - **Inngest:** the dev server dashboard (http://localhost:8288) shows a `process-github-event`
     run succeed.
   - **Candidate:** a row appears in `ship_updates` with `state = 'candidate'`, a founder-readable
     `title`, and `raw_meta` populated (SHAs/branch) — visible to you only.
   - **Idempotency:** re-deliver the same event (smee can replay) → **no second row** (the
     `gh_delivery_id` ledger + the `(engagement_id, source_event_key)` unique both guard it).

That's the spike validated end-to-end. **Story 3.2** then replaces the single-engagement
shortcut with the real repo-connection UI, and **3.3+** auto-pull + curate + publish.
