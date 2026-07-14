# HKSCDA Brand Audit

## Scope

This audit records the evidence used for the HKSCDA public-site restoration. The review covered the supplied official website references (`https://hkscda.com/` and the deployed app at `https://hkscda.vercel.app/`), the repository brand asset at `public/brand/hkscda-logo-primary.jpg`, public route source, and the current visual token layer in `src/styles.css`.

The original-site review was constrained by the live site's Cloudflare challenge in the automated environment. The repository logo asset was therefore treated as the authoritative visual source for the restoration, with its wordmark and mark proportions preserved rather than redrawn.

## Findings

| Area | Finding | Decision |
| --- | --- | --- |
| Identity | Public surfaces mixed HKSCDA content with a paw-substitute/Poofyco visual system. | Remove the substitute identity and restore the supplied HKSCDA mark. |
| Colour | Public UI used unrelated pink, lavender, and topology aliases with no stable semantic ownership. | Establish official blue and magenta anchors, then derive role-based semantic tokens. |
| Typography | Display treatment did not consistently support Chinese copy or the association name. | Use Noto Sans HK with a consistent display/body stack and preserve bilingual labels. |
| Layout | Shared public chrome was inconsistent across information, adoption, donation, and status routes. | Consolidate public shell, logo, actions, focus states, and recovery states. |
| Trust | Some pages exposed unverified impact phrasing and weak missing-link recovery. | Keep verified impact content and provide privacy-safe recovery copy with contact paths. |
| Responsive behaviour | Narrow layouts could overflow in help, donation, home, and social surfaces. | Add explicit one-column fallbacks, minimum-width constraints, wrapping, and overflow protection. |

## Canonical identity

- Association name: 香港拯救貓狗協會 / HKSCDA.
- Primary asset: `public/brand/hkscda-logo-primary.jpg`.
- Primary colour: `#05648e`, a deep official blue sampled from the supplied identity source.
- Secondary colour: `#a61c56`, the official magenta used for secondary emphasis and donation actions.
- Logo rule: use the supplied mark with its native aspect ratio; do not stretch, crop, recolour, or replace it with a paw-print substitute.
- Public font rule: `Noto Sans HK`, with system fallbacks for resilient first paint.

## Accessibility and trust

White text on the canonical blue measures approximately 6.52:1, and white text on the canonical magenta measures approximately 7.19:1. Both clear the WCAG AA normal-text threshold used by the contrast guard in `src/lib/brand/contrast.test.ts`.

Public forms and state routes now preserve visible labels, keyboard focus treatment, role-based alerts, and recovery actions. The browser verifier also checks for one meaningful heading, no horizontal overflow at the supported viewports, usable tab order, and reduced-motion behaviour.

## Follow-up ownership

- Keep `src/styles.css` as the source of truth for public semantic tokens.
- Keep compatibility aliases inside `.admin-shell` only until the operational admin surface is migrated independently.
- Treat new public copy as verified source content; avoid invented counts, partner claims, or impact figures.
- Re-run `bun run verify:brand` after changes to public routes, shared shell, typography, or image loading.