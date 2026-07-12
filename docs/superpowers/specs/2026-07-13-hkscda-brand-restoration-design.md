# HKSCDA Brand Restoration and Public-Site Redesign

Date: 2026-07-13
Status: Approved design
Branch: `codex/hkscda-brand-restoration`

## Purpose

Restore the authentic visual identity of 香港拯救貓狗協會 / Hong Kong Saving Cat and Dog Association (HKSCDA) across the public website. Replace the current generic pet-charity treatment with a trustworthy, caring, warm, hopeful, community-led, and professional Hong Kong animal-rescue identity.

The redesign must remain recognisably HKSCDA. It must not become a commercial pet shop, a generic pet lifestyle product, or a children's animal website.

## Approved Product Decisions

1. Scope is the complete public experience: public content, adoption, sponsorship, stories, volunteer, donation, reports, Help, public status pages, and public error states.
2. The operational admin product keeps its dense work-oriented interface. It receives only compatible foundational tokens and a brand-correct login shell.
3. The global header's primary action is `查看待領養動物`. `立即捐助` is secondary globally and remains primary on the donation page.
4. About-page impact figures may only come from the database or a verifiable official source and must include a data date.
5. The selected visual direction is **Authentic Civic Warmth**: official blue leads, official magenta is restrained, warm-white surfaces support authentic rescue photography, and radii/effects remain compact.

## Evidence Reviewed

### Official sources

- Original website: https://hkscda.com/
- Original About page: https://hkscda.com/about
- Official full logo path exposed by the original site: https://hkscda.com/img/logo.jpg
- Official square logo path exposed by the original site: https://hkscda.com/img/square-logo.png
- Official charity content, navigation terminology, mission, contact information, and slogan on the original website.

### Supporting public source

- Charity Finder organisation record and public 960 x 960 logo copy:
  https://charity-finder.org/charity/hk-saving-cat-and-dog-association-limited

### Current implementation

- Production About page: https://hkscda.vercel.app/about
- Latest source baseline: `origin/main` at `f4ef05c`
- Framework: TanStack Start, React 19, Tailwind CSS 4, Vite, Radix UI primitives
- Central palette: `src/styles.css`
- Shared public navigation: `src/components/site/Header.tsx`
- Shared public footer: `src/components/site/Footer.tsx`
- Current About page: `src/routes/about/index.tsx`
- Root metadata and structured data: `src/routes/__root.tsx`

## Evidence Limitations

The original site serves direct logo downloads and automated visual browsing behind Cloudflare verification. The official asset paths and original-page logo treatment were identified, but direct asset retrieval was blocked during the design audit.

A 960 x 960 public logo copy was retrieved from the organisation record on Charity Finder. It visually matches the official identity shown by HKSCDA: blue house, white dog and cat, magenta outlines and heart noses, Chinese organisation name, and HKSCDA wordmark.

Implementation must try the direct official asset paths first. The supporting copy may only be committed after it is compared against the original visual reference and documented as the best available official reproduction. The implementation must not redraw, recolour, crop, stretch, or add effects to the logo.

## Brand Assessment

The current site uses a `Poofyco-inspired` blush, pink, and deep-navy palette. It uses a pink circular paw icon in place of the HKSCDA logo in both header and footer. This weakens recognition, makes the site resemble a generic pet product, and breaks continuity with the established organisation.

The current About page is a narrow text column with a small heading, several paragraphs, a bullet list, and a fee table. It lacks an identity-led hero, authentic photography, a clear mission hierarchy, verified impact, a rescue-to-adoption narrative, trust signals, and purposeful calls to action.

## Authentic Logo System

### Asset roles

- `public/brand/hkscda-logo-primary.*`: unchanged official complete logo for header, footer, About identity, and Open Graph where appropriate.
- `public/brand/hkscda-logo-square.*`: unchanged official square composition for favicon and compact metadata only when its small-size rendering remains legible.
- No newly drawn mark is permitted.
- Light or monochrome variants are out of scope unless an official source is found.

### Usage

- Header desktop: 48-56 px visual height, aspect ratio preserved.
- Header mobile: 42-48 px visual height, aspect ratio preserved.
- Footer: complete logo on an unframed blue information band.
- Mobile drawer and admin login: complete logo at an appropriate compact size.
- Alternative text: `香港拯救貓狗協會 HKSCDA`.
- When the image is inside the home link, the link receives one concise accessible name to avoid repetitive announcement.

## Corporate Colour Evidence

The public logo copy is a JPEG, so compression creates small pixel variations. Programmatic sampling found:

- Blue clusters centred around `#05648E`, `#0A638B`, and `#025E8A`.
- Magenta clusters centred around `#A61C56`, `#A21D56`, and `#AA1855`.

