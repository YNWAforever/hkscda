# Contextual Donation CTA Design

**Date:** 2026-07-16  
**Status:** Approved  
**Scope:** Increase visits to `/donate` from public pages through a contextual, low-friction donation prompt.

## Objective

Increase the number of public-site visitors who enter the donation journey by showing a relevant donation prompt after meaningful engagement. The prompt must remain visible enough to be useful without competing with reading, the help widget, the sponsorship shortlist, or payment flows.

The first release optimizes donation-page entry. It also establishes end-to-end attribution so future work can distinguish higher traffic from higher completed-donation conversion.

## Non-goals

- Redesigning the complete donation form.
- Adding recurring donations or new payment providers.
- Building an admin analytics dashboard or A/B testing console.
- Personalizing copy for each individual animal or story.
- Sending donor names, contact details, full URLs, or other personal data to GA4.

## Current State

- Desktop navigation already contains an `立即捐助` button.
- On mobile, the donation link is only visible after opening the navigation menu.
- The help widget occupies the lower-right corner and moves upward when the sponsorship shortlist is present.
- `/donate` supports `general`, `medical`, and `sponsor` purposes, but its current validated search parameters only cover payment status and donation ID.
- The existing analytics helper can send GA4 events, but donation funnel events are not yet defined.

## Chosen Direction

Use a contextual prompt across eligible public pages.

- **Mobile:** full-width bottom prompt.
- **Desktop:** compact lower-left prompt, leaving the lower-right help control undisturbed.
- **Trigger:** show after either 35% document scroll or 10 seconds on the route, whichever happens first.
- **Dismissal:** a close action suppresses the prompt for the remainder of the browser session.
- **Destination:** `/donate` with validated source, context, purpose, placement, and trigger parameters.
- **Copy:** selected by page category, not by individual content item.

## Eligibility and Exclusions

The component is mounted once in the public root and resolves eligibility after every client-side route change.

It is available on public content routes and excluded from:

- `/donate` and all donation payment-result states.
- `/admin` and `/admin/*`.
- Public login and authentication routes.
- Adoption, sponsorship, volunteer, and similar private status routes.
- API routes and error-only shells.

The route matcher must be explicit and tested. Unknown public routes use the general profile; sensitive or workflow routes default to hidden.

## Context Profiles

All profiles live in one typed configuration module. The first matching rule wins, followed by a general fallback.

| Context | Example routes | Prompt | Action | Purpose |
| --- | --- | --- | --- | --- |
| `general` | Home and unmatched public content | 每一份支持，都讓救援走得更遠 | 立即捐助 | `general` |
| `story` | Story listing and story details | 讓下一個生命也迎來轉機 | 支持救援 | `general` |
| `animal` | Animal listings, details, and adoption information | 支持醫療、暫託及日常照護 | 幫助牠們 | `medical` |
| `sponsor` | Sponsorship listing and details | 未能助養，也可支持整體救援工作 | 捐助支持 | `sponsor` |
| `transparency` | About, transparency, and report pages | 讓透明而持續的救援工作走得更遠 | 立即捐助 | `general` |
| `community` | Volunteer, contact, and help pages | 支持前線救援及社區工作 | 支持我們 | `general` |

The initial visible copy follows the current Traditional Chinese public site. The configuration shape includes English fields so a future site-wide language state can use the same profiles without restructuring the component.

## Interaction Model

1. On an eligible route, initialize both the 10-second timer and passive scroll listener.
2. Show the prompt when either threshold is reached.
3. Record one impression with the winning trigger, then remove both listeners.
4. Clicking the prompt records one click and navigates to `/donate`.
5. Closing the prompt stores a session-scoped dismissal and removes listeners.
6. Opening the help panel temporarily hides the prompt. Closing help may restore it only if it had already qualified and was not dismissed.
7. A client-side route change resets route-specific timing and impression state, while preserving session dismissal.

The scroll threshold is calculated from the scrollable document range. Pages without enough scrollable height rely on the timer. Re-renders and repeated scroll events must not emit duplicate impressions.

## Placement and Collision Rules

The prompt and existing fixed controls use a shared bottom-offset contract instead of independent hard-coded positions.

- Mobile prompt reserves the device safe-area inset and a minimum 44px action height.
- Page content receives sufficient bottom breathing room only while the prompt is visible, preventing the prompt from obscuring the final interactive content.
- The help button moves above the mobile prompt.
- If the sponsorship shortlist is visible, offsets stack in a defined order: shortlist, donation prompt, help control.
- On desktop, the prompt stays on the lower left and the help control stays on the lower right.
- Opening a dialog, sheet, or help panel prevents the prompt from sitting above that modal surface.

No prompt is shown during the donation or payment flow.

## Donation URL Contract

Example:

```text
/donate?source=contextual-cta&context=story&purpose=general&placement=mobile-bottom&trigger=scroll
```

`/donate` extends its Zod search schema with optional enum values:

- `source`: `contextual-cta`
- `context`: `general | story | animal | sponsor | transparency | community`
- `purpose`: existing `general | medical | sponsor`
- `placement`: `mobile-bottom | desktop-left`
- `trigger`: `scroll | timer`

Invalid or absent values safely fall back to the normal donation form and `general` purpose. A valid purpose sets the initial selection but never prevents the donor from changing it.

## Attribution Data Flow

The validated acquisition fields stay with the donation journey:

1. The contextual prompt builds the typed donation URL.
2. The donation page validates and retains acquisition fields.
3. Form submission includes an optional `attribution` object.
4. The donation request schema validates every attribution field as an enum.
5. The donation service writes attribution to optional structured donation columns.
6. Payment-provider redirects and webhooks continue to identify the same donation record, preserving attribution through completion.

Recommended nullable columns on `donation`:

