# Public Adoption And Sponsorship Journey Design

## Summary

Design a full public intake journey for HKSCDA that lets visitors shortlist multiple animals, submit one ranked adoption application, and later support sponsor animals through a recurring pledge flow. The blueprint covers adoption, sponsorship, AI guidance, public status pages, and admin intake operations, but implementation should be phased.

The first implementation phase is **Public Adoption Conversion First**. It improves the existing single-animal adoption form into a guided multi-animal adoption journey while keeping the current coordinator and CRM foundations intact.

## Current Context

The current public flow is single-animal oriented:

- Animal listing and detail pages link directly to `/adoption/apply`.
- `/adoption/apply` expects one `animalId`, `animalName`, and `type` from the query string.
- The public application form writes a summary row to `adoption_applications`.
- Server code then creates a coordinator `adoption_case` from that public application.
- Sponsor animals use the same animal detail component and currently lead to the same application route, while the sponsor listing page separately explains manual payment methods.

The admin side already has:

- Coordinator cases, statuses, matches, tasks, reports, adopters, and animal internal profile work.
- Donor/CRM supporter records, donations, payments, receipts, consent, messages, and audit timeline patterns.
- Admin route/API conventions with role-gated server handlers and no-store responses for sensitive data.

The new journey should build on these patterns instead of replacing them.

## Approved Product Direction

### Full Journey Blueprint

Visitors can browse adoption animals and sponsor animals, then add animals to one shared shortlist. Each selected animal has exactly one intent:

- adoption
- sponsorship

The same animal cannot be selected for both intents at the same time.

From the shared shortlist, users enter separate flows:

- Adoption flow: rank up to 3 adoption animals, complete a guided wizard, upload home/window/environment photos, provide visit date-range and time-window preferences, submit one application, receive a confirmation email with an expiring status-page magic link.
- Sponsorship flow: choose sponsor animal preferences, select a monthly support tier, submit a recurring pledge, provide payment proof image and reference, and wait for staff confirmation.
- AI guide flow: starts as static field guidance in Phase 1, then becomes a grounded FAQ assistant in a later phase.

### Implementation Phases

Phase 1: Public Adoption Conversion First

- Floating shortlist tray.
- Adoption shortlist submit flow. Sponsorship selection and pledge actions remain blueprint-only in this phase unless a later plan explicitly pulls in a placeholder.
- Up to 3 ranked adoption animals.
- Complete guided adoption questionnaire.
- Home/window/environment photo upload.
- Visit date-range and time-window preferences.
- Local browser draft autosave.
- Confirmation email in Traditional Chinese or English.
- Expiring magic-link status page.
- Simple status page with received confirmation, submitted summary, and next-step checklist.
- Admin unified inbox summary item with SLA/urgency and a deep link.
- Adoption case detail shows full questionnaire, animal ranking, visit preferences, and photos.

Phase 2: Sponsorship Pledge And Proof

- Sponsorship intent flow from the same shortlist.
- Monthly support tiers.
- Recurring pledge record with manual payment methods first.
- Payment proof image, reference, method, amount, and date.
- Pledge states: `pending_payment`, `provisional`, `active`, `needs_followup`, `cancelled`.
- Staff payment proof confirmation.
- Status page sponsorship section.

Phase 3: AI Guide And Editable Knowledge

- Grounded AI FAQ assistant based on HKSCDA adoption and sponsorship knowledge.
- AI does not read personal form content, uploaded files, phone, address, payment reference, or free-text application answers.
- Phase 1 reserves UI space with static guidance; model-backed FAQ arrives later.
- Core safety and policy content remains repo-owned.
- FAQ entries, field hints, preparation checklists, and email templates can later be editable in admin.

Phase 4: Account Dashboard And Advanced Inbox

- Supabase Auth magic-link or passwordless dashboard.
- Cross-device application, sponsorship, and donation history.
- Unified intake inbox grows into a lane-based workbench with SLA handling.

## Public Shortlist UX

The shortlist should feel like guided selection, not ecommerce checkout.

### Storage And Limits

Before submission, the shortlist is stored in browser local storage. It contains:

