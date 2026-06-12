# Project Instructions

## Tech Stack
- **Language**: TypeScript 5.x
- **Framework**: TanStack Start (SSR React 19 + TanStack Router + Vite 7 + Nitro)
- **Styling**: Tailwind CSS v4 (utility-first, CSS variables for theming)
- **UI components**: shadcn/ui on Radix UI primitives (`src/components/ui/`)
- **Runtime/package manager**: Bun
- **Build config**: `@lovable.dev/vite-tanstack-config` (wraps TanStack Start)
- **Deploy target**: Vercel (Nitro `vercel` preset → `.vercel/output`)

## Build & Run
- Dev: `bun run dev`
- Build: `bun run build`
- Lint: `bun run lint`
- Format: `bun run format`

## Project Structure
```
src/
  routes/       # File-based routes (TanStack Router)
  components/
    site/       # Page-level sections (Header, Hero, Footer, etc.)
    ui/         # shadcn/ui primitives — do not edit manually
  lib/          # Utilities and server-side config
  assets/       # Static images bundled by Vite
  styles.css    # Global styles + Tailwind + CSS variable theme tokens
```

## Conventions
- File naming: PascalCase for components, camelCase for utilities
- Routes: file-based via `src/routes/` — add new pages here
- CSS theming: use `var(--color-*)` tokens defined in `styles.css`, not hardcoded colours
- No tests configured; no test runner present
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`)

## Brand Theme (Poofyco-inspired redesign, 2026-06)
Colour tokens in `src/styles.css` follow the Poofyco pet-rescue template style:
- Deep navy `#232a5e` (`--color-panel` / `--color-secondary`) — dark sections, headings, footer
- Rose `#d44d66` (`--color-primary`) — CTAs, links, cat accents
- Salmon `#ee8295` (`--color-accent-warm`) — stat numbers, badges
- Blush surfaces `#fce8eb` / cream bg `#fdf7f4`; body text `#2b2d42`
- Display font: "Baloo 2" (+ Noto Sans HK for Chinese); body: Noto Sans HK
- `bg-topo` utility adds the topographic contour texture (hero)
- Never hardcode colours in components — always go through the tokens

## Adding Pages / Sections
- New routes go in `src/routes/` — TanStack Router auto-generates `routeTree.gen.ts`
- New UI sections go in `src/components/site/`
- New shadcn/ui primitives: use `bunx shadcn add <component>` (writes to `src/components/ui/`)

## Deployment
- Linked to Vercel project `hkscda` under `ynwaforevers-projects`
- Push to `main` triggers a production deployment automatically
- Preview: `vercel deploy --scope ynwaforevers-projects`
- Nitro preset: `vercel` (configured in `vite.config.ts`)
