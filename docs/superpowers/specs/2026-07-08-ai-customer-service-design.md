# AI Customer Service FAQ Design

## Summary

Build the first public-facing HKSCDA intelligent customer service slice for
questions about sponsorship, adoption, donations, tax receipts, and contact
paths. The first release is not a generative AI assistant. It is a bilingual,
repo-owned smart FAQ search experience with fixed approved answers, clear next
step guidance, and anonymous analytics.

This keeps answers controllable for sensitive topics such as tax receipts while
creating the public entry points needed for later model-backed AI, admin-editable
FAQ content, and an internal staff assistant.

## Approved Decisions

- Target users: support both public visitors and internal staff over time, but
  the first implementation is for public website visitors only.
- First release behavior: answer FAQs and guide users to the right next step.
  It does not collect personal details, fill forms, read submitted applications,
  read payment references, or inspect uploaded files.
- Content ownership: FAQ content starts in the repo, with admin-editable FAQ
  management deferred to a later phase.
- Languages and tone: Traditional Chinese for Hong Kong, conversational but
  professional; English should be natural and clear. Tax and receipt answers use
  more careful wording.
- Answering engine: smart FAQ search with fixed approved answers. No generative
  model is used in the first release.
- Entry points: both a full-site bottom-right help widget and a `/help` page.
  They share the same FAQ data and search logic.
- Low-confidence behavior: show related FAQs first, then provide staff contact
  paths if the answer still does not fit.
- Analytics: record anonymous search and click events only. Do not store full
  conversations or personal data.

## Current Context

The app is a TanStack Start, React 19, Vite, Tailwind v4, Supabase project.
Public routes already cover donations, sponsorship, adoption, volunteer, animal
listings, and status pages. The root shell renders public-only layout elements
such as `Header`, `Footer`, `ShortlistProvider`, and `ShortlistTray`, which gives
the help widget a natural public-only integration point.

Existing plans already reserve a later "grounded AI FAQ assistant" phase in the
public adoption and sponsorship journey. This design implements the safer first
slice of that direction without adding an LLM dependency.

The existing homepage `FAQ.tsx` contains local hardcoded FAQ content. The new
work should move FAQ content into a shared help module so the homepage FAQ,
help widget, and `/help` page do not diverge.

Some current Chinese source text appears mojibaked in files. The FAQ source for
this feature must be clean UTF-8 Traditional Chinese and English content, written
as approved copy rather than extracted from the corrupted text.

## Scope

In scope:

- A shared FAQ data module for bilingual approved content.
- Search helpers for query normalization, scoring, confidence buckets, and
  fallback behavior.
- A public bottom-right help widget on all non-admin pages.
- A `/help` route for full FAQ search and category browsing.
- Shared UI primitives/components for FAQ result cards, CTA buttons, language
  toggles, contact fallback, and privacy guidance.
- Anonymous analytics events through the existing GA4 helper.
- Tests for FAQ schema completeness, search behavior, privacy redaction, and
  core UI interactions.

Out of scope for this phase:

- Generative AI responses.
- OpenAI or other model provider setup.
- Supabase FAQ tables, admin FAQ editing, or approval workflow.
- Internal staff assistant.
- Full conversation logging.
- Collecting visitor name, phone, email, address, payment reference, form
  answers, or uploaded files through the help widget.
- Case-specific status lookup.
- WhatsApp automation.

## Knowledge Model

Create a focused help module, for example `src/lib/help/faq.ts`, containing an
array of approved FAQ entries.

Each FAQ entry should include:

- `id`: stable machine-readable identifier.
- `category`: one of `sponsorship`, `adoption`, `tax_receipt`, `donation`,
  or `contact`.
- `question.zh-HK` and `question.en`.
- `answer.zh-HK` and `answer.en`.
- `keywords.zh-HK` and `keywords.en`.
- `cta`: optional next-step action with route or URL, bilingual label, and an
  analytics action name.
- `sensitive`: true for tax, receipt, privacy, payment, or policy answers that
  should use careful fixed wording.

Recommended first FAQ categories:

