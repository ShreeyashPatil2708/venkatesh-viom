# Venkatesh Viom — society app

Residents (owners and tenants) raise complaints, suggestions and enquiries. The managing
committee works them from an admin panel. Email goes out automatically both ways: to the
committee when something is raised, back to the resident when the status changes.

- **Android** — installable APK, forwarded on WhatsApp.
- **Everyone else (iPhone, laptops)** — the same app at the website link.

The APK is a thin shell around the hosted site, so deploying a fix reaches installed phones
immediately. A new APK is only needed if the app icon, name or shell itself changes.

Stack: React + Vite + TypeScript + Tailwind · Supabase (Postgres, Auth, Storage, Edge
Functions) · Brevo for email · Vercel hosting · Capacitor for the APK. Every tier used is
free at society scale.

---

## Setup, in order

Nothing below costs money. Steps 1–7 are one-time.

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (free tier, region Mumbai or
   Singapore).
2. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
3. Locally: `cp .env.example .env` and paste both in, plus the society name:

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhb...
   VITE_SOCIETY_NAME=Venkatesh Viom
   ```

### 2. Create the database

Open **SQL Editor** in Supabase, paste the whole of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and run it. It
creates the tables, row-level security, the photo bucket and the notification triggers.

(With the Supabase CLI installed, `supabase link` then `supabase db push` does the same.)

### 3. Brevo, for email

1. Sign up at [brevo.com](https://www.brevo.com) (free: 300 emails/day).
2. **Senders, Domains & Dedicated IPs → Senders**: add your email address as a sender and
   click the verification link it emails you. This is the "from" address residents see.
3. **SMTP & API → SMTP**: note the server, port `587`, login and the SMTP key.
4. **SMTP & API → API Keys**: create an API key (`v3`) and copy it.

### 4. Point Supabase Auth at Brevo

Supabase's built-in mailer only allows a few emails *per hour*, which would break login.

1. **Authentication → Emails → SMTP Settings**: enable custom SMTP and enter the Brevo
   host, port 587, login, SMTP key, and your verified sender address and name.
2. **Authentication → Emails → Templates**: the app signs people in with a 6-digit code, so
   both templates must contain the token. Edit **Magic Link** and **Confirm signup** to:

   ```html
   <h2>Your sign-in code</h2>
   <p>Enter this code in the society app:</p>
   <p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
   <p>It expires in 10 minutes. If you did not request it, ignore this email.</p>
   ```

3. **Authentication → Sign In / Providers → Email**: keep Email enabled, and leave
   "Confirm email" on.

### 5. Deploy the two email functions

Needs the [Supabase CLI](https://supabase.com/docs/guides/local-development) once:
`brew install supabase/tap/supabase`.

```bash
supabase login
supabase link --project-ref <your-project-ref>

# WEBHOOK_SECRET is any long random string — generate one and keep it:
openssl rand -hex 32

supabase secrets set \
  BREVO_API_KEY=xkeysib-...               \
  MAIL_FROM_EMAIL=viompune@gmail.com           \
  MAIL_FROM_NAME="Venkatesh Viom"         \
  SOCIETY_NAME="Venkatesh Viom"           \
  APP_URL=https://your-app.vercel.app     \
  WEBHOOK_SECRET=<the random string>

supabase functions deploy notify-new-ticket
supabase functions deploy notify-status-change
```

Then tell the database where to find them — in the SQL Editor, with the same secret:

```sql
insert into app_config (key, value) values
  ('edge_base_url', 'https://<your-project-ref>.supabase.co/functions/v1'),
  ('webhook_secret', '<the same random string>'),
  -- Copied on every new request, whoever is on the committee at the time.
  -- Comma separated if you want more than one.
  ('archive_emails', 'viompune@gmail.com')
on conflict (key) do update set value = excluded.value;
```

Until these two rows exist the app works normally and simply sends no email.

### 6. Deploy the website

```bash
npm i -g vercel
vercel          # first run: link the project
vercel --prod
```

In the Vercel dashboard → **Settings → Environment Variables**, add
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_SOCIETY_NAME`, then redeploy.
Note the final URL — it must match `APP_URL` in step 5.

### 7. Make yourself the admin, then add the flats

1. Load the flat list first, so the sign-up form has something to choose from. In the SQL
   Editor, run [`supabase/seed/flats.sql`](supabase/seed/flats.sql) — it creates all 88
   flats (wings A and B, 11 floors, 4 per floor: `A-101` … `B-1104`). Safe to re-run.

2. Open the deployed site, sign in with your email, and fill in the sign-up form.

3. Promote yourself in the SQL Editor:

   ```sql
   update profiles set role = 'admin', status = 'approved'
   where email = 'you@example.com';
   ```

