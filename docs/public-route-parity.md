# Public route parity

Generated from the working tree by inspecting each route, not written by hand.
Every column is read out of the route source, so this records what the code does
rather than what the plan intends.

Scope: the 27 public routes. `__root`, `/robots.txt` and `/sitemap.xml`
are shell and machine routes, listed separately below.

## Status at a glance

- Routes reframed onto the ported design system: **5 of 27**
- Routes still reading primary data in the browser: **2**
- Content routes missing a canonical: **0**
- Token routes correctly withholding a canonical: **3 of 3**
- Token routes declaring noindex: **3 of 3**

## Per route

| Route | WP | Design system | Data | States | Canonical |
|---|---|---|---|---|---|
| `/` | WP-2 | yes | loader | no | yes |
| `/animals/cat` | WP-3 | yes | loader | yes | yes |
| `/animals/dog` | WP-3 | yes | loader | yes | yes |
| `/animals/cat/$id` | WP-3 | no | loader | yes | yes |
| `/animals/dog/$id` | WP-3 | no | loader | yes | yes |
| `/adoption/instructions` | WP-4 | no | loader | no | yes |
| `/adoption/apply` | WP-4 | no | static | no | yes |
| `/adoption/status/$token` | WP-4 | no | static | no | correctly absent |
| `/sponsors` | WP-5 | no | browser query | no | yes |
| `/sponsors/$id` | WP-5 | no | loader | yes | yes |
| `/sponsors/pledge` | WP-5 | no | static | no | yes |
| `/sponsors/status/$token` | WP-5 | no | static | no | correctly absent |
| `/donate` | WP-5 | no | loader | no | yes |
| `/volunteer` | WP-5 | no | static | no | yes |
| `/volunteer/group` | WP-5 | no | static | no | yes |
| `/volunteer/status/$token` | WP-5 | no | static | yes | correctly absent |
| `/stories` | WP-6 | no | loader | yes | yes |
| `/stories/$slug` | WP-6 | no | loader | yes | yes |
| `/knowledge` | WP-6 | no | loader | no | yes |
| `/help` | WP-6 | no | static | no | yes |
| `/report/adoption` | WP-6 | yes | static | yes | yes |
| `/report/audit` | WP-6 | no | loader | yes | yes |
| `/about` | WP-6 | no | browser query | no | yes |
| `/about/cccp` | WP-6 | no | static | no | yes |
| `/about/tnr` | WP-6 | no | static | no | yes |
| `/about/team` | WP-6 | yes | static | yes | yes |
| `/about/privacy` | WP-6 | no | static | no | yes |

### Column meanings

- **Design system** - renders through `PublicPageFrame`, `AnimalListingPage`,
  the home modules, or the ported hero and container classes. `no` means the route
  keeps its pre-port markup: it inherits the shared tokens and the shell, so it is
  visually consistent, but its section structure is not the design source layout.
- **Data** - `loader` means server rendered in the first response.
  `browser query` means the first paint carries no data.
- **States** - declares a pending component, an error component, or an empty state.
- **Canonical** - for the three capability-token routes the correct value is
  *absent*. Section 7 requires that a token URL never becomes canonical, never
  enters the sitemap, and never reaches analytics, so those rows read
  `correctly absent` and would read `MUST NOT have one` if one were added.

## Shell and machine routes

| Route | Purpose | Notes |
|---|---|---|
| `__root` | Public and admin shell | `.site-shell` wraps public content, `.admin-shell` wraps admin; skip link and the `data-site-content` marker live here |
| `/robots.txt` | Crawler policy | Route generated; registered in the route tree |
| `/sitemap.xml` | Index surface | Route generated; excludes token routes |

## Contracts held across the port

- URLs, route filenames and query parameter names are unchanged. The only
  addition is `gender` on the two species listings, approved as decision D-4 under
  the PR #60 name rather than the design source `sex`.
- Loader and action signatures, `/api/*` request and response shapes, Zod schemas,
  domain services and repositories are untouched.
- Shortlist localStorage keys and the application and pledge draft keys are unchanged.
- No `supabase/` change, no migration, no RLS or Storage policy change.

## Known gaps

Open by design; each belongs to work that has not run yet.

- Routes marked `no` under Design system keep their pre-port section structure.
- `/sponsors` and `/about` still read their primary data in the browser.
- `/report/adoption` shows an unpublished state rather than figures: the anonymous
  policy exposes only available animals, so no adoption total can be derived
  client-side. BP-1 owns the privacy-safe aggregate.
- `/about/team` shows an unpublished state rather than a board list. BP-3 owns the
  governance records.
- The brand verifier cannot pass in CI against an empty database: it discovers
  detail routes from listing pages, so with no rows it probes synthetic ids. That
  is a gate design decision, not a route defect.
