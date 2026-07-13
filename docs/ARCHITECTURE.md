# Architecture

## Overview

SlideMaker Public is a single-page app with no application server of its own. It talks to three kinds of backends directly from the browser:

```
                         ┌───────────────────────────────┐
                         │           Browser (SPA)        │
                         │  Vite + React + TypeScript      │
                         │                                  │
                         │  BYOK keys → localStorage /      │
                         │              sessionStorage       │
                         └──────┬───────────┬───────────────┘
                                │           │
              ┌─────────────────┘           └──────────────────┐
              │                                                 │
              ▼                                                 ▼
   generativelanguage.googleapis.com              Supabase (per self-hosted project)
   (Gemini — called directly with the             ┌─────────────────────────────┐
    user's Gemini key, no proxy)                  │ Auth (Google OAuth only)     │
                                                    │ Postgres (RLS on every table)│
                                                    │ Storage (private, own-folder)│
                                                    │ Edge Function: gpt-image-proxy│
                                                    └───────────────┬───────────────┘
                                                                    │
                                                                    ▼
                                                          api.openai.com
                                                    (OpenAI — called by the Edge
                                                     Function using the user's
                                                     OpenAI key, forwarded per-request)
```

There is no operator-owned database of API keys, no operator-owned AI billing account in the request path, and no custom Node/Express server — everything that isn't the static SPA runs on Supabase's managed Postgres, Storage, Auth, and Edge Functions.

## Why BYOK (Bring Your Own Key)

The app never asks a user for payment and never calls an AI provider using an operator-held key. Two things follow directly from that:

1. **No server-side key to protect.** There's no API-key database to breach, no billing account tied to app usage that could be drained by abuse, and no incentive to log prompts/keys "just in case" for cost attribution — so the codebase simply doesn't have that logging.
2. **Users own their usage and their bill.** Gemini and OpenAI charge each user's own account, so cost, quota, and rate limits are between the user and the provider, not mediated by this app (beyond the light per-user rate limit described below, which exists to protect the Edge Function from runaway usage, not to meter cost).

The trade-off is that BYOK pushes key management into the browser, which has its own risks — covered next.

### `localStorage` vs `sessionStorage`, and the residual risk

Keys are stored client-side via `src/lib/apiKeyStore.ts`, which is the single module allowed to touch `localStorage`/`sessionStorage` directly — no other file reads or writes a key from storage, which keeps the "where could a key leak from" surface to one file.

Two persistence modes are offered:

- **`localStorage` (default)** — the key survives browser restarts. Convenient, but it also means the key sits on disk indefinitely until the user clears it, and any successful XSS on the page can read it for as long as it's there.
- **`sessionStorage`** — the key is cleared when the tab closes. Users who prefer not to leave a long-lived key on their machine (e.g. shared/managed computers) can opt into this from the settings screen.