4. Reload the app. An **Admin** tab appears. Under **Members**, approve residents as they
   sign up and set the secretary, treasurer and committee members to **Committee** or
   **Admin**. Under **Flats** you can add or remove flats later without touching SQL.

   | Role | Can do |
   | --- | --- |
   | Resident | Raise and track their own requests, read notices |
   | Committee | All of that, plus work every request and post notices |
   | Admin | All of that, plus approve members and change roles |

### 8. Build the APK

One-time: create the signing key and **back it up**. Lose it and future APKs cannot upgrade
an installed app — everyone would have to uninstall and reinstall.

```bash
keytool -genkey -v -keystore release.keystore -alias society \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -i release.keystore | pbcopy     # now on your clipboard
```

Push the repo to a **private** GitHub repo (`gh repo create`), then in
**Settings → Secrets and variables → Actions** add:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `VITE_SUPABASE_URL` | Supabase project URL |
| Secret | `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| Secret | `KEYSTORE_BASE64` | the clipboard contents above |
| Secret | `KEYSTORE_PASSWORD` | keystore password you chose |
| Secret | `KEY_ALIAS` | `society` |
| Secret | `KEY_PASSWORD` | key password you chose |
| Variable | `APP_URL` | `https://your-app.vercel.app` |
| Variable | `SOCIETY_NAME` | `Venkatesh Viom` |

Run **Actions → Build Android APK → Run workflow**, then download the
`society-app-apk` artifact. Put the APK where residents can download it too:

```bash
cp ~/Downloads/society-app.apk public/app/viom.apk
vercel --prod
```

### 9. Send it out

The install page lives at `https://your-app.vercel.app/get` and explains both platforms.
A WhatsApp message that works:

> *Hi all — our society app is ready.*
> *Android: install the file attached below. Tap it, allow the install when Android asks,
> and tap "Install anyway" if you see a warning — that appears for any app not from the
> Play Store.*
> *iPhone: open this link and bookmark it — https://your-app.vercel.app*
> *Sign in with your email, choose your flat, and we'll approve you. Then raise complaints,
> suggestions or enquiries any time.*

Attach the APK file to the same message.

---

## Day-to-day

### When the committee changes

Nothing needs rebuilding or redeploying. New-request emails go to whoever currently holds
the **Committee** or **Admin** role, looked up fresh every time an email is sent, plus the
standing `archive_emails` addresses in `app_config`. So at
handover the outgoing admin just opens **Admin → Members** and:

1. sets the incoming members to **Committee**, and at least one to **Admin**;
2. sets the outgoing members back to **Resident** — they keep their own flat and requests,
   they simply stop receiving committee email and lose the Admin tab.

Do step 1 before step 2, so there is always at least one Admin.

Two things are *not* dynamic, and both are deliberate:

- **The "from" address** (`MAIL_FROM_EMAIL`). Use a society-owned mailbox such as
  `viompune@gmail.com`, never a current member's personal email — otherwise handover
  breaks the sending address.
- **The accounts** (Supabase, Vercel, Brevo, GitHub). Create all four under that same
  society mailbox so they can be handed on with the committee. Changing them later means
  migrating the database.

### Everyday tasks

| Task | How |
| --- | --- |
| Change the app, website and APK behaviour | edit, `vercel --prod` — installed APKs pick it up |
| New APK (icon, name or shell changed) | re-run the GitHub Action, re-send the file |
| An email did not arrive | `select * from email_log order by sent_at desc limit 20;` — `error` says why |
| Check the Brevo daily cap | Brevo dashboard → Statistics |

Supabase pauses free projects after ~7 days with no activity. Daily use avoids it; if it
does pause, open the dashboard to resume.

## Local development

```bash
npm install
npm run dev              # http://localhost:5173
npm run build            # typecheck + production build
npm run check:functions  # the two Edge Functions compile
supabase/tests/run.sh    # row-level security + notification triggers (needs Docker)
```

`npm run dev -- --host` serves on your network so you can open it on a phone.

## Not in this version

SMS and WhatsApp notifications. Indian SMS needs a paid gateway plus DLT sender
registration; WhatsApp needs a Meta Business account with approved templates and per-message
cost. The email functions in `supabase/functions/` are the place to add either as an extra
channel.

## Layout

```
src/lib/            supabase client, auth context, types, image compression
src/components/      layout shell and shared UI
src/routes/          resident screens
src/routes/admin/    committee screens
supabase/migrations/ schema, RLS, triggers
supabase/seed/        the society's flat list
supabase/functions/  the two notification emails
android/             Capacitor shell (generated, committed so CI can build it)
.github/workflows/   APK build
```