- animal id
- animal name
- animal type
- image URL or placeholder data
- intent
- selected order/rank

Limits:

- Adoption intent: max 3 animals.
- Sponsorship intent: max 10 animals.
- One animal cannot have both intents.

If local storage fails, the UI should degrade to in-memory session state and show a clear message if persistence is unavailable.

Phase 1 only needs to activate the adoption intent in the shortlist. The shared adoption/sponsorship shortlist is the target journey model, but the first implementation can leave sponsor animal pages on the current sponsor/payment-information behavior until the sponsorship phase begins.

### Entry Pattern

Use a floating bottom tray. It appears after the first selected animal and stays lightweight:

- Shows total selected count.
- Shows adoption and sponsorship counts separately.
- Offers the next action based on selected intents.

Behavior:

- If adoption animals exist, show `Apply to adopt`.
- If only sponsorship animals exist, show `Start sponsorship`.
- If both intents exist in the later full journey, show separate actions or a review step that clearly splits the two flows. Phase 1 should not present a working sponsorship action until sponsorship pledge/proof is implemented.

### Animal Cards And Detail Pages

Animal cards and detail pages should add intent-aware actions:

- Adoption-eligible animals: add to adoption shortlist.
- Sponsor animals: add to sponsorship shortlist.
- Selected animals show selected state and allow removal.
- If the user attempts to switch intent for the same animal, ask them to remove or convert the current selection first.

## Phase 1 Adoption Wizard

The first implementation phase uses a friendly linear wizard. It should be bilingual across Traditional Chinese and English.

### Step 1: Selected Animals

Users rank up to 3 animals. Ranking is required when more than one animal is selected.

The UI explains that ranking helps coordinators understand preference, but does not guarantee matching.

Data captured:

- ranked animal preferences
- animal snapshots for name/type at submission time

### Step 2: Contact And Household

Capture:

- applicant name
- phone
- email
- address
- language preference
- preferred contact method
- household size

This retains the fields currently required by the public form while making them part of the guided wizard.

### Step 3: Home Environment

Capture:

- housing type
- landlord or estate restrictions
- window and door safety readiness
- indoor space notes
- whether home modifications are possible

This step should explain why environment information matters for animal safety.

### Step 4: Pet Care Readiness

Capture:

- current pets
- pet care experience
- family/household agreement
- daily schedule and time at home
- expected monthly care budget
- emergency care plan
- reason for adoption

The tone should be friendly and preparatory, not exam-like.

### Step 5: Visit Preferences

Collect visit preferences without creating a real booking slot.

Capture:

- available date range
- preferred time windows
- notes for staff

Examples:

- future date range in the next few weeks
- weekday evenings
- weekend afternoons

Staff confirm the actual visit manually.

### Step 6: Photos

Include home, window, and living environment photo uploads in Phase 1.

Rules:

- Store files in private storage.
- Validate file type, file size, and count.
- Show examples of useful photos.
- Uploads are not shown on the public status page.
- Admin access is role-gated and no-store.

Local draft autosave cannot reliably preserve selected files across sessions. The draft should preserve text answers and remind users that photos may need to be selected again before submission.

### Step 7: Review And Submit

The review step shows:

- ranked animals
- contact summary
- household summary
- visit preference
- photo count
- terms/privacy confirmation

On successful submission, show an application reference and send confirmation email.

## Static Guidance And AI Blueprint

Phase 1 includes static guidance in the wizard:

- why HKSCDA asks a question
- examples of useful answers
- preparation tips
- privacy reminders

The future AI guide is a grounded FAQ assistant:

- It can answer adoption and sponsorship questions using approved HKSCDA knowledge.
- It can know the current language and current field type.
- It cannot read form content or uploaded files.
- It should not judge, score, rewrite, or block applications.

Knowledge content model:

- Repo-owned content for core policies, safety boundaries, and non-negotiable rules.
- Admin-editable content later for FAQ entries, field hints, email copy, and preparation checklists.

## Submission Architecture And Data Model

Keep `adoption_applications` as the compatibility summary table. Add detail tables for the richer journey instead of widening the summary table heavily.