The working canonical brand values are:

| Role | HEX | RGB | Contrast on white | Intended use |
| --- | --- | --- | ---: | --- |
| Official blue | `#05648E` | 5, 100, 142 | 6.52:1 | Identity, primary actions, links, active navigation |
| Official magenta | `#A61C56` | 166, 28, 86 | 7.19:1 | Logo fidelity, restrained accent, selected emphasis |
| Deep ink | `#163644` | 22, 54, 68 | 12.76:1 | Body text, headings |
| Warm white | `#F7FAF9` | 247, 250, 249 | 12.15:1 against deep ink | Page background |

The implementation audit must record final HEX, RGB, HSL/OKLCH values and contrast pairs in `docs/HKSCDA_COLOR_SYSTEM.md`.

## Token Architecture

### Layer 1: immutable brand primitives

```css
--brand-blue-official: #05648e;
--brand-magenta-official: #a61c56;
```

These values preserve the sampled identity and are not repurposed as success, warning, or error.

### Layer 2: semantic public-site tokens

```css
--site-primary;
--site-primary-hover;
--site-primary-active;
--site-primary-subtle;
--site-on-primary;

--site-secondary;
--site-secondary-hover;
--site-secondary-subtle;
--site-on-secondary;

--site-background;
--site-surface;
--site-surface-raised;
--site-surface-muted;

--site-foreground;
--site-foreground-secondary;
--site-foreground-muted;
--site-foreground-inverse;

--site-border;
--site-border-strong;
--site-focus-ring;

--site-success;
--site-success-subtle;
--site-warning;
--site-warning-subtle;
--site-error;
--site-error-subtle;
--site-info;
--site-info-subtle;
```

### Layer 3: component and domain aliases

```css
--button-primary-*;
--button-secondary-*;
--field-*;
--notice-*;
--status-available-*;
--status-adopted-*;
--status-processing-*;
```

Domain aliases are only added for statuses supported by the actual public data model. Colour is never the only status indicator.

### Admin isolation

Public presentation tokens are scoped beneath a public-site shell. Admin keeps its operational palette and spacing. Shared primitives receive compatible aliases so that public rebranding cannot silently alter admin status meaning, density, or data readability.

## Visual Direction: Authentic Civic Warmth

- Official blue is the main identity anchor.
- Official magenta is a restrained accent rather than a page-filling background.
- Warm white and cool-neutral surfaces keep real animal photography dominant.
- Corners use restrained radii, generally 4-8 px for controls and 8 px or less for repeated cards unless an existing primitive requires otherwise.
- Shadows are subtle and limited to navigation, menus, and true elevated surfaces.
- No decorative gradients, glassmorphism, sticker motifs, paw-print decoration, emoji icons, blobs, confetti, or bouncing animation.
- Motion explains state change only, uses 150-300 ms transitions, and respects reduced motion.
- Lucide remains the consistent functional icon family.

## Typography

- Keep Noto Sans HK for Traditional Chinese body and interface text.
- Remove dependence on the overly playful Baloo display personality from institutional headings.
- Prefer a readable existing sans-serif hierarchy for both Chinese and English rather than adding another large font dependency.
- Body text is at least 16 px on mobile with a 1.6-1.75 line height.
- Long-form content is constrained to a readable measure.
- Hero and page headings remain proportional and leave the next section visible.
- Letter spacing remains zero for normal text; long labels are not set in all caps.

## Shared Public Components

### Header

- Replace the generated paw badge and live-text substitute with the official complete logo.
- Replace the floating pill composition with a stable, brand-led navigation bar.
- Keep a restrained contact utility strip.
- Primary action: `查看待領養動物`.
- Secondary action: `立即捐助`.
- Active, hover, selected, and focus states use semantic tokens.
- Mobile navigation uses one keyboard-operable drawer with clear groups and minimum 44 px targets.
- Remove decorative shimmer and unnecessary nav entrance animations.

### Footer

- Use a full-width official-blue information band.
- Place the complete logo directly in the layout, not inside a nested identity card.
- Preserve verified contact, transparency, report, adoption, donation, and volunteer links.
- Remove the paw badge, emoji slogan, and pink bottom strip.
- Keep trust/legal data only where already verified by repository or official source.

### Public primitives

- Page hero
- Section heading
- CTA band
- Trust notice
- Status badge
- Empty/loading/error state
- Form field wrapper
- Button hierarchy
- Content card and animal card

Each primitive has a single responsibility and uses semantic tokens rather than raw colour values.

## About Page Design

