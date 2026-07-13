# Contributing

Thanks for considering a contribution to SlideMaker Public. This is a small, focused project (BYOK slide/image generation), and the guidelines below are meant to keep it that way.

## Development setup

Prerequisites: Node.js 20+, npm, and a Supabase project to point the app at (see [docs/SETUP.md](./docs/SETUP.md) — you can use your own free-tier project for local development).

```bash
git clone https://github.com/<your-fork>/slidemaker-public.git
cd slidemaker-public
npm ci
cp .env.example .env
# edit .env: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your own Supabase project
npm run dev
```

`npm run build` runs `tsc -b` (strict type-check) followed by the Vite production build — run this before opening a PR, since it's also what CI runs.

## Making a change

1. Fork the repo and create a branch off `main`.
2. Make your change. If it touches `supabase/migrations/`, add a new migration file rather than editing an existing one (existing migrations may already be applied to real projects).
3. Run `npm run build` and fix any type errors.
4. Open a PR against `main` using the provided PR template. Fill in the summary, how you tested it, and the checklist (build passes, no secrets added, RLS implications considered if you touched `supabase/`, docs updated if setup/behavior changed).

CI (`.github/workflows/ci.yml`) runs `npm run build`, a gitleaks secret scan, and a check that no `AIza…`/`sk-…`-shaped strings appear in the built `dist/assets/*.js` — a PR won't merge if any of these fail.

## Coding conventions

This codebase follows a consistent style; please match it rather than introducing a new one in a single file.

- **TypeScript strict mode.** `tsconfig.json` has `strict`, `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch` on — code should compile clean under all of them.
- **Immutable data.** Don't mutate objects/arrays in place; build new ones (`{ ...obj, field: next }`, `[...arr, item]`, `array.map(...)` instead of `array.forEach` + push-mutate). This is visible throughout `src/lib/` and should stay that way.
- **No `console.log`/`console.error` on anything sensitive.** This matters more than usual here: `src/lib/apiKeyStore.ts` and the `gpt-image-proxy` Edge Function exist specifically so that API keys, prompts, and upstream response bodies never get logged (see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)). Errors should be thrown with a clear message rather than logged and swallowed.
- **Small, focused files.** Prefer many small modules over one large one — `src/lib/` is organized by concern (`gemini/`, `openai/`, `ppt/`, `storage/`) rather than by type. New code should follow the same layout: a new AI-provider integration gets its own directory, not a growing `services.ts`.
- **Validate at the boundary.** Anything crossing a trust boundary — Edge Function request bodies, TSV paste input, uploaded files — should be validated before use, not assumed well-formed. See `isValidBody()` in `supabase/functions/gpt-image-proxy/index.ts` for the pattern this project uses.
- **`apiKeyStore.ts` is the only place that touches key storage.** If you need to read or write a BYOK key, add a function there rather than calling `localStorage`/`sessionStorage` directly elsewhere.

There's no formal test suite in the repository yet. If you add non-trivial logic (parsing, prompt construction, RLS-adjacent logic), consider adding focused unit tests alongside it — but don't block a small fix on introducing a whole test harness unless you're already touching one.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add reference image reordering to F1 editor
fix: correct aspect ratio mapping for gpt-image-2 portrait sizes
docs: clarify Google OAuth redirect URI in SETUP.md
refactor: extract signed-url helper out of generatedImages.ts
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`.

## Reporting bugs / requesting features

Use the issue templates under `.github/ISSUE_TEMPLATE/`. For security issues, do **not** open a public issue — see [SECURITY.md](./SECURITY.md) instead.

## Content review for anything prompt- or template-related

If your change adds or edits files under `src/prompts/` or `public/defaults/`, keep in mind these ship in a public repository and are visible to anyone — don't include real user data, internal URLs, or anything you wouldn't want indexed publicly.