### Phase 1 Tables

`adoption_application_detail`

- public application id
- language
- structured questionnaire answers
- visit preference summary
- terms/privacy version
- source metadata
- created timestamp

`adoption_application_animal_preference`

- public application id
- rank
- animal id
- animal name snapshot
- animal type snapshot

`adoption_application_visit_preference`

- public application id
- date range start
- date range end
- preferred time windows
- notes

`adoption_application_photo`

- public application id
- private storage path
- file name
- file type
- file size
- photo category
- uploaded timestamp

`public_status_token`

- token hash
- entity type
- entity id
- expires at
- revoked at
- created at
- last viewed at

Tokens should be long, random, hashed at rest, and expire by default after 30 days.

### Submission Flow

On submit, the server should:

1. Validate the wizard payload.
2. Verify Turnstile and rate limit using existing public submission patterns.
3. Upload or finalize private photo storage references.
4. Insert the existing `adoption_applications` summary.
5. Insert detail, ranked animal preferences, visit preference, and photo metadata.
6. Create or update the coordinator `adoption_case`.
7. Create an inbox summary item or equivalent staff activity marker.
8. Generate a public status token.
9. Send confirmation email with the expiring status link.

If the email send fails, do not roll back the application. Staff can still see the case, and the status link can be regenerated.

If database persistence fails after photo uploads, clean up orphaned files or mark them unattached for cleanup.

## Magic-Link Status Page

Phase 1 uses a lightweight token-based status page, not full account login.

Authentication:

- Email contains an expiring URL with a long random token.
- Token is hashed at rest.
- First phase does not require email re-entry.
- Later dashboard phase should use Supabase Auth magic-link/passwordless login.

Phase 1 status page shows:

- received confirmation
- application reference
- submitted time
- ranked animal summary
- visit preference summary
- submitted contact summary with sensitive details minimized
- next-step preparation checklist
- HKSCDA contact fallback

It does not show:

- uploaded photos
- internal staff notes
- full coordinator status history
- sensitive admin-only review fields

Expired token page:

- Explains the link expired.
- Offers a resend path by email.

## Email Notifications

Phase 1 sends bilingual email only.

Templates:

- adoption application confirmation
- status link and expiry explanation
- next-step preparation checklist

Blueprint templates for later phases:

- sponsorship pledge confirmation
- payment proof received
- payment confirmed
- request more information
- visit arrangement
- payment rejected or needs follow-up
- cancellation
- completion

Emails should be recorded in `message` or equivalent history where practical, so admin timelines can show what was sent.

## Admin Operations

### Unified Intake Inbox

Phase 1 includes a lightweight unified intake inbox summary, not a full workbench.

Lanes:

- new adoption applications
- visit preference follow-up
- uploaded photos to review
- needs follow-up
- later: sponsorship payment proof

Each item shows:

- applicant name
- submitted time
- selected animal ranking summary
- visit preference summary
- photo count
- SLA/overdue indicator
- primary deep link to adoption case detail

This satisfies the unified intake direction while keeping detailed review inside existing coordinator views.

### Adoption Case Detail

The adoption case detail is the primary Phase 1 review surface.

It should show:

- ranked animal preferences
- full questionnaire answers grouped by wizard section
- visit date range and time-window preferences
- uploaded photo gallery/download links
- submitted language
- terms/privacy version
- public status link metadata

Existing coordinator capabilities remain the operational layer:

- case status controls
- matches
- tasks/follow-ups
- adopter profile links
- finalization flow

Public questionnaire data is read-only after submission in Phase 1.

## Sponsorship Blueprint

Sponsorship is designed in the journey but not implemented in Phase 1.

Approved direction:

- Same shortlist can hold sponsorship intent.
- Sponsorship submit flow is separate from adoption.
- Sponsorship is a recurring pledge, not automatic subscription in the first sponsorship implementation.
- Payment remains manual through FPS, bank transfer, PayMe, PayPal, or other listed methods.
- User chooses a monthly support tier.
- User uploads proof image and enters reference, method, amount, and payment date.