- Sponsorship: how sponsorship works, monthly tiers, animal preferences,
  proof/payment next steps, status expectations.
- Adoption: how to apply, selected animal ranking, visit/home preparation,
  photos, staff follow-up.
- Tax receipts: HKSCDA charitable status, HK$100+ receipt request path, receipt
  timing, and the boundary that this is not personal tax advice.
- Donations: available methods, donation purpose, receipt request, confirmation.
- Contact: WhatsApp, email, contact section, social channels, when to contact
  staff directly.

The FAQ source should be small enough for code review and content approval in
the repo. Admin-editable storage can later mirror this schema in Supabase.

## Search And Answer Behavior

Search runs client-side in the first release.

The shared search helper should:

1. Normalize the query by trimming, lowercasing English, normalizing whitespace,
   preserving Traditional Chinese terms, and removing harmless punctuation.
2. Score matches across question, keywords, category labels, and short answer
   text. Keywords and question matches weigh more than answer text.
3. Return sorted results with a confidence bucket:
   - `high`: show the best fixed answer directly.
   - `medium`: show the top 2-3 related FAQ cards.
   - `low`: show the top related FAQ cards plus contact fallback.
   - `none`: say the assistant cannot confirm the answer and offer contact
     paths.
4. Track the language selected by the visitor. The current language determines
   displayed question, answer, and CTA labels.

The assistant must not invent answers. It only displays approved FAQ content.
For tax and receipt answers, the copy should say:

- HKSCDA is an approved charitable institution where that statement is approved
  by the organization.
- Gifts of HK$100 or above can request an IRD Section 88 tax receipt through the
  site flow or staff contact path.
- The assistant cannot provide personal tax advice.
- Visitors should contact staff for receipt-specific issues.

## Help Widget

Add a public-only `HelpWidget` near the root public shell, after `Footer` and
`ShortlistTray` integration has been considered. It should not render on
`/admin` routes.

Widget behavior:

- Floating bottom-right button using a lucide icon such as
  `MessageCircleQuestion`.
- Opens a compact panel with:
  - title: HKSCDA help assistant
  - language toggle: `繁` and `EN`
  - quick topic chips for sponsorship, adoption, tax receipts, donations, and
    contact
  - search input for natural-language questions
  - result area
  - privacy reminder telling visitors not to enter personal, payment, address,
    application, or uploaded-file details
- High-confidence result: one answer card with CTA if available.
- Medium/low-confidence result: related FAQ cards.
- No-confidence result: contact fallback with WhatsApp, email, and `/help`.

Responsive placement:

- Desktop: fixed bottom-right.
- Mobile: avoid covering the existing shortlist tray. If shortlist UI is present
  or likely to overlap, the widget button should sit higher or use a compact
  stacked position.
- The panel should fit within the viewport and not obscure critical controls.

Accessibility:

- Button has a clear `aria-label`.
- Panel uses dialog-like focus management or a predictable focus path.
- Escape closes the panel.
- Search input has an accessible label.
- Result changes use a polite live region where practical.

## `/help` Page

Add a public `/help` route that uses the same FAQ data and search helper.

The page should be a practical help center, not a landing page. Recommended
layout:

- Page heading and short support copy.
- Search box at the top.
- Category tabs or segmented controls.
- FAQ list as cards or accordion sections.
- Contact staff section for unresolved questions.
- Language toggle.

The `/help` page should be the canonical place to browse all FAQ entries, while
the widget is optimized for quick answers and next-step guidance. Existing
homepage FAQ content should be migrated to the shared module over time so the
same approved wording is reused everywhere.

## Analytics And Privacy

Use the existing GA4 helper (`gtagEvent`) for anonymous first-release analytics.

Events:

- `help_widget_open`
- `help_search`
- `help_result_click`
- `help_cta_click`
- `help_contact_fallback`

Allowed event fields:

- `faq_id`
- `category`
- `language`
- `result_count`
- `confidence_bucket`
- `page_path`
- `redacted`
- `query_topic`, a short redacted query/topic value only when it contains no
  email, phone-like string, long number/reference, address-like text, or obvious
  personal detail. Keep this value normalized and capped at 80 characters.