1. Full-width hero using authentic HKSCDA rescue photography with text directly over the image.
2. Organisation identity, mission, and `領養代替購買`.
3. Verified database or official-source impact figures with a visible data date.
4. Rescue journey: `救援 → 醫療照護 → 絕育 → 配對領養`.
5. HKSCDA purpose and community programmes, with links to CCCP and TNR.
6. Responsible adoption and lifelong commitment.
7. Ways to help: adopt, donate, volunteer, and share.
8. Final adoption-led CTA and footer.

The page must not invent figures, dates, awards, partners, licence details, or programme claims. Existing unverified claims are removed or held for owner review rather than restyled as fact.

## Route and Component Inventory

All routes inherit the same official logo through shared navigation and footer. The current baseline uses the pink/deep-navy palette globally.

| Route | Purpose | Current issues | Required components and changes | Accessibility focus |
| --- | --- | --- | --- | --- |
| `/` | Primary public entry | Generic identity, competing colour blocks, substitute logo | Official header, adoption-led hero, verified trust, coherent CTA hierarchy | Hero contrast, image alt, heading order |
| `/about` | Organisation identity | Text-only, unverified impact, weak hierarchy | Complete About redesign described above | Long-form measure, table semantics |
| `/about/cccp` | CCCP programme | Token drift, limited visual hierarchy | Shared page hero, programme steps, verified CTA | Sequential headings, status not colour-only |
| `/about/tnr` | TNR programme | Token drift, repeated card styling | Shared page hero, process treatment, restrained surfaces | List/process semantics |
| `/about/team` | Team/governance | Sparse trust presentation | Official identity, verified roles, contact route | Names/roles reading order |
| `/about/privacy` | Privacy information | Brand consistency and text measure | Quiet legal layout with semantic links | Landmark, headings, link contrast |
| `/animals/cat` | Available cats | Generic category colour, listing hierarchy | Unified filters/cards, `待領養` status | Filter labels, empty/loading states |
| `/animals/cat/:id` | Cat detail | CTA/status hierarchy | Detail hero, suitability information, adoption CTA | Image gallery controls, alt text |
| `/animals/dog` | Available dogs | Generic category colour, listing hierarchy | Same shared animal system as cats | Filter labels, empty/loading states |
| `/animals/dog/:id` | Dog detail | CTA/status hierarchy | Same detail system as cats | Image gallery controls, alt text |
| `/adoption/instructions` | Adoption guidance | Dense content and weak progression | Responsibility-led steps and specific actions | Reading order, anchors, focus |
| `/adoption/apply` | Adoption application | Public palette and form feedback consistency | Tokenised form fields, progress, recovery states | Labels, errors, draft messaging |
| `/adoption/status/:token` | Application status | Status visuals need semantic consistency | Text/icon/status token treatment | Live status announcements |
| `/sponsors` | Sponsorship list | Card and CTA consistency | Shared content cards and verified trust copy | Filter/list semantics |
| `/sponsors/:id` | Sponsorship detail | Donation trust and hierarchy | Rescue story, clear amount/action, support info | Amount controls, image alt |
| `/sponsors/pledge` | Sponsorship pledge | Form and payment-proof consistency | Shared form/trust primitives | Upload labels and error recovery |
| `/sponsors/status/:token` | Pledge status | Status consistency | Shared public status shell | Status text and announcements |
| `/stories` | Rescue stories and map | New map must fit official identity | Brand tokens, story filters, map fallback | Map label, keyboard-accessible fallback |
| `/stories/:slug` | Rescue story detail | Content hierarchy | Editorial story layout, restrained accent | Article landmarks, media alt |
| `/volunteer` | Activities and registration | Form, cards, availability states | Shared page hero, activity cards, registration fields | Availability text, error association |
| `/volunteer/status/:token` | Registration status | Status consistency | Shared public status shell | Status text and announcements |
| `/donate` | Donations | Highest trust requirement | Official identity, amount hierarchy, payment reassurance | Amount controls, errors, confirmation |
| `/report/adoption` | Adoption transparency | Chart and table token drift | Accessible chart/table palette | Non-colour legends, table fallback |
| `/report/audit` | Financial transparency | Document hierarchy | Official brand framing, clear downloads | Link names, file metadata |
| `/help` | Bilingual FAQ and contact | Palette consistency | Shared search/results, contact fallback | Search label, expanded state |
| Root 404/error | Recovery | Generic or inconsistent treatment | Official shell, route-specific recovery actions | Focus placement and clear action |

Admin routes are excluded from the public visual redesign. `/admin/login` receives official identity and accessible foundational colours only.

## Animal and Story Status Rules

