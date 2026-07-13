# SlideMaker Public

Build presentation decks and generate images from text prompts with your own AI provider API keys (BYOK — Bring Your Own Key). Open source, self-hostable.

[日本語版はこちら](./README.ja.md)

## What it does

SlideMaker Public is a browser-based tool with two features:

- **F1 — Build a presentation**: paste in raw text, get an AI-proposed slide outline, edit it, generate an image per slide, and download a `.pptx` deck.
- **F2 — Free generation**: describe an image (optionally with reference images), generate it, and download the PNG or a single-slide `.pptx`.

There is no server-side account tier, no seat pricing, and no bundled AI cost. You supply your own Gemini and/or OpenAI API key, and the app calls those providers directly (or through a thin proxy — see below) with your key. The operator of a given deployment never sees or stores your key.

## Status

Core infrastructure — Supabase schema, row-level security, Auth, the OpenAI proxy Edge Function, and the BYOK key store — is implemented and covered by the setup/security checks described in `docs/`. The UI is still a minimal functional placeholder while the final design is built out, so a fresh clone will build and deploy but won't yet look finished. Track progress via the repository's issues and commit history.

## BYOK — how your keys are handled

- API keys (Gemini, OpenAI) are entered in the browser and stored in `localStorage` by default, or `sessionStorage` if you choose the "clear on tab close" option. Nothing is written to a database or server-side log.
- Gemini calls go straight from your browser to `generativelanguage.googleapis.com` — your key never leaves the browser except to Google.
- OpenAI's image API doesn't support browser CORS, so OpenAI calls are relayed through a Supabase Edge Function. Your key is sent once per request, used to call OpenAI, and discarded when the request finishes — it is never logged or persisted (see `docs/ARCHITECTURE.md` for the full design).
- Get an API key: [Google AI Studio](https://aistudio.google.com/apikey) (Gemini) or [OpenAI API keys](https://platform.openai.com/api-keys) (OpenAI).

You are billed directly by Google/OpenAI for your own usage. The app itself is free to run; hosting costs (Supabase, Vercel) are the deployer's responsibility.

## Architecture at a glance

```
                 ┌─────────────────────────┐
                 │        Browser (SPA)     │
                 │  BYOK keys in local/session storage
                 └───────────┬─────────────┘
                              │
         ┌────────────────────┼───────────────────────┐
         │                    │                        │
         ▼                    ▼                        ▼
 Gemini API (direct)   Supabase Auth / Postgres   Supabase Edge Function
 generativelanguage.       + Storage               gpt-image-proxy
 googleapis.com         (RLS, per-user data)        (JWT required)
                                                           │
                                                           ▼
                                                    OpenAI Images API
```

- **Auth**: Supabase Auth, Google OAuth only. All app routes require a session.
- **Data**: Supabase Postgres, every table scoped to `auth.uid()` via row-level security — no table has a policy that lets one user read another's row.
- **Storage**: Supabase Storage, private buckets, one folder per user (`{userId}/...`), enforced by Storage RLS.
- **OpenAI relay**: a single Deno Edge Function (`gpt-image-proxy`) that requires a valid Supabase JWT and the caller's OpenAI key, forwards the request, and returns only a static error message on failure (never the upstream body).

Full design rationale: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Self-hosting

Running your own instance means your own Supabase project and your own Vercel deployment — no shared infrastructure with any other deployment of this code.

Quick summary (full walkthrough in [docs/SETUP.md](./docs/SETUP.md)):

1. Create a Supabase project and run `supabase link` + `supabase db push` to apply `supabase/migrations/`.
2. Enable Google OAuth in Supabase Auth.
3. Deploy the Edge Function: `supabase functions deploy gpt-image-proxy`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel environment variables and deploy.
5. Lock down the CSP `connect-src` to your own Supabase project (see "Security hardening" in `docs/SETUP.md`).

## Tech stack

- Frontend: Vite, React, TypeScript (strict mode)
- Auth / DB / Storage / Edge Functions: Supabase
- AI: Gemini (`@google/genai`, called directly from the browser), OpenAI `gpt-image-2` (called through the Edge Function)
- PPTX generation: `pptxgenjs`
- Hosting: Vercel (static SPA)

See `package.json` for exact dependency versions.

## Documentation

- [docs/SETUP.md](./docs/SETUP.md) — full self-hosting walkthrough
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — system design, BYOK rationale, RLS policy, Edge Function security
- [CONTRIBUTING.md](./CONTRIBUTING.md) — development setup and PR guidelines
- [SECURITY.md](./SECURITY.md) — vulnerability reporting

## License

MIT — see [LICENSE](./LICENSE).
