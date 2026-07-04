# Supporter Detail Profile And Timeline Design

## Summary

Redesign the admin 支持者 detail page into a balanced contact-and-activity workspace. The page should help staff quickly answer two questions:

- Who is this supporter and how should we contact them?
- What has happened with this person across donations, receipts, communication, adoption cases, follow-ups, and successful adoptions?

This builds on the existing `/admin/supporters/$id` route and the CRM supporter detail API. It does not create a parallel supporter screen.

## Current Context

The app already has:

- `/admin/supporters` and `/admin/supporters/$id` CRM routes.
- `SupporterDetail`, `SupporterTimeline`, `ConsentEditor`, `ManualDonationDialog`, and donation/receipt sections.
- `supporter` and `supporter_role` records that now represent donors, adopters, volunteers, and fosters.
- CRM detail data for contact fields, roles, tags, donations, payments, receipts, consents, messages, audit logs, and an assembled timeline.
- Adoption coordinator data in `adopter_profile`, `adoption_case`, `adoption_followup`, and `successful_adoption`.
- Existing adopter and case detail pages for editing adoption/coordinator workflows.

The current supporter detail page is still donation-heavy. It shows contact basics and roles, but it does not surface linked adopter profile data or adoption activity in the supporter timeline.

## Goals

1. Make the supporter detail page useful for all supporter roles, not only donors.
2. Keep personal/contact detail visible while staff review activity.
3. Show linked adoption context when the supporter has an adopter profile or adoption cases.
4. Add adoption events to the supporter timeline without adding a new notes subsystem.
5. Keep adoption data read-only on this page and link to existing coordinator screens for edits.
6. Preserve current donation, receipt, consent, and manual donation workflows.
7. Keep the data load simple by extending `GET /api/admin/supporters/:id`.

## Non-Goals

- New CRM profile fields such as preferred contact method, address, emergency contact, or internal notes.
- A new manual interaction notes timeline.
- Editing adopter profile, case, task, or successful adoption data from the supporter page.
- Replacing existing adopter detail or case detail pages.
- New public-facing supporter views.
- New database tables for this v1.

## Chosen Product Shape

Use a two-column admin workspace.

On desktop:

- Left column: sticky-ish profile sidebar with personal/contact details and linked adopter context.
- Right column: activity workspace with counters, timeline filters, unified timeline, and existing donation/receipt operational sections.

On mobile:

- The profile sidebar stacks above the activity workspace.
- Timeline filters wrap into compact controls.
- Action buttons keep the existing mobile minimum touch target behavior.

The selected layout is "Contact Sidebar + Activity Workspace" because staff can keep identity and contact context visible while scanning mixed CRM and adoption activity.

## Profile Sidebar

The sidebar should show:

- Name.
- Role badges: donor, adopter, volunteer, foster.
- Tags.
- Email, phone, language.
- Email and WhatsApp consent summary.
- Record source.
- Created and updated dates.
- Soft-delete state if present.
- Linked adopter profile summary when available.

Linked adopter profile summary should use existing adoption data only:

- Adopter display name.
- Phone/email where available from linked supporter/adopter data.
- Living area, address, birthday, household size, blacklist state, and blacklist reason when available from `adopter_profile`.
- Link to `/admin/coordinator/adopters/$id`.

If more than one adopter profile is linked to the supporter, the API returns all linked profiles. The sidebar shows the most recently updated or most recently created profile as the primary profile, and includes compact links for the remaining profiles. Counts and timeline activity combine records from all linked profiles.

If no adoption data is linked, show a quiet empty state: `未有相關領養紀錄 / No linked adoption history.`

## Activity Workspace

The workspace should show summary counters:

- Lifetime donation amount.
- Donation count.
- Receipt count.
- Pending payment count.
- Linked adoption case count.
- Open follow-up count.
- Successful adoption count.

The unified timeline should be the main cross-role history surface. It should support these filters:

- All.
- Donations.
- Receipts.
- Communication.
- Adoption.
- Follow-ups.
- System records.

Existing donation and receipt lists remain available in the workspace because they include operational actions such as issuing and voiding receipts. The timeline should help staff understand chronology; the lists should continue to support finance actions.

## Data Model

No new core tables are required.

Extend the CRM domain type:

```ts
type SupporterDetail = SupporterSummary & {
  source: string;
  createdAt: string;
  updatedAt: string;
  donations: DonationHistoryRow[];
  payments: PaymentHistoryRow[];
  receipts: ReceiptHistoryRow[];
  consents: ConsentHistoryRow[];
  messages: MessageHistoryRow[];
  auditLogs: AuditHistoryRow[];
  adoption: SupporterAdoptionContext;
  timeline: SupporterTimelineItem[];
};
```

Add focused adoption context types in `src/lib/crm/types.ts` or a nearby CRM module:

```ts
type SupporterAdoptionContext = {
  profiles: SupporterAdopterProfileSummary[];
  cases: SupporterAdoptionCaseSummary[];
  followups: SupporterAdoptionFollowupSummary[];
  successfulAdoptions: SupporterSuccessfulAdoptionSummary[];
};
```

The exact fields should be small and display-oriented, reusing the existing adoption coordinator domain where practical instead of leaking full private case records into CRM.

## API Design

Extend the existing endpoint:

- `GET /api/admin/supporters/:id`

Response:

```ts
{
  supporter: SupporterDetail;
}
```

