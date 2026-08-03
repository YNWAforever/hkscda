# Project Instructions

HKSCDA (香港拯救貓狗協會) — animal-rescue site with a public adoption/donation/
volunteer journey and a role-gated admin back office.

## Tech Stack

- **Language**: TypeScript 5.x (strict; hand-written code has zero `any`)
- **Framework**: TanStack Start (SSR React 19 + TanStack Router + Vite 7 + Nitro)
- **Database**: Supabase Postgres — RLS on every table, project ref `iihqjzilgawhfdhdevam`
- **Styling**: Tailwind CSS v4 (utility-first, CSS variables for theming)
- **UI components**: shadcn/ui on Radix UI primitives (`src/components/ui/`)
- **Payments/email**: Stripe + PayPal webhooks, Resend, pdf-lib receipts
- **Abuse controls**: Upstash Redis rate limiting, Cloudflare Turnstile
- **Runtime/package manager**: Bun
- **Deploy target**: Vercel (Nitro `vercel` preset → `.vercel/output`)

## Build & Run

- Dev: `bun run dev`
- Build: `bun run build`
- Test: `bun test` (520 tests, 74 files, ~1-2s)
- Typecheck: `bunx tsc --noEmit` — **the build does NOT typecheck.** Run this
  before pushing; Vite transpiles without type checking, so type errors ship green.
- Lint: `bun run lint` (slow, ~minutes) — `bunx eslint <file>` for single files
- Format: `bun run format`

CI (`.github/workflows/ci.yml`) runs typecheck → test → lint → build on push and
PR. Lint alone takes 10+ minutes — see the note above.

## Architecture

Layered, dependency-injected. Follow this for all new server work:

```
src/routes/api/**/route.ts     Thin route: rate limit → Turnstile → delegate
  └ -handlers.ts               Wires deps (auth fn, service) into the handler factory
      └ lib/<domain>/http.server.ts   HTTP shape: parse, status codes, error mapping
          └ lib/<domain>/service.ts   Business rules — pure, no Supabase import
              └ lib/<domain>/repository.server.ts   Supabase queries only
```

Handler factories take their dependencies as arguments (`requireAdmin`, `service`,
`verifyPublicRegistration`), which is what makes them testable without a database.
Domains following this: `adoptions`, `crm`, `donations`, `volunteers`, `admin`,
`publicAdoption`, `sponsorship`.

**Legacy exception**: older admin animal surfaces (`AnimalForm`, `AnimalsTable`,
`AnimalPipeline`, `MatchPanel`) write to Supabase directly from the browser with the
anon client, guarded only by RLS. Do not copy this pattern — new mutations go through
the API layer. Their audit trail comes from a database trigger
(`log_animal_mutation`, migration `20260803120000`) that fires only when the write
carries a real JWT (`auth.uid()` is set) — service-role writes are skipped there and
must write their own `audit_log` row at the app layer instead (matching the rule
below), so the same event is never logged twice with two different actors.

## Security Invariants

- `*.server.ts` never reaches the client bundle. Secrets and the service-role
  client live behind that suffix; `import.meta.env.VITE_*` is public.
- Every admin API route calls `requireAdmin(request, roles, client)`
  (`lib/donations/supabase.server.ts`) — bearer token → `admin_user` row → role check.
  The role matrix lives in `lib/admin/access.ts` and is mirrored by RLS policies.
- Every table has RLS enabled; every `security definer` function pins its
  `search_path` — either `public, pg_temp` (the house default) or `''`, which is
  stricter and requires every reference in the body to be schema-qualified
  (see `20260719120000_document_admin_mutation_hardening.sql`). Keep both true
  for new migrations; `supabaseMigrations.test.ts` enforces it.
- App-called RPCs go in the `public` schema and must be granted to `service_role` —
  the `private` schema is not exposed to PostgREST.
