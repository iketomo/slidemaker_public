# Security Policy

## Supported versions

SlideMaker Public doesn't currently maintain versioned releases — `main` is the supported branch. If you're running a self-hosted instance, pull the latest `main` to pick up security fixes.

## Reporting a vulnerability

<!-- TODO(maintainer): replace with a real inbox before this repo goes public, and update the address below in both places. -->

Please report suspected vulnerabilities privately to **security@example.com** rather than opening a public issue. If your GitHub repository has [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) enabled, that's the preferred channel — it keeps the report and any discussion out of the public issue tracker until a fix is ready.

When reporting, please include:

- A description of the issue and its potential impact
- Steps to reproduce, or a proof-of-concept if you have one
- The affected component (frontend, Supabase migrations/RLS policies, the `gpt-image-proxy` Edge Function, CI/build config, etc.)
- Any logs or screenshots that help — but please **redact API keys, JWTs, and other secrets** before sharing anything, even in a private report

We'll acknowledge reports as promptly as we can and keep you updated as a fix is worked on. Please give us a reasonable window to investigate and patch before any public disclosure.

## Disclosure policy

We ask for **90 days** from initial report before public disclosure, to allow time to investigate, fix, and roll out a patch (including giving self-hosted deployments a chance to update). If a fix ships sooner, we're happy to coordinate an earlier disclosure with you. If 90 days pass without a resolution, you're free to disclose — we'd just appreciate a heads-up first.

## Scope notes specific to this project's design

SlideMaker Public is BYOK (Bring Your Own Key): Gemini and OpenAI API keys are entered by each user and stored client-side (`localStorage` or `sessionStorage`, depending on the user's chosen persistence mode — see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)). This shapes what's most worth scrutinizing:

- **XSS is high-severity here**, more so than in a typical app without BYOK secrets in browser storage — a successful script injection could read a user's stored API key. Please treat any XSS finding (stored, reflected, or DOM-based) as a priority report.
- **The Content-Security-Policy `connect-src` allowlist** (`vercel.json`) is a deliberate second line of defense limiting where an injected script could exfiltrate data even if XSS occurred. Changes that widen `connect-src`, weaken the CSP, or introduce a new outbound request path deserve extra scrutiny in review.
- **Dependency hygiene matters more than usual.** Because a compromised npm dependency could read `localStorage` (and therefore BYOK keys) at runtime, we try to keep the dependency tree small and keep `package-lock.json` committed so installs are reproducible. If you find a supply-chain concern (typosquatted package, compromised maintainer account, suspicious postinstall script, etc.) in a dependency this project uses, please report it the same way as a code vulnerability.
- **The `gpt-image-proxy` Edge Function** is the one place a user's OpenAI key transits a server we run. It's designed to require a valid Supabase JWT, never log the key or request/response bodies, and discard the key once the request completes (see `docs/ARCHITECTURE.md`). Any way to make it log, persist, or leak a key — or to call it without valid auth — is a critical-severity finding.
- **Row-level security bypass.** Every table and Storage bucket is meant to be scoped so one authenticated user can never read or write another user's row/file. A working RLS bypass (via the app, a Postgres function, or a Storage policy gap) is a critical-severity finding.

Reports about the *hosted* instance at any particular deployment's domain (rate limiting behavior, DoS resistance, etc.) should go to whoever operates that instance — this file covers the open-source codebase itself.