The endpoint remains authenticated and no-store. It continues to use the current CRM access gate for supporter detail. The new adoption context is read-only and is returned only through the server-side service role repository, never through unauthenticated client Supabase queries.

No new public endpoint is required for v1.

## Repository Data Flow

`createSupabaseCrmRepository.getSupporterDetail(id)` should continue loading the existing CRM data, then enrich it with adoption data by supporter id.

Recommended data flow:

1. Load base supporter summary and CRM history as today.
2. Find adopter profiles where `adopter_profile.supporter_id = supporterId`.
3. Build the adopter profile id set.
4. Load adoption cases where `adoption_case.supporter_id = supporterId` or `adoption_case.adopter_profile_id` is in the linked profile id set.
5. Load follow-up tasks where `adoption_followup.adoption_case_id` is in the case id set or `adoption_followup.adopter_profile_id` is in the linked profile id set.
6. Load successful adoptions where `successful_adoption.supporter_id = supporterId` or `successful_adoption.adopter_profile_id` is in the linked profile id set.
7. Map those rows into compact CRM display types.
8. Pass the CRM rows plus adoption context into `assembleSupporterTimeline`.

If no adopter profiles exist, still check for adoption cases and successful adoptions directly linked by `supporter_id`.

## Timeline Model

Extend `SupporterTimelineItem.kind` to include adoption-specific values while preserving existing kinds:

```ts
type SupporterTimelineKind =
  | "donation"
  | "payment"
  | "receipt"
  | "consent"
  | "message"
  | "audit"
  | "adoption_case"
  | "adoption_followup"
  | "successful_adoption";
```

Add optional link metadata:

```ts
type SupporterTimelineItem = {
  id: string;
  at: string;
  kind: SupporterTimelineKind;
  title: string;
  description: string;
  amountCents?: number;
  status?: string;
  link?: {
    to: "/admin/applications/$id" | "/admin/coordinator/adopters/$id";
    params: { id: string };
  };
};
```

Timeline events:

- Adoption case created: use `adoption_case.created_at`.
- Adoption case closed: use `adoption_case.closed_at` when present.
- Follow-up scheduled: use `adoption_followup.scheduled_at` or `due_at` when present.
- Follow-up completed: use `adoption_followup.completed_at` when present.
- Successful adoption approved: use `successful_adoption.approval_date`.
- Successful adoption picked up: use `successful_adoption.pickup_date` when present.

Each adoption timeline item should link to the existing case or adopter page where possible. Timeline ordering remains newest first.

Timeline filter grouping should be explicit:

- Donations: `donation`, `payment`.
- Receipts: `receipt`.
- Communication: `consent`, `message`.
- Adoption: `adoption_case`, `successful_adoption`.
- Follow-ups: `adoption_followup`.
- System records: `audit`.

## Component Design

Keep the page modular:

- `SupporterDetail`: owns the TanStack Query load, mutations, and overall page layout.
- `SupporterProfileSidebar`: renders contact, roles, tags, consent summary, record metadata, and linked adopter profile fields.
- `SupporterActivitySummary`: renders the cross-role counters.
- `SupporterTimelineFilters`: manages the selected timeline category.
- `SupporterTimeline`: renders richer item kinds and optional links.
- Existing `ConsentEditor`, `ManualDonationDialog`, donation list, and receipt list remain reusable pieces inside the workspace.

The component split should keep data fetching in `SupporterDetail`; child components receive typed props and stay presentational.

## Error And Empty States

- Page-level loading and error states stay as they are now.
- If CRM detail loads but adoption enrichment is empty, render a normal supporter page with the quiet no-adoption empty state.
- If adoption enrichment query fails inside the server repository, the endpoint should return an error rather than silently showing partial data. This avoids staff trusting an incomplete history.
- Timeline empty state remains available for supporters with no activity.
- Unsupported or unknown timeline statuses should fall back to the raw status string, matching current timeline behavior.

## Permissions And Privacy

The supporter detail route remains protected by `requireAdminPageAccess("supporters")`.

The API continues to require admin CRM access. Because linked adoption data can include sensitive address, birthday, household, and blacklist fields, no adoption enrichment should be fetched client-side from public Supabase clients.

The supporter page is read-only for adoption details. Editing adoption data remains behind coordinator pages and their existing access model.

## Testing

Add focused tests for:

- CRM repository/service mapping of adoption context for a supporter with linked adopter profile, cases, follow-ups, and successful adoptions.
- Direct supporter-linked adoption cases when no adopter profile exists.
- Timeline assembly ordering across donation, receipt, adoption case, follow-up, and successful adoption events.
- Timeline filter classification for CRM, communication, adoption, follow-up, and audit/system groups.
- Empty adoption context.
- Component-level rendering only where existing patterns make it cheap.

Manual smoke checks:

- Open a donor-only supporter and confirm no adoption history state is quiet.
- Open a supporter with adopter role and linked adopter profile.
- Confirm sidebar contact details, roles, tags, consent, and adoption summary.
- Confirm timeline filters and links to case/adopter pages.
- Confirm existing donation, manual donation, issue receipt, and void receipt actions still work.
- Confirm mobile layout stacks cleanly.

## Open Decisions

- The first implementation should not add CRM notes. A later notes phase can add a dedicated append-only interaction table and timeline kind.
- If future performance needs appear, adoption enrichment can move to a separate `/api/admin/supporters/:id/activity` endpoint. For v1, one enriched detail response is simpler.
- If multiple linked adopter profiles become common, a later pass can add a dedicated profile switcher. For v1, primary-plus-links is enough.