Neither mode encrypts the key at rest — this is a deliberate scope decision for v1 (see the "v2 and beyond" note in the repo's internal planning) rather than an oversight, and it's why the CSP `connect-src` allowlist (see below and `docs/SETUP.md`'s "Security hardening" section) and dependency hygiene matter as much as they do: with an unencrypted key in storage, the main realistic threat is a successful XSS or a malicious/compromised dependency reading `localStorage`, not an attacker with disk access to reverse an encrypted blob. `connect-src` limits where a hypothetical malicious script could send that key even if it did manage to read it. `CONTRIBUTING.md` asks contributors to keep this in mind when adding dependencies.

Keys are also never sent to console, never put in the URL, and never sent to any endpoint other than the AI provider itself (Gemini directly, OpenAI via the proxy — see below).

## Model call paths

### Gemini — direct from the browser

`generativelanguage.googleapis.com` supports CORS, so `src/lib/gemini/client.ts` calls it directly with the user's key (`@google/genai`, `getAiClient()` reads the key from `apiKeyStore`). No SlideMaker Public infrastructure is in this path at all — a compromised or unavailable Supabase project doesn't affect Gemini calls.

### OpenAI — via the `gpt-image-proxy` Edge Function

OpenAI's Images API does not support CORS from a browser, so it has to be relayed by *something*. That something is a single-purpose Supabase Edge Function (`supabase/functions/gpt-image-proxy/index.ts`), not a general-purpose backend — it only proxies image generate/edit calls, nothing else.

Design points, in order of how a request flows through it:

1. **JWT required, checked without `service_role`.** The function reads the caller's `Authorization` header, passes it straight through to a Supabase client (`createClient(url, anonKey, { global: { headers: { Authorization } } })`), and calls `auth.getUser()`. If that doesn't resolve to a user, the request is rejected with 401. Using the anon key + the caller's own JWT (instead of `service_role`) means the function inherits the caller's actual auth state instead of an all-access credential — there's no elevated key in this function that could be misused if the function's environment were ever compromised.
2. **`X-User-OpenAI-Key` required.** Requests without a caller-supplied OpenAI key are rejected with 401 before any upstream call is made.
3. **Request-scoped only, never persisted.** The key is read from the header, used to build the outbound `Authorization: Bearer` header for the OpenAI call, and goes out of scope when the request handler returns. It isn't written to a database, cache, or file.
4. **No logging of anything sensitive.** The function contains no `console.log`/`console.error` calls that could emit the key, the prompt, uploaded images, or the upstream response body — Supabase Function Logs would otherwise be a place all of that could end up.
5. **Static error messages only.** If the upstream OpenAI call fails, the function reads and discards the response body rather than relaying it to the client — this is deliberate, since the upstream body could otherwise be used to echo the prompt back through an error path, or leak details about the failure that aren't useful to expose. The client gets a fixed message plus the mapped status code (401 for a rejected key, 429 for rate limiting, 502/504 for other upstream failures).
6. **Bounded payloads and timeouts.** Prompt length, image count/size, and the `n` (image count) parameter are all validated against fixed limits before any upstream call; requests are aborted after 60s (generate) / 120s (edit) via `AbortController`.
7. **Outbound headers are minimal.** Only `Authorization`, `Content-Type` (for `generate`; `edit` uses `FormData`, which sets its own multipart `Content-Type`), and a fixed `User-Agent: slidemakerpublic/1.0` are sent to OpenAI — nothing from the inbound request is forwarded verbatim.
8. **Per-user rate limiting — best-effort by design.** Requests are limited per `user_id` (from the verified JWT), separately for `generate` (10/min) and `edit` (5/min), using an in-memory sliding window (`Map`) inside the function. This is intentionally *not* backed by Postgres or Redis: it's cheap, requires no extra infrastructure, and is good enough to blunt accidental runaway loops or basic abuse. The trade-off, documented in the function's own comments, is that Supabase Edge Functions can run as multiple isolated instances, so the limit is enforced per-instance rather than globally — the effective ceiling can be somewhat higher than the configured number under concurrent load across instances. If you need a hard, globally-enforced limit, replace the in-memory store with a shared one (Postgres table with a counter, or Upstash/Redis).

## Data model and RLS policy

Every table introduced by this app is prefixed `slidemakerpublic_` (so a shared Supabase project with other apps doesn't collide), and every table follows the same rule without exception: **row-level security is enabled, and the only policies are `auth.uid() = user_id` for select/insert/update/delete.** There is no policy for the `anon` role on any table — an unauthenticated request returns zero rows, not an error, which is what RLS does by default when no policy grants access.

| Table | Purpose |
|---|---|
| `slidemakerpublic_user_settings` | One row per user: crop margins for slide-image PPTX generation, template path, default model/aspect ratio |
| `slidemakerpublic_design_templates` | User-authored reusable "design request" text snippets for F1 |
| `slidemakerpublic_reference_images` | Metadata for a user's uploaded reference image library (F1) |
| `slidemakerpublic_generations` | One row per generation (F1 or F2): input text, generation metadata, and the metadata of any images persisted to Storage (see below) |

The migrations in `supabase/migrations/` create the RLS policies in the *same* migration as the table itself, so there is never a window where a table exists without RLS enabled.

Storage follows the same shape: three private buckets (`slidemakerpublic-pptx-templates`, `slidemakerpublic-reference-images`, `slidemakerpublic-generated-images`), each with a single `for all` policy requiring the first path segment to equal `auth.uid()::text` (an "own-folder" pattern via `storage.foldername(name)`). The app never calls `getPublicUrl()`; all reads go through `createSignedUrl()` with a short expiry (5 minutes by default for generated images — see `src/lib/storage/generatedImages.ts`), so a leaked signed URL is a small, time-boxed exposure rather than a permanent public link.

## Generated image persistence flow

Both F1 (per slide) and F2 (per generated image) images are uploaded to the `slidemakerpublic-generated-images` bucket and recorded in `slidemakerpublic_generations`:

1. The client generates one or more images (via Gemini directly or via the OpenAI proxy).
2. `uploadGeneratedImages()` (`src/lib/storage/generatedImages.ts`) uploads each image to `{userId}/{generationId}/{index}.png`, in parallel, using `Promise.allSettled` so a single failed upload doesn't silently drop the others.
3. If any upload fails, the successfully-uploaded siblings are removed (best-effort) before the error is thrown — the goal is to avoid orphaned files sitting in Storage with no corresponding database row.
4. Once all uploads succeed, a single row is inserted into `slidemakerpublic_generations` with `feature`, `input_text`, `metadata`, and an `images` JSON array (`storage_path`, `mime_type`, `width`, `height`, `model` per image). If that insert fails, the just-uploaded images are removed the same way, so a generation is never half-recorded (files in Storage with no DB row, or vice versa).
5. History screens read `slidemakerpublic_generations` and fetch a signed URL per image on demand rather than storing or caching a long-lived URL.

## What deliberately isn't here

- No custom Express/Node server — everything is either the static SPA or a Supabase Edge Function.
- No operator-held AI provider keys anywhere in the codebase or environment — BYOK is the only path.
- No `service_role` key used in the Edge Function — it authenticates as the calling user via their JWT, so a bug in the function can't accidentally bypass RLS.
- No public Storage URLs — everything goes through RLS-checked, short-lived signed URLs.