- Public POST endpoints accepting a **user-submitted form** are rate limited
  (`enforceRateLimit`) and Turnstile-verified. Both fail *open* when unconfigured;
  `assertTurnstileConfigFromEnv()` boot-fails on an inconsistent production pair.
  Endpoints that receive a **browser-native automated payload** instead (e.g.
  `/api/csp-report`, populated by the browser's own CSP reporting machinery, not
  by page JS or a user action) have no Turnstile widget to obtain a token from —
  rate limiting alone is the correct control there.
- Never trust `x-forwarded-for[0]` — use `getClientIp()`.
- Admin mutations write an `audit_log` row. Match that in new domains.

## Conventions

- File naming: PascalCase components, camelCase utilities, `.server.ts` for
  server-only, `-name.ts` prefix for non-route files inside `src/routes/`
- Routes: file-based in `src/routes/` (see `src/routes/README.md`);
  `routeTree.gen.ts` is generated — never edit
- Validation: zod schemas in `lib/<domain>/schemas.ts`, parsed at the service boundary
- **Injectable clocks**: functions whose behaviour depends on time take
  `now = () => new Date()` as a parameter. Never call `Date.now()` inline in logic
  you intend to test — that is what makes tests rot on a calendar date.
- **Discarded side-effect deps**: a DI factory dependency whose result is
  intentionally ignored (e.g. an email sender that resolves to a delivery status
  the caller doesn't act on) is typed `Promise<unknown>`, never `Promise<void>` —
  TypeScript's void-return exemption does not apply through a `Promise<T>` type
  argument, so `Promise<void>` rejects the real implementation at the call site.
  Landed independently three times (`volunteers/service.ts`,
  `publicAdoption/submission.server.ts`, `sponsorship/submission.server.ts`)
  before being written down here.
- CSS theming: use `var(--color-*)` tokens from `styles.css`, never hardcoded colours
- Tests: `*.test.ts` beside the source, `bun:test`, dependency-injected fakes
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`)
- Plans/specs land in `docs/superpowers/{plans,specs}/` before large features

## Project Structure

```
src/
  routes/         File-based routes; routes/api/ = server handlers
  components/
    site/         Public page sections      admin/  Back-office UI
    ui/           shadcn/ui primitives — do not edit manually
  lib/<domain>/   schemas · service · repository.server · http.server
  styles.css      Tailwind + CSS variable theme tokens
supabase/migrations/   Timestamped SQL; RLS + grants live here
docs/superpowers/      Design specs and implementation plans
```

## Brand Theme (Poofyco-inspired redesign, 2026-06)

Colour tokens in `src/styles.css` follow the Poofyco pet-rescue template style:

- Deep indigo `#1d2353` (`--color-panel` / `--color-secondary`) — full-bleed dark bands, headings, footer
- Coral `#e05c78` (`--color-primary`) — links, eyebrows, cat accents
- Soft coral `#f27d92` (`--color-accent-warm` / `--color-cta`) — pills, stat numbers, badges, footer headings
- Lavender `#e9e9f6` zones, pink strip `#f298a4`; dashed-border rounded cards (`card-dashed` utility) are the signature card style
- Blush surfaces `#fce8eb` / cream bg `#fdf7f4`; body text `#2b2d42`
- Display font: "Baloo 2" (+ Noto Sans HK for Chinese); body: Noto Sans HK
- `bg-topo` utility adds the topographic contour texture (hero)
- Never hardcode colours in components — always go through the tokens

## Adding Pages / Sections

- New routes go in `src/routes/` — TanStack Router auto-generates `routeTree.gen.ts`
- New UI sections go in `src/components/site/`
- New shadcn/ui primitives: `bunx shadcn add <component>` (writes to `src/components/ui/`)

## Deployment

- Linked to Vercel project `hkscda` under `ynwaforevers-projects`
- Push to `main` triggers a production deployment automatically
- Preview: `vercel deploy --scope ynwaforevers-projects`
- Nitro preset: `vercel` (configured in `vite.config.ts`)