- `acquisition_source`
- `acquisition_context`
- `acquisition_placement`
- `acquisition_trigger`

Only controlled enum-like values are stored. No raw referrer, full source URL, query string, or donor information is included in attribution.

Existing donations and direct visits remain valid because all new fields are optional.

## Analytics Funnel

Use the existing GA4 event helper and send each browser event at most once per donation journey stage:

| Event | When | Parameters |
| --- | --- | --- |
| `donation_cta_impression` | Prompt becomes visible | context, placement, trigger, purpose |
| `donation_cta_click` | Prompt action is activated | context, placement, trigger, purpose |
| `donation_form_view` | Donate page loads with valid attribution | context, placement, trigger, purpose |
| `begin_checkout` | Donation request succeeds and provider/manual instructions begin | context, purpose, method, value, currency |
| `donation_success` | Server-confirmed donation status is paid | context, purpose, method, value, currency |

`donation_success` must not fire from `?status=success` alone. The result view verifies the referenced donation through a minimal rate-limited status endpoint that returns payment state only and never returns donor data. A session key keyed by donation ID prevents duplicate success events on refresh.

GA4 parameters must not contain name, email, phone, donation ID, raw path, or free-form text.

## Component Architecture

### `ContextualDonationPrompt`

Owns rendering, dismissal, accessibility labels, navigation, analytics calls, and coordination with shared fixed-control state.

### `donationPromptConfig`

A pure typed route-to-profile resolver containing exclusions, route categories, copy, destination purpose, and bilingual fields. It has no React or browser dependencies.

### `useDonationPromptTrigger`

Owns timer and scroll qualification, route resets, listener cleanup, session dismissal, and the once-only impression guard.

### Shared fixed-control state

Exposes whether help, shortlist, prompt, or a modal surface is active so fixed controls can compute deterministic offsets and visibility without importing each other.

### Donation attribution

Extends the donation page search schema, donation request schema, service input, repository insert type, generated database types, and migration in one vertical change.

## Error Handling and Degradation

- If `sessionStorage` is unavailable, the prompt still works but dismissal is not retained.
- If GA4 is unavailable, navigation and donation processing continue normally.
- If attribution parameters are invalid, they are discarded and the base donation flow continues.
- If the status verification request fails, the thank-you state may render from the payment redirect, but `donation_success` is not emitted until confirmation succeeds.
- If viewport measurement or scroll range is unavailable, the timer remains the fallback trigger.
- Component failures must not block page content, help, shortlist, or donation navigation.

## Accessibility

- Use semantic text, link/button controls, and a separately labelled close button.
- Keep every interactive target at least 44px high on touch screens.
- Preserve native tab order and visible focus indicators.
- Announce neither routine prompt appearance nor marketing copy as an intrusive live alert.
- Respect `prefers-reduced-motion`; animation is a short entrance transition only.
- Maintain contrast in both supported themes and ensure zoomed text wraps without covering controls.
- Include safe-area padding for mobile browsers.

## Performance

- No API request, image, or third-party dependency is required to decide whether to show the prompt.
- Route classification and profile resolution are synchronous and constant-sized.
- Scroll handling uses a passive listener and only reads the values needed for threshold calculation.
- Listeners and timers are removed immediately after qualification, dismissal, exclusion, or route change.
- The fixed prompt does not contribute to initial layout shift.
- The component should remain in the existing application bundle unless measurement shows that a route-level lazy boundary is beneficial.

## Testing Strategy

### Unit tests

- Every public route family maps to the correct context and purpose.
- Every excluded workflow route remains hidden.
- Invalid search parameters fall back safely.
- Trigger logic selects scroll or timer once and cleans up the other path.
- Session dismissal and route reset behavior are deterministic.

### Component tests

- Mobile and desktop placement variants render the correct content.
- Close, CTA activation, help-panel coordination, and shortlist offsets work.
- Impression and click analytics emit once with no personal data.
- Keyboard controls and accessible names are present.

### API and service tests

- Attribution accepts only defined values.
- Direct donations without attribution remain valid.
- Attribution is persisted with the donation and survives provider setup.
- Payment status endpoint returns minimal state, is rate limited, and exposes no donor details.

### Browser verification

- Test representative home, story, animal, sponsorship, transparency, help, and excluded routes.
- Verify 320px mobile, common mobile, tablet, and desktop widths.
- Verify scrolling, short pages, route navigation, refresh, back navigation, help open/close, and shortlist presence.
- Confirm the prompt never overlaps navigation, final content controls, the help widget, shortlist, cookie UI, or payment interfaces.
- Confirm GA4 event order and duplicate protection in a complete test donation flow.

## Rollout and Measurement

Release the feature with the full approved public-route coverage, then compare at least two equivalent reporting periods.

Primary metric:

- `donation_cta_click / donation_cta_impression`, segmented by context and placement.

Supporting metrics:

- Attributed donation-page arrivals.
- `begin_checkout / donation_form_view`.
- `donation_success / begin_checkout`.
- Prompt dismissals and help-widget opens after prompt exposure, used as friction signals.

The feature is successful when it creates measurable attributed donation-page traffic without materially reducing help access or causing layout and interaction regressions.

## Acceptance Criteria

- Eligible public pages show the correct prompt after 35% scroll or 10 seconds.
- Excluded routes never show it.
- Mobile and desktop placements match the approved layout and avoid all fixed controls.
- Closing suppresses the prompt for the current browser session.
- Context and purpose are validated, preselected, changeable, and persisted with a created donation.
- The five approved funnel events are emitted once at verified stages with no personal data.
- Payment success analytics require server-confirmed paid status.
- Direct donation links and existing payment methods remain backward compatible.
- Focused tests and representative browser checks pass.