Do not send or store:

- names
- phone numbers
- email addresses
- postal addresses
- payment references
- donation IDs
- application answers
- uploaded file names or contents
- full conversation transcripts

Add a small redaction helper before analytics events. If the query contains an
email address, phone-like sequence, long number/reference, or obvious personal
data marker, analytics should send `redacted: true` and omit the raw query text.

This phase does not add a Supabase analytics table. A later admin dashboard can
ingest privacy-safe events if HKSCDA wants direct staff reporting.

## Error Handling

- Empty query: show quick topics and popular FAQs instead of an error.
- Search with no result: show "未能確定 / I am not sure" copy and contact paths.
- Missing FAQ CTA: render the answer without a button.
- Analytics unavailable: silently skip tracking. The help experience must not
  fail because GA4 is blocked.
- Language missing on an FAQ entry: tests should catch it before deployment.

## Implementation Structure

Suggested files:

- `src/lib/help/faq.ts`: shared FAQ data and types.
- `src/lib/help/search.ts`: normalization, scoring, confidence buckets.
- `src/lib/help/analytics.ts`: privacy redaction and GA4 event wrappers.
- `src/components/site/help/HelpWidget.tsx`: floating public widget.
- `src/components/site/help/HelpSearch.tsx`: shared search input/results.
- `src/components/site/help/FaqResultCard.tsx`: shared result card.
- `src/components/site/help/ContactFallback.tsx`: WhatsApp/email/contact links.
- `src/routes/help.tsx`: full help center route.

Root shell integration:

- Render `HelpWidget` only in public content, alongside existing `Header`,
  `Footer`, and `ShortlistTray`.
- Do not render it in admin routes.

## Testing Plan

Automated tests:

- FAQ schema completeness:
  - every entry has a stable id
  - every entry has both languages
  - every entry has keywords
  - CTA routes are present when expected
  - sensitive entries are marked
- Search behavior:
  - sponsorship queries find sponsorship FAQs
  - adoption queries find adoption FAQs
  - receipt/tax queries find tax receipt FAQs
  - donation queries find donation FAQs
  - contact queries find contact fallback
  - medium/low confidence returns multiple related FAQs
  - no-confidence behavior returns contact fallback
- Privacy redaction:
  - emails are redacted
  - Hong Kong phone-like numbers are redacted
  - long numeric references are redacted
  - ordinary topic queries may be sent as anonymized short text
- UI smoke tests where practical:
  - widget opens and closes
  - language toggles content
  - quick chips populate search or results
  - CTA click calls analytics wrapper
  - `/help` search uses the same results as the widget

Manual verification:

- Open the widget on desktop and mobile.
- Confirm it does not overlap the shortlist tray.
- Ask common questions in Traditional Chinese and English.
- Click sponsorship, adoption, donation, receipt, and contact CTAs.
- Confirm `/help` displays all categories.
- Confirm admin routes do not show the widget.
- Confirm no personal data is sent in analytics when test queries include phone,
  email, or payment-reference-like text.

## Future Phases

Phase 2: Admin-editable FAQ content.

- Move or mirror repo FAQ entries into Supabase.
- Add role-gated admin editing with review/publish states.
- Keep fixed approved answer behavior.

Phase 3: Model-backed public AI FAQ.

- Add a grounded AI endpoint that can only answer from approved FAQ/policy
  content.
- Keep current fixed FAQ fallback.
- Refuse personal tax advice, application scoring, payment-reference lookup, and
  private case-specific answers.

Phase 4: Internal staff assistant.

- Role-gated admin assistant for staff.
- Can help staff find internal process guidance and draft replies.
- Must respect admin roles, PII boundaries, audit requirements, and no-store
  response handling.

## Design Defaults

- Prefer fixed, approved answers over generative output in the first release.
- Keep all first-release search logic client-side.
- Keep FAQ content version-controlled.
- Make `/help` and the widget share one data source.
- Track only anonymous, privacy-redacted events.
- Treat tax and receipt content as sensitive, carefully worded content.
- Preserve an upgrade path to admin-editable FAQ and model-backed AI without
  changing the public UI mental model.
