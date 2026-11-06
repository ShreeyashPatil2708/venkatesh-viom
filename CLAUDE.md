# Venkatesh Viom — society complaints app

Residents of a Pune housing society (2 wings, 11 floors, 4 flats each = 88 flats)
raise complaints, suggestions and enquiries. The managing committee works them from
an admin panel. Email goes out automatically both ways; in-app notifications mirror it.

## Live

| | |
|---|---|
| App | https://venkatesh-viom.vercel.app |
| Install page | https://venkatesh-viom.vercel.app/get |
| APK | https://github.com/ShreeyashPatil2708/venkatesh-viom/releases/latest/download/venkatesh-viom.apk |
| Repo | github.com/ShreeyashPatil2708/venkatesh-viom (public, personal account) |
| Supabase | project ref `bcktouviicqzqishsqew`, region ap-southeast-1, owner viompune@gmail.com |
| Vercel | project `viom` under `spikeshield2708` |
| Email | Brevo free tier (300/day), sender viompune@gmail.com |

Running cost: ₹0.

## Stack

React 19 + Vite + TypeScript + Tailwind v4 · Supabase (Postgres, Auth, Storage, Edge
Functions) · Brevo for email · Vercel · Capacitor 8 for the Android APK.

The APK is a **thin shell**: `capacitor.config.ts` sets `server.url` to the Vercel URL,
so deploying the web app reaches installed phones immediately. A new APK is only needed
for native changes (icon, name, plugins).

## Running things

```bash
npm run dev              # local dev
npm run build            # typecheck + build
npm run lint             # oxlint
npm run check:functions  # Edge Functions compile
supabase/tests/run.sh    # 80 security/behaviour checks against throwaway Postgres (needs Docker)
npx vercel --prod --yes  # deploy the site
```

**Run SQL against production** (no dashboard needed, no DB password):
```bash
supabase db query "select ..." --remote --read-only          # reads
supabase db query --file path/to.sql --remote --yes          # writes
```
`--yes` is required for mutations in agent mode. Always apply a new migration this way
AND keep the file in `supabase/migrations/`.

**Rebuild the APK**: `gh workflow run android.yml --repo ShreeyashPatil2708/venkatesh-viom --ref main`
It publishes to the `latest` GitHub Release, so the download link never changes.

## Roles and flow

```
sign up (email -> code -> flat/name/mobile/owner-tenant) -> status: pending
   -> every Admin gets a bell notification
   -> Admin: Members -> Approve -> optionally set role
```

| Role | Own requests | All requests + notices | Approve members, set roles |
|---|---|---|---|
| resident | yes | | |
| committee | yes | yes | |
| admin | yes | yes | yes |

- One email = one account. A flat may hold any number of people (no constraint).
- A committee member is also an ordinary resident; the Admin tab is additive, and they
  are never notified about their own complaints or their own replies.
- **Tenants expire after 1 year** and an admin renews them (Members → "Still lives here").
  Owners never expire. A lapsed tenant keeps their account and history but cannot raise
  anything new. `is_committee()` deliberately does NOT check expiry, so the committee
  can never lock itself out.
- First admin is bootstrapped by SQL (`viompune@gmail.com`, flat "Office"); everyone
  after that is handled in the app.

## Who gets told what

Every in-app notification is also pushed to that user's phones via FCM, so
push and bell can never disagree.

| Event | Email | In-app bell + push |
|---|---|---|
| Complaint raised | every committee+admin, plus `app_config.archive_emails` | every committee+admin except the raiser |
| Status changed | the resident who raised it | same |
| Committee reply (visible) | the resident | same |
| Internal note | nobody | nobody |
| New sign-up | nobody (88 at launch would be noise) | every admin |

`email_log.dedupe_key` makes a retried trigger a no-op. Check it when an email is missing.

## Push notifications

Firebase project `venkatesh-viom`, Android app package `in.society.viom`.

- `device_tokens` holds each phone's FCM token, readable/writable only by its user.
- Any insert into `notifications` triggers `send-push`, which mints a service-account
  JWT, exchanges it for an access token (cached), and posts to FCM HTTP v1. The legacy
  server-key API is retired, so v1 is the only option.
- Tokens rejected by FCM (uninstalled app) are deleted rather than retried.
- `FCM_SERVICE_ACCOUNT` is a Supabase secret holding the whole service-account JSON.
  `GOOGLE_SERVICES_JSON` is a base64 GitHub secret; the workflow writes it to
  `android/app/google-services.json` at build time. Neither is in the repo.
- Without `FCM_SERVICE_ACCOUNT`, send-push returns "not configured" and bell + email
  carry on unaffected.
- Push needs a **new APK**; the web app alone cannot deliver it.

## Database

`supabase/migrations/` — 0001 schema+RLS+email triggers, 0002 notifications,
0003 tenant review, 0004 sign-up notification. `supabase/seed/flats.sql` has the 88 flats.

`app_config` (RLS on, no policies — service role only) holds `edge_base_url`,
`webhook_secret`, `archive_emails`. Triggers post to Edge Functions over pg_net with the
shared secret; the functions verify it.

## Gotchas hit already

- Supabase's built-in mailer allows a few emails/hour. Custom SMTP (Brevo) is mandatory.
- Brevo blocks SMTP from unauthorised IPs by default — turned off for SMTP keys.
- Auth OTP length is a project setting; this project issues **8** digits. Never hardcode 6.
- Gmail threads the sign-in emails (same subject), so new codes hide inside the thread.
- Capacitor 8 needs **JDK 21**. `android-actions/setup-android@v3` is broken (installs the
  obsolete `tools` package) — use the runner's preinstalled SDK.
- Never put an APK under `public/`: it gets bundled into the next APK, doubling its size.
- Flat `number` is text, so sort with `compareFlats` or A-1001 lands before A-102.
- In `supabase/tests`, `assert_blocked` must catch the statement in an INNER block —
  raising the failure inside its own handler makes every negative assertion vacuous.

## Conventions

- Tests live in `supabase/tests/02_rls.sql`; add a check for anything security-relevant
  and run `supabase/tests/run.sh` before deploying schema changes.
- Comments explain *why*, not what.
- Don't commit secrets. `.env`, `.env.local`, `.vercel`, keystores and APKs are ignored.
- The signing keystore is at `~/venkatesh-viom-release.keystore`; GitHub holds it as
  `KEYSTORE_BASE64`. Losing it means no installed app can ever be upgraded.
