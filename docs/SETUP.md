# Self-hosting setup

This walks through deploying your own instance of SlideMaker Public: a Supabase project for auth/database/storage/functions, and a Vercel deployment for the static frontend. No infrastructure is shared with any other deployment — every self-hosted instance is fully isolated.

Prerequisites:

- Node.js 20+ and npm
- A [Supabase](https://supabase.com) account (the free tier is enough to start)
- A [Vercel](https://vercel.com) account (or any static host that can set the two build-time env vars below)
- The [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) installed (`npm install -g supabase` or your platform's package manager)
- The [GitHub CLI](https://cli.github.com) or `git`, to clone the repository

## 1. Clone and install

```bash
git clone https://github.com/<your-fork-or-org>/slidemaker-public.git
cd slidemaker-public
npm ci
```

## 2. Create a Supabase project

1. In the [Supabase dashboard](https://supabase.com/dashboard), create a new project. Note the project reference (the `<your-project-ref>` in `https://<your-project-ref>.supabase.co`).
2. Log in and link the CLI to your project:

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

## 3. Apply the database migrations

The schema (four tables under the `slidemakerpublic_` prefix, all with row-level security) and the storage buckets/policies live in `supabase/migrations/`.

```bash
supabase db push
```

This creates:

- `slidemakerpublic_user_settings`, `slidemakerpublic_design_templates`, `slidemakerpublic_reference_images`, `slidemakerpublic_generations` — each with row-level security enabled and `auth.uid() = user_id` policies for select/insert/update/delete
- Three private Storage buckets: `slidemakerpublic-pptx-templates`, `slidemakerpublic-reference-images`, `slidemakerpublic-generated-images`, each with an own-folder RLS policy (`{userId}/...`)

Verify with `supabase db diff` (should be empty) or by checking **Table Editor** / **Storage** in the dashboard.

## 4. Configure Google OAuth in Supabase Auth

The app uses Google OAuth only (no email/password, no magic link).

1. In [Google Cloud Console](https://console.cloud.google.com), create (or reuse) a project, then go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Authorized redirect URI: use the callback URL Supabase shows you in the next step (typically `https://<your-project-ref>.supabase.co/auth/v1/callback`).
4. Copy the generated **Client ID** and **Client Secret**.
5. In the Supabase dashboard, go to **Authentication → Providers → Google**, enable it, and paste in the Client ID/Secret.
6. In **Authentication → URL Configuration**, set the **Site URL** to your eventual Vercel deployment URL (you can update this after step 6 once you know the final domain).

## 5. Deploy the Edge Function

The OpenAI relay (`gpt-image-proxy`) runs as a Supabase Edge Function. It requires a valid user JWT and never persists or logs the caller's OpenAI key (see [docs/ARCHITECTURE.md](./ARCHITECTURE.md) for the design).

```bash
supabase functions deploy gpt-image-proxy
```

`supabase/config.toml` already sets `verify_jwt = true` for this function, so unauthenticated calls are rejected at the platform level before your code even runs.

## 6. Deploy the frontend to Vercel

1. Import the repository into Vercel (or run `vercel` from the CLI).
2. In the project's **Environment Variables**, set:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | your project's anon/public key (Supabase dashboard → **Project Settings → API**) |

3. Deploy. `vercel.json` already configures the SPA rewrite and security headers (CSP, HSTS, etc.) — no extra Vercel config is needed.
4. Once you have the final deployment URL, go back to Supabase **Authentication → URL Configuration** and set the **Site URL** (and any preview-deployment URLs you want to allow) accordingly.

## 7. Verify

- Visit your deployment URL and confirm the landing page loads over HTTPS with no console errors.
- Confirm Google sign-in redirects back to your app successfully.
- Open browser dev tools → Application → Local Storage and confirm no Supabase service-role key or OpenAI/Gemini key appears anywhere except the `slidemakerpublic.byok.*` entries you enter yourself.
- Optional but recommended: run through the security checks anyone deploying this app should verify before going further — RLS actually blocks cross-user reads (test with two accounts), the Edge Function returns 401 without a JWT and 401 without the `X-User-OpenAI-Key` header, and `dist/assets/*.js` (from `npm run build`) contains no `AIza...`/`sk-...` patterns (the CI workflow in `.github/workflows/ci.yml` asserts this automatically on every push).

## Security hardening

### Lock down the CSP `connect-src` to your own project

`vercel.json` ships with:

```
connect-src 'self' https://generativelanguage.googleapis.com https://*.supabase.co;
```

The `https://*.supabase.co` wildcard works out of the box for any Supabase project without extra configuration, which is why it's the default. Once you know your project ref, tighten it to your exact project:

```
connect-src 'self' https://generativelanguage.googleapis.com https://<your-project-ref>.supabase.co;
```

Why this matters: the Content-Security-Policy's `connect-src` directive is the browser-enforced allowlist of hosts the page is permitted to send requests to. If the app were ever compromised by an XSS vulnerability (in a dependency, a browser extension, etc.), `connect-src` is what limits where an attacker's injected script could exfiltrate data (including anything read from `localStorage`, such as your BYOK keys) to. A wildcard like `https://*.supabase.co` still blocks exfiltration to arbitrary attacker-controlled domains, but it does allow requests to *any* Supabase project, not just yours. Pinning it to `https://<your-project-ref>.supabase.co` closes that gap.

After editing `vercel.json`, redeploy for the change to take effect.

### Rotate keys if you ever suspect exposure

If you accidentally commit a Supabase service-role key, or suspect your Google OAuth client secret leaked, rotate it immediately from the respective dashboard. The anon/public key is safe to expose (it's designed to be used from the browser and is meaningless without RLS-compliant requests), but service-role keys and OAuth client secrets are not.