- The current public animal listing exposes `available`, labelled `待領養`.
- Do not introduce unsupported public animal lifecycle statuses.
- Story content already supports statuses including `已領養`; existing public vocabulary remains authoritative.
- Cat and dog identity is communicated by text/icon, not pink/blue coding.
- Urgent or special cases remain calm and factual rather than sensational.

## Forms and Donation Trust

- Preserve all fields, payloads, drafts, validation rules, server contracts, and payment destinations.
- Keep visible labels and explicit required indicators.
- Associate field errors and recovery instructions with fields.
- Preserve entered data after validation errors.
- Show loading, success, disabled, and failure states with text and semantics.
- Do not change Stripe, PayPal, bank information, receipt logic, or donation purpose without separate evidence and tests.
- Donation pages prominently display the official organisation identity and verified support contacts.

## Data Flow and Error Handling

- Brand assets are local, versioned public assets; no production hotlinks.
- Public data fetching and backend contracts remain unchanged unless a demonstrated UI defect requires a narrow fix.
- Missing hero/media assets fall back to stable reserved space and useful text, never a broken-image layout.
- Missing or zero impact data suppresses the statistic rather than displaying a guessed value.
- Loading states reserve dimensions to prevent layout shift.
- Empty states explain the situation and provide the next useful action.
- Invalid status tokens retain the existing privacy-safe recovery path.

## Accessibility Requirements

- Target WCAG 2.2 AA.
- Normal text contrast at least 4.5:1; large text and meaningful graphics at least 3:1.
- Visible focus ring on every interactive element.
- Keyboard-complete navigation, drawers, menus, forms, galleries, and maps.
- Practical touch targets approximately 44 x 44 px minimum.
- Colour never carries meaning alone.
- Sequential headings and correct landmarks.
- Descriptive image alternative text and decorative-image suppression.
- Traditional Chinese root language remains `zh-Hant`; bilingual content receives appropriate language treatment where practical.
- Support 200% zoom and reduced motion.

## Responsive Requirements

Test at:

- 375 x 812
- 390 x 844
- 768 x 1024
- 1024 x 768
- 1440 x 900

Required outcomes:

- No horizontal overflow.
- Logo stays sharp and undistorted.
- Navigation and long Traditional Chinese labels do not collide.
- Fixed controls do not cover content.
- About hero leaves the next section visible.
- Cards, tables, forms, status pages, and footer remain readable in portrait and landscape.

## Testing Strategy

### Automated

- Focused unit/component tests for token aliases, logo rendering, header/footer, status treatments, and About content rules.
- Existing integration tests for adoption, volunteer, sponsorship, donation, and Help flows.
- Type check.
- ESLint.
- Full Bun test suite.
- Production build.
- Repository scans for old logo substitutes, deprecated palette tokens, raw primary colours, and broken asset paths.

### Browser verification

- Route smoke test for every public route in the inventory.
- Desktop/mobile screenshots at the required viewports.
- Header, mobile drawer, About hero, animal cards/details, forms, donation, footer, and error states.
- Keyboard navigation and focus checks.
- Console error and asset 404 scan.
- Logo natural dimensions/aspect-ratio check.
- Responsive overflow and 200% zoom checks.
- Reduced-motion check.

## Documentation Deliverables

1. `docs/HKSCDA_BRAND_AUDIT.md`
2. `docs/HKSCDA_COLOR_SYSTEM.md`
3. `docs/HKSCDA_REDESIGN_REPORT.md`

The redesign report records route coverage, components/files changed, before/after screenshots, validation evidence, remaining risks, and owner decisions.

## Implementation Sequence

1. Obtain and validate official assets.
2. Finalise colour evidence and contrast table.
3. Introduce scoped semantic tokens and admin compatibility aliases.
4. Update public primitives.
5. Update header, mobile navigation, metadata, favicon, and footer.
6. Redesign About.
7. Update animal cards/details and public statuses.
8. Update adoption, sponsorship, volunteer, donation, reports, Help, and error states.
9. Complete accessibility and responsive fixes.
10. Run full automated and browser verification.
11. Complete the three documentation deliverables.

## Non-Goals

- No framework replacement.
- No backend contract redesign.
- No payment destination or donation-integration changes.
- No fabricated facts or statistics.
- No full admin visual redesign.
- No dark mode introduction.
- No generated or redrawn logo.
- No generic stock photography.
- No unnecessary dependency additions.

## Baseline Verification

- `bun install --frozen-lockfile`: passed.
- Full `bun test`: 657 passed, one existing route-nesting test timed out during the parallel suite.
- Focused rerun of `src/lib/applicationsRouteNesting.test.ts`: 1 passed, 0 failed.

The timeout is recorded as a baseline flaky risk and is outside the public brand scope.