Data model:

`sponsorship_pledge`

- supporter identity
- monthly tier
- amount
- notes
- status

`sponsorship_preference`

- pledge id
- sponsor animal id
- preference/order
- animal snapshot

`sponsorship_payment_proof`

- pledge id
- private storage path
- payment method
- reference
- amount
- payment date
- review status

States:

- `pending_payment`: pledge created, no proof yet
- `provisional`: proof submitted, awaiting staff review
- `active`: first valid payment confirmed
- `needs_followup`: proof/payment requires clarification
- `cancelled`: pledge closed before activation or cancelled later

This should integrate with existing supporter, donation, payment, message, and CRM timeline concepts.

## Privacy And Security

Rules:

- Public application status tokens are random, hashed, and expiring.
- First-phase status page exposes only a limited summary.
- Uploaded photos are private and admin-gated.
- Admin detail and photo APIs use no-store.
- AI does not read user-entered form content or uploaded files.
- Sensitive fields and files are never fetched through unauthenticated Supabase client queries.
- File upload validates ownership and allowed attachment categories.
- Public submission uses Turnstile and rate limits.
- Staff actions use existing Supabase service-role server patterns after admin auth.

## Error Handling

Public UX:

- Shortlist limit errors should be friendly and reversible.
- Local draft errors should not block submission; show a clear warning.
- Photo upload failures let users retry without losing form answers.
- Validation errors map to the relevant wizard step.
- Submit errors preserve local draft until the application is confirmed saved.

Server:

- Invalid payloads return structured 400 errors.
- Rate-limit or verification failures return actionable messages.
- Storage/DB partial failures clean up or mark orphaned uploads for cleanup.
- Email failure logs but does not roll back a saved application.
- Expired status tokens offer a resend path.

Admin:

- Missing auth returns 401.
- Insufficient role returns 403.
- Missing application/case/photo returns 404.
- Sensitive API responses are no-store.

## Testing Plan

Phase 1 automated coverage:

- Shortlist reducer limits, intent exclusivity, add/remove behavior, and ranking.
- Wizard validation and step completion rules.
- Local draft serialization and restoration for non-file fields.
- Expanded public submission schema.
- Server persistence of summary, detail, animal preferences, visit preferences, and photo metadata.
- Coordinator case creation from expanded public applications.
- Public status token creation, hashing, expiry, and lookup.
- Status page response behavior for valid, expired, revoked, and missing tokens.
- Bilingual email template rendering.
- Admin inbox item mapping.
- Admin detail/photo API role-gating and no-store behavior.
- Migration safety tests for new tables and private attachment metadata.

Manual verification:

- Add/remove/rank animals from listing and detail pages.
- Hit adoption limit and confirm helpful messaging.
- Complete wizard in Traditional Chinese and English.
- Confirm local draft restores non-file answers.
- Submit with valid photo uploads.
- Receive confirmation email and open status link.
- Confirm expired token behavior in a controlled test.
- Open admin inbox and deep-link to case detail.
- Verify questionnaire, visit preference, ranking, and photos are visible to staff.
- Verify uploaded photos are not publicly accessible.

## Phase 1 Out Of Scope

- Sponsorship pledge/proof implementation.
- Sponsorship shortlist submission or pledge CTA changes on public sponsor pages.
- Automatic recurring subscription billing.
- WhatsApp automation.
- Full Supabase Auth public dashboard.
- AI model-backed FAQ assistant.
- Admin-editable knowledge base or template CMS.
- User editing submitted applications from the status page.
- Real booking calendar or confirmed visit slots.

## Design Defaults

- Use a floating tray for shortlist entry.
- Use a linear wizard for the complete adoption questionnaire.
- Use local storage for browsing shortlist and draft answers.
- Use long random status tokens for Phase 1, with Supabase Auth magic link later.
- Keep `adoption_applications` as compatibility summary.
- Store rich application data in new detail/preference/visit/photo tables.
- Store photos privately.
- Send email only in Phase 1.
- Keep admin detailed review in adoption case detail, with a lightweight unified intake inbox summary.
