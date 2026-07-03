# Supporter Detail Profile And Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin/supporters/$id` into a balanced supporter profile and activity workspace with linked adoption history.

**Architecture:** Extend the existing CRM supporter detail response with a typed, read-only adoption context loaded server-side. Keep CRM timeline assembly as the single chronology builder, and split the React detail page into focused presentational components for profile, counters, filters, and timeline rendering.

**Tech Stack:** TypeScript, TanStack Start, TanStack Query, TanStack Router, React 19, Bun test, Supabase service-role server repositories, Tailwind CSS v4 tokens.

---

## File Structure

- Modify `src/lib/crm/types.ts` to add adoption context types, timeline kind union, and optional route link metadata.
- Modify `src/lib/crm/timeline.ts` to include adoption case, follow-up, and successful adoption events.
- Modify `src/lib/crm/timeline.test.ts` to cover mixed CRM/adoption ordering.
- Create `src/lib/crm/adoptionContext.server.ts` for the server-only Supabase adoption enrichment query and row mapping.
- Create `src/lib/crm/adoptionContext.server.test.ts` for focused fake-client coverage of the enrichment helper.
- Modify `src/lib/crm/repository.server.ts` to call `loadSupporterAdoptionContext()` and pass adoption context into the timeline assembler.
- Create `src/components/admin/crm/supporterTimelineFilters.ts` for timeline filter grouping.
- Create `src/components/admin/crm/supporterTimelineFilters.test.ts` for filter classification.
- Create `src/components/admin/crm/SupporterProfileSidebar.tsx` for identity/contact/adoption profile summary.
- Create `src/components/admin/crm/SupporterActivitySummary.tsx` for cross-role counters.
- Create `src/components/admin/crm/SupporterTimelineFilters.tsx` for the segmented filter control.
- Modify `src/components/admin/crm/SupporterTimeline.tsx` to render new timeline kinds and optional TanStack route links.
- Modify `src/components/admin/crm/SupporterDetail.tsx` to use the sidebar/workspace layout and filtered timeline.

## Task 1: CRM Adoption Types And Timeline Events

**Files:**

- Modify: `src/lib/crm/types.ts`
- Modify: `src/lib/crm/timeline.ts`
- Test: `src/lib/crm/timeline.test.ts`

- [ ] **Step 1: Add failing timeline tests**

Append these tests to `src/lib/crm/timeline.test.ts`:

```ts
test("combines adoption events with CRM activity newest first", () => {
  const timeline = assembleSupporterTimeline({
    donations: [
      {
        id: "d1",
        amountCents: 20000,
        currency: "HKD",
        purpose: "medical",
        status: "succeeded",
        method: "fps",
        receiptRequested: true,
        createdAt: "2026-06-01T10:00:00.000Z",
      },
    ],
    payments: [],
    receipts: [],
    consents: [],
    messages: [],
    auditLogs: [],
    adoption: {
      profiles: [],
      cases: [
        {
          id: "case-1",
          adopterProfileId: "profile-1",
          applicantName: "Ada",
          animalType: "cat",
          status: { key: "contacted", labelZh: "已聯絡", labelEn: "Contacted", color: "cyan" },
          requestedAnimalName: "Mochi",
          createdAt: "2026-06-02T10:00:00.000Z",
          closedAt: "2026-06-05T10:00:00.000Z",
        },
      ],
      followups: [
        {
          id: "task-1",
          adoptionCaseId: "case-1",
          adopterProfileId: "profile-1",
          title: "Home visit",
          taskType: "home_visit",
          status: { key: "scheduled", labelZh: "已安排", labelEn: "Scheduled", color: "coral" },
          priority: "normal",
          dueAt: "2026-06-03T10:00:00.000Z",
          scheduledAt: "2026-06-04T10:00:00.000Z",
          completedAt: "2026-06-04T11:00:00.000Z",
          volunteer: "May",
          contactChannel: "phone",
          createdAt: "2026-06-03T09:00:00.000Z",
          updatedAt: "2026-06-04T11:15:00.000Z",
        },
      ],
      successfulAdoptions: [
        {
          id: "success-1",
          adoptionCaseId: "case-1",
          adopterProfileId: "profile-1",
          supporterId: "supporter-1",
          caseNumber: "AD-2026-0001",
          animalId: "animal-1",
          animalName: "Mochi",
          adoptionFeeCents: 80000,
          approvalDate: "2026-06-06T10:00:00.000Z",
          pickupDate: "2026-06-07T10:00:00.000Z",
        },
      ],
    },
  });

  expect(timeline.map((item) => item.id)).toEqual([
    "successful_adoption:success-1:pickup",
    "successful_adoption:success-1:approval",
    "adoption_case:case-1:closed",
    "adoption_followup:task-1:completed",
    "adoption_followup:task-1:scheduled",
    "adoption_case:case-1:created",
    "donation:d1",
  ]);
  expect(timeline[0]).toMatchObject({
    kind: "successful_adoption",
    title: "Adoption pickup AD-2026-0001",
    amountCents: 80000,
    link: { to: "/admin/applications/$id", params: { id: "case-1" } },
  });
});

test("omits adoption timeline events when optional dates are missing", () => {
  const timeline = assembleSupporterTimeline({
    donations: [],
    payments: [],
    receipts: [],
    consents: [],
    messages: [],
    auditLogs: [],
    adoption: {
      profiles: [],
      cases: [
        {
          id: "case-1",
          adopterProfileId: null,
          applicantName: "Ada",
          animalType: "dog",
          status: { key: "screening", labelZh: "篩選中", labelEn: "Screening", color: "blue" },
          requestedAnimalName: null,
          createdAt: "2026-06-02T10:00:00.000Z",
          closedAt: null,
        },
      ],
      followups: [
        {
          id: "task-1",
          adoptionCaseId: null,
          adopterProfileId: "profile-1",
          title: "Profile follow-up",
          taskType: "followup",
          status: { key: "open", labelZh: "未完成", labelEn: "Open", color: "amber" },
          priority: "high",
          dueAt: null,
          scheduledAt: null,
          completedAt: null,
          volunteer: null,
          contactChannel: null,
          createdAt: "2026-06-03T09:00:00.000Z",
          updatedAt: "2026-06-03T09:00:00.000Z",
        },
      ],
      successfulAdoptions: [],
    },
  });

  expect(timeline.map((item) => item.id)).toEqual([
    "adoption_followup:task-1:created",
    "adoption_case:case-1:created",
  ]);
  expect(timeline[0].link).toEqual({
    to: "/admin/coordinator/adopters/$id",
    params: { id: "profile-1" },
  });
});
```

- [ ] **Step 2: Run the timeline tests and verify failure**

Run:

```bash
bun test src/lib/crm/timeline.test.ts
```

Expected: failure because `SupporterAdoptionContext` and adoption timeline event handling do not exist yet.

- [ ] **Step 3: Add CRM adoption and timeline types**

In `src/lib/crm/types.ts`, add these exported types after the existing `AuditHistoryRow` type and before `SupporterTimelineItem`:

```ts
export type SupporterAdoptionStatusSummary = {
  key: string;
  labelZh: string;
  labelEn: string;
  color: string;
};

export type SupporterAdopterProfileSummary = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  livingArea: string | null;
  isBlacklisted: boolean;
  birthday: string | null;
  address: string | null;
  householdSize: string | null;
  blacklistReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupporterAdoptionCaseSummary = {
  id: string;
  adopterProfileId: string | null;
  applicantName: string;
  animalType: string;
  status: SupporterAdoptionStatusSummary;
  requestedAnimalName: string | null;
  createdAt: string;
  closedAt: string | null;
};

export type SupporterAdoptionFollowupSummary = {
  id: string;
  adoptionCaseId: string | null;
  adopterProfileId: string | null;
  title: string;
  taskType: string;
  status: SupporterAdoptionStatusSummary;
  priority: "low" | "normal" | "high" | "urgent";
  dueAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  volunteer: string | null;
  contactChannel: "phone" | "whatsapp" | "email" | "in_person" | "internal" | null;
  createdAt: string;
  updatedAt: string;
};

export type SupporterSuccessfulAdoptionSummary = {
  id: string;
  adoptionCaseId: string;
  adopterProfileId: string;
  supporterId: string;
  caseNumber: string;
  animalId: string;
  animalName: string | null;
  adoptionFeeCents: number | null;
  approvalDate: string;
  pickupDate: string | null;
};

export type SupporterAdoptionContext = {
  profiles: SupporterAdopterProfileSummary[];
  cases: SupporterAdoptionCaseSummary[];
  followups: SupporterAdoptionFollowupSummary[];
  successfulAdoptions: SupporterSuccessfulAdoptionSummary[];
};

export type SupporterTimelineKind =
  | "donation"
  | "payment"
  | "receipt"
  | "consent"
  | "message"
  | "audit"
  | "adoption_case"
  | "adoption_followup"
  | "successful_adoption";

export type SupporterTimelineLink =
  | { to: "/admin/applications/$id"; params: { id: string } }
  | { to: "/admin/coordinator/adopters/$id"; params: { id: string } };
```

Update `SupporterDetail` to include the new adoption context:

```ts
export type SupporterDetail = SupporterSummary & {
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

Update `SupporterTimelineItem`:

```ts
export type SupporterTimelineItem = {
  id: string;
  at: string;
  kind: SupporterTimelineKind;
  title: string;
  description: string;
  amountCents?: number;
  status?: string;
  link?: SupporterTimelineLink;
};
```

- [ ] **Step 4: Implement adoption event assembly**

In `src/lib/crm/timeline.ts`, update the type import to include `SupporterAdoptionContext`:

```ts
import type {
  AuditHistoryRow,
  ConsentHistoryRow,
  DonationHistoryRow,
  MessageHistoryRow,
  PaymentHistoryRow,
  ReceiptHistoryRow,
  SupporterAdoptionContext,
  SupporterTimelineItem,
} from "./types";
```

Add these helpers above `assembleSupporterTimeline`:

```ts
const emptyAdoptionContext: SupporterAdoptionContext = {
  profiles: [],
  cases: [],
  followups: [],
  successfulAdoptions: [],
};

function caseLink(caseId: string): SupporterTimelineItem["link"] {
  return { to: "/admin/applications/$id", params: { id: caseId } };
}

function adopterLink(adopterProfileId: string): SupporterTimelineItem["link"] {
  return { to: "/admin/coordinator/adopters/$id", params: { id: adopterProfileId } };
}

function adoptionCaseEvents(adoption: SupporterAdoptionContext): SupporterTimelineItem[] {
  return adoption.cases.flatMap((adoptionCase) => {
    const titleSubject = adoptionCase.requestedAnimalName ?? adoptionCase.animalType;
    const items: SupporterTimelineItem[] = [
      {
        id: `adoption_case:${adoptionCase.id}:created`,
        at: adoptionCase.createdAt,
        kind: "adoption_case",
        title: `Adoption case opened for ${titleSubject}`,
        description: `${adoptionCase.applicantName} · ${adoptionCase.status.labelEn}`,
        status: adoptionCase.status.key,
        link: caseLink(adoptionCase.id),
      },
    ];

    if (adoptionCase.closedAt) {
      items.push({
        id: `adoption_case:${adoptionCase.id}:closed`,
        at: adoptionCase.closedAt,
        kind: "adoption_case",
        title: `Adoption case closed for ${titleSubject}`,
        description: `${adoptionCase.applicantName} · ${adoptionCase.status.labelEn}`,
        status: adoptionCase.status.key,
        link: caseLink(adoptionCase.id),
      });
    }

    return items;
  });
}

function followupLink(followup: SupporterAdoptionContext["followups"][number]) {
  if (followup.adoptionCaseId) return caseLink(followup.adoptionCaseId);
  if (followup.adopterProfileId) return adopterLink(followup.adopterProfileId);
  return undefined;
}

function adoptionFollowupEvents(adoption: SupporterAdoptionContext): SupporterTimelineItem[] {
  return adoption.followups.flatMap((followup) => {
    const link = followupLink(followup);
    const items: SupporterTimelineItem[] = [
      {
        id: `adoption_followup:${followup.id}:created`,
        at: followup.createdAt,
        kind: "adoption_followup",
        title: `Follow-up created: ${followup.title}`,
        description: `${followup.taskType} · ${followup.status.labelEn}`,
        status: followup.status.key,
        link,
      },
    ];

    if (followup.scheduledAt ?? followup.dueAt) {
      items.push({
        id: `adoption_followup:${followup.id}:scheduled`,
        at: followup.scheduledAt ?? followup.dueAt!,
        kind: "adoption_followup",
        title: `Follow-up scheduled: ${followup.title}`,
        description: [followup.volunteer, followup.contactChannel].filter(Boolean).join(" · "),
        status: followup.status.key,
        link,
      });
    }

    if (followup.completedAt) {
      items.push({
        id: `adoption_followup:${followup.id}:completed`,
        at: followup.completedAt,
        kind: "adoption_followup",
        title: `Follow-up completed: ${followup.title}`,
        description: `${followup.taskType} · ${followup.status.labelEn}`,
        status: followup.status.key,
        link,
      });
    }

    return items;
  });
}

function successfulAdoptionEvents(adoption: SupporterAdoptionContext): SupporterTimelineItem[] {
  return adoption.successfulAdoptions.flatMap((success) => {
    const titleSubject = success.caseNumber;
    const description = [success.animalName, success.animalId].filter(Boolean).join(" · ");
    const items: SupporterTimelineItem[] = [
      {
        id: `successful_adoption:${success.id}:approval`,
        at: success.approvalDate,
        kind: "successful_adoption",
        title: `Adoption approved ${titleSubject}`,
        description,
        amountCents: success.adoptionFeeCents ?? undefined,
        status: "approved",
        link: caseLink(success.adoptionCaseId),
      },
    ];

    if (success.pickupDate) {
      items.push({
        id: `successful_adoption:${success.id}:pickup`,
        at: success.pickupDate,
        kind: "successful_adoption",
        title: `Adoption pickup ${titleSubject}`,
        description,
        amountCents: success.adoptionFeeCents ?? undefined,
        status: "picked_up",
        link: caseLink(success.adoptionCaseId),
      });
    }

    return items;
  });
}
```

Update the assembler signature:

```ts
export function assembleSupporterTimeline(input: {
  donations: DonationHistoryRow[];
  payments: PaymentHistoryRow[];
  receipts: ReceiptHistoryRow[];
  consents: ConsentHistoryRow[];
  messages: MessageHistoryRow[];
  auditLogs: AuditHistoryRow[];
  adoption?: SupporterAdoptionContext;
}): SupporterTimelineItem[] {
  const adoption = input.adoption ?? emptyAdoptionContext;
  const items: SupporterTimelineItem[] = [
    // keep the existing CRM item mappings here unchanged
    ...adoptionCaseEvents(adoption),
    ...adoptionFollowupEvents(adoption),
    ...successfulAdoptionEvents(adoption),
  ];

  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
```

When editing, preserve the existing donation/payment/receipt/consent/message/audit mappings inside `items`; only add the adoption spread entries before the final sort.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun test src/lib/crm/timeline.test.ts
```

Expected: all `crm timeline` tests pass.

Commit:

```bash
git add src/lib/crm/types.ts src/lib/crm/timeline.ts src/lib/crm/timeline.test.ts
git commit -m "feat: add supporter adoption timeline events"
```

## Task 2: Server-Side Adoption Context Loader

**Files:**

- Create: `src/lib/crm/adoptionContext.server.ts`
- Create: `src/lib/crm/adoptionContext.server.test.ts`
- Modify: `src/lib/crm/repository.server.ts`

- [ ] **Step 1: Write failing adoption context loader tests**

Create `src/lib/crm/adoptionContext.server.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { loadSupporterAdoptionContext } from "./adoptionContext.server";

type TableName =
  | "adopter_profile"
  | "adoption_case"
  | "adoption_followup"
  | "successful_adoption"
  | "coordinator_status"
  | "animals";

type FakeRows = Record<TableName, Record<string, unknown>[]>;

class FakeQuery {
  private eqFilters: Array<{ column: string; value: unknown }> = [];
  private inFilters: Array<{ column: string; value: unknown[] }> = [];

  constructor(
    private readonly rows: FakeRows,
    private readonly table: TableName,
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.eqFilters.push({ column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.inFilters.push({ column, value });
    return this;
  }

  order() {
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    const filtered = this.rows[this.table]
      .filter((row) =>
        this.eqFilters.every((filter) => row[filter.column] === filter.value),
      )
      .filter((row) =>
        this.inFilters.every((filter) => filter.value.includes(row[filter.column] as never)),
      );
    return { data: filtered, error: null };
  }
}

function fakeClient(rows: Partial<FakeRows>) {
  const allRows: FakeRows = {
    adopter_profile: [],
    adoption_case: [],
    adoption_followup: [],
    successful_adoption: [],
    coordinator_status: [],
    animals: [],
    ...rows,
  };

  return {
    from(table: TableName) {
      return new FakeQuery(allRows, table);
    },
  };
}

function crmClient(rows: Partial<FakeRows>) {
  return fakeClient(rows) as unknown as Parameters<typeof loadSupporterAdoptionContext>[0];
}

describe("loadSupporterAdoptionContext", () => {
  test("loads linked profiles, cases, follow-ups, successful adoptions, statuses, and animals", async () => {
    const context = await loadSupporterAdoptionContext(
      crmClient({
        adopter_profile: [
          {
            id: "profile-1",
            supporter_id: "supporter-1",
            name_english: "Ada Wong",
            name_chinese: "黃雅達",
            birthday: "1990-01-01",
            address: "HK Island",
            household_size: "3",
            is_blacklisted: false,
            blacklist_reason: null,
            created_at: "2026-06-01T10:00:00.000Z",
            updated_at: "2026-06-02T10:00:00.000Z",
            supporter: { id: "supporter-1", name: "Ada", email: "ada@example.com", phone: "9123 4567" },
            living_area: { name_zh: "香港島", name_en: "Hong Kong Island" },
          },
        ],
        adoption_case: [
          {
            id: "case-1",
            supporter_id: "supporter-1",
            adopter_profile_id: "profile-1",
            status_id: "status-case",
            requested_animal_id: "animal-1",
            animal_type: "cat",
            applicant_name: "Ada",
            applicant_phone: "9123 4567",
            applicant_email: "ada@example.com",
            closed_at: null,
            created_at: "2026-06-03T10:00:00.000Z",
          },
        ],
        adoption_followup: [
          {
            id: "task-1",
            adoption_case_id: "case-1",
            adopter_profile_id: "profile-1",
            status_id: "status-task",
            title: "Home visit",
            task_type: "home_visit",
            priority: "normal",
            due_at: "2026-06-04T10:00:00.000Z",
            scheduled_at: null,
            completed_at: null,
            volunteer: "May",
            contact_channel: "phone",
            created_at: "2026-06-03T12:00:00.000Z",
            updated_at: "2026-06-03T12:00:00.000Z",
          },
        ],
        successful_adoption: [
          {
            id: "success-1",
            adoption_case_id: "case-1",
            supporter_id: "supporter-1",
            adopter_profile_id: "profile-1",
            case_number: "AD-2026-0001",
            animal_id: "animal-1",
            adoption_fee_cents: 80000,
            approval_date: "2026-06-05T10:00:00.000Z",
            pickup_date: null,
          },
        ],
        coordinator_status: [
          {
            id: "status-case",
            key: "screening",
            label_zh: "篩選中",
            label_en: "Screening",
            color: "blue",
          },
          {
            id: "status-task",
            key: "scheduled",
            label_zh: "已安排",
            label_en: "Scheduled",
            color: "coral",
          },
        ],
        animals: [{ id: "animal-1", name: "Mochi", name_en: "Momo" }],
      }),
      "supporter-1",
    );

    expect(context.profiles).toEqual([
      {
        id: "profile-1",
        displayName: "黃雅達 / Ada Wong",
        email: "ada@example.com",
        phone: "9123 4567",
        livingArea: "香港島",
        isBlacklisted: false,
        birthday: "1990-01-01",
        address: "HK Island",
        householdSize: "3",
        blacklistReason: null,
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-02T10:00:00.000Z",
      },
    ]);
    expect(context.cases[0]).toMatchObject({
      id: "case-1",
      requestedAnimalName: "Mochi",
      status: { key: "screening", labelZh: "篩選中", labelEn: "Screening" },
    });
    expect(context.followups[0]).toMatchObject({
      id: "task-1",
      status: { key: "scheduled", labelZh: "已安排", labelEn: "Scheduled" },
    });
    expect(context.successfulAdoptions[0]).toMatchObject({
      id: "success-1",
      animalName: "Mochi",
      adoptionFeeCents: 80000,
    });
  });

  test("loads directly supporter-linked cases when no adopter profile exists", async () => {
    const context = await loadSupporterAdoptionContext(
      crmClient({
        adoption_case: [
          {
            id: "case-1",
            supporter_id: "supporter-1",
            adopter_profile_id: null,
            status_id: "status-case",
            requested_animal_id: null,
            animal_type: "dog",
            applicant_name: "Ada",
            applicant_phone: "9123 4567",
            applicant_email: null,
            closed_at: null,
            created_at: "2026-06-03T10:00:00.000Z",
          },
        ],
        coordinator_status: [
          {
            id: "status-case",
            key: "new",
            label_zh: "新個案",
            label_en: "New",
            color: "amber",
          },
        ],
      }),
      "supporter-1",
    );

    expect(context.profiles).toEqual([]);
    expect(context.cases).toHaveLength(1);
    expect(context.cases[0].adopterProfileId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the loader tests and verify failure**

Run:

```bash
bun test src/lib/crm/adoptionContext.server.test.ts
```

Expected: failure because `src/lib/crm/adoptionContext.server.ts` does not exist yet.

- [ ] **Step 3: Implement the adoption context loader**

Create `src/lib/crm/adoptionContext.server.ts` with this structure:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SupporterAdoptionCaseSummary,
  SupporterAdoptionContext,
  SupporterAdoptionFollowupSummary,
  SupporterAdoptionStatusSummary,
  SupporterAdopterProfileSummary,
  SupporterSuccessfulAdoptionSummary,
} from "./types";

type CrmAdoptionClient = Pick<SupabaseClient, "from">;

type StatusRow = {
  id: string;
  key: string;
  label_zh: string;
  label_en: string;
  color: string;
};

type AnimalRow = {
  id: string;
  name: string;
  name_en: string | null;
};

type SupporterEmbed = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type LivingAreaEmbed = {
  name_zh: string | null;
  name_en: string | null;
};

type AdopterProfileRow = {
  id: string;
  supporter_id: string | null;
  name_english: string | null;
  name_chinese: string | null;
  birthday: string | null;
  address: string | null;
  household_size: string | null;
  is_blacklisted: boolean | null;
  blacklist_reason: string | null;
  created_at: string;
  updated_at: string;
  supporter: SupporterEmbed | SupporterEmbed[] | null;
  living_area: LivingAreaEmbed | LivingAreaEmbed[] | null;
};

type AdoptionCaseRow = {
  id: string;
  supporter_id: string | null;
  adopter_profile_id: string | null;
  status_id: string;
  requested_animal_id: string | null;
  animal_type: string;
  applicant_name: string;
  applicant_phone: string;
  applicant_email: string | null;
  closed_at: string | null;
  created_at: string;
};

type FollowupRow = {
  id: string;
  adoption_case_id: string | null;
  adopter_profile_id: string | null;
  status_id: string;
  title: string;
  task_type: string;
  priority: string;
  due_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  volunteer: string | null;
  contact_channel: string | null;
  created_at: string;
  updated_at: string;
};

type SuccessfulAdoptionRow = {
  id: string;
  adoption_case_id: string;
  animal_id: string;
  supporter_id: string;
  adopter_profile_id: string;
  case_number: string;
  adoption_fee_cents: number | null;
  approval_date: string;
  pickup_date: string | null;
};

export const emptySupporterAdoptionContext: SupporterAdoptionContext = {
  profiles: [],
  cases: [],
  followups: [],
  successfulAdoptions: [],
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function single<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function displayName(row: AdopterProfileRow) {
  return [row.name_chinese, row.name_english].filter(Boolean).join(" / ") || row.supporter_id || row.id;
}

function statusFallback(id: string): SupporterAdoptionStatusSummary {
  return { key: id, labelZh: id, labelEn: id, color: "slate" };
}

function statusMap(rows: StatusRow[]) {
  return new Map(
    rows.map((row) => [
      row.id,
      {
        key: row.key,
        labelZh: row.label_zh,
        labelEn: row.label_en,
        color: row.color,
      } satisfies SupporterAdoptionStatusSummary,
    ]),
  );
}

function animalName(row: AnimalRow | undefined) {
  if (!row) return null;
  return row.name || row.name_en || row.id;
}

function dedupeById<T extends { id: string }>(rows: T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function mapProfile(row: AdopterProfileRow): SupporterAdopterProfileSummary {
  const supporter = single(row.supporter);
  const livingArea = single(row.living_area);
  return {
    id: row.id,
    displayName: displayName(row),
    email: supporter?.email ?? null,
    phone: supporter?.phone ?? null,
    livingArea: livingArea?.name_zh ?? livingArea?.name_en ?? null,
    isBlacklisted: Boolean(row.is_blacklisted),
    birthday: row.birthday,
    address: row.address,
    householdSize: row.household_size,
    blacklistReason: row.blacklist_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCase(
  row: AdoptionCaseRow,
  statuses: Map<string, SupporterAdoptionStatusSummary>,
  animals: Map<string, AnimalRow>,
): SupporterAdoptionCaseSummary {
  return {
    id: row.id,
    adopterProfileId: row.adopter_profile_id,
    applicantName: row.applicant_name,
    animalType: row.animal_type,
    status: statuses.get(row.status_id) ?? statusFallback(row.status_id),
    requestedAnimalName: row.requested_animal_id ? animalName(animals.get(row.requested_animal_id)) : null,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

function mapFollowup(
  row: FollowupRow,
  statuses: Map<string, SupporterAdoptionStatusSummary>,
): SupporterAdoptionFollowupSummary {
  return {
    id: row.id,
    adoptionCaseId: row.adoption_case_id,
    adopterProfileId: row.adopter_profile_id,
    title: row.title,
    taskType: row.task_type,
    status: statuses.get(row.status_id) ?? statusFallback(row.status_id),
    priority: row.priority as SupporterAdoptionFollowupSummary["priority"],
    dueAt: row.due_at,
    scheduledAt: row.scheduled_at,
    completedAt: row.completed_at,
    volunteer: row.volunteer,
    contactChannel: row.contact_channel as SupporterAdoptionFollowupSummary["contactChannel"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSuccessfulAdoption(
  row: SuccessfulAdoptionRow,
  animals: Map<string, AnimalRow>,
): SupporterSuccessfulAdoptionSummary {
  return {
    id: row.id,
    adoptionCaseId: row.adoption_case_id,
    adopterProfileId: row.adopter_profile_id,
    supporterId: row.supporter_id,
    caseNumber: row.case_number,
    animalId: row.animal_id,
    animalName: animalName(animals.get(row.animal_id)),
    adoptionFeeCents: row.adoption_fee_cents,
    approvalDate: row.approval_date,
    pickupDate: row.pickup_date,
  };
}
```

Below those helpers, implement `loadSupporterAdoptionContext`:

```ts
export async function loadSupporterAdoptionContext(
  client: CrmAdoptionClient,
  supporterId: string,
): Promise<SupporterAdoptionContext> {
  const profileResult = await client
    .from("adopter_profile")
    .select(
      "id,supporter_id,name_english,name_chinese,birthday,address,household_size,is_blacklisted,blacklist_reason,created_at,updated_at,supporter:supporter_id(id,name,email,phone),living_area:living_area_id(name_zh,name_en)",
    )
    .eq("supporter_id", supporterId)
    .order("updated_at", { ascending: false });
  if (profileResult.error) throw profileResult.error;

  const profiles = ((profileResult.data ?? []) as unknown as AdopterProfileRow[]).map(mapProfile);
  const profileIds = profiles.map((profile) => profile.id);

  const [casesBySupporterResult, casesByProfileResult] = await Promise.all([
    client
      .from("adoption_case")
      .select(
        "id,supporter_id,adopter_profile_id,status_id,requested_animal_id,animal_type,applicant_name,applicant_phone,applicant_email,closed_at,created_at",
      )
      .eq("supporter_id", supporterId)
      .order("created_at", { ascending: false }),
    profileIds.length
      ? client
          .from("adoption_case")
          .select(
            "id,supporter_id,adopter_profile_id,status_id,requested_animal_id,animal_type,applicant_name,applicant_phone,applicant_email,closed_at,created_at",
          )
          .in("adopter_profile_id", profileIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (casesBySupporterResult.error) throw casesBySupporterResult.error;
  if (casesByProfileResult.error) throw casesByProfileResult.error;

  const caseRows = dedupeById([
    ...((casesBySupporterResult.data ?? []) as AdoptionCaseRow[]),
    ...((casesByProfileResult.data ?? []) as AdoptionCaseRow[]),
  ]);
  const caseIds = caseRows.map((row) => row.id);

  const [followupsByCaseResult, followupsByProfileResult, successesBySupporterResult, successesByProfileResult] =
    await Promise.all([
      caseIds.length
        ? client
            .from("adoption_followup")
            .select(
              "id,adoption_case_id,adopter_profile_id,status_id,title,task_type,priority,due_at,scheduled_at,completed_at,volunteer,contact_channel,created_at,updated_at",
            )
            .in("adoption_case_id", caseIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      profileIds.length
        ? client
            .from("adoption_followup")
            .select(
              "id,adoption_case_id,adopter_profile_id,status_id,title,task_type,priority,due_at,scheduled_at,completed_at,volunteer,contact_channel,created_at,updated_at",
            )
            .in("adopter_profile_id", profileIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      client
        .from("successful_adoption")
        .select(
          "id,adoption_case_id,animal_id,supporter_id,adopter_profile_id,case_number,adoption_fee_cents,approval_date,pickup_date",
        )
        .eq("supporter_id", supporterId)
        .order("approval_date", { ascending: false }),
      profileIds.length
        ? client
            .from("successful_adoption")
            .select(
              "id,adoption_case_id,animal_id,supporter_id,adopter_profile_id,case_number,adoption_fee_cents,approval_date,pickup_date",
            )
            .in("adopter_profile_id", profileIds)
            .order("approval_date", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

  for (const result of [
    followupsByCaseResult,
    followupsByProfileResult,
    successesBySupporterResult,
    successesByProfileResult,
  ]) {
    if (result.error) throw result.error;
  }

  const followupRows = dedupeById([
    ...((followupsByCaseResult.data ?? []) as FollowupRow[]),
    ...((followupsByProfileResult.data ?? []) as FollowupRow[]),
  ]);
  const successRows = dedupeById([
    ...((successesBySupporterResult.data ?? []) as SuccessfulAdoptionRow[]),
    ...((successesByProfileResult.data ?? []) as SuccessfulAdoptionRow[]),
  ]);

  const statusIds = unique([
    ...caseRows.map((row) => row.status_id),
    ...followupRows.map((row) => row.status_id),
  ]);
  const animalIds = unique([
    ...caseRows.map((row) => row.requested_animal_id),
    ...successRows.map((row) => row.animal_id),
  ]);

  const [statusResult, animalResult] = await Promise.all([
    statusIds.length
      ? client.from("coordinator_status").select("id,key,label_zh,label_en,color").in("id", statusIds)
      : Promise.resolve({ data: [], error: null }),
    animalIds.length ? client.from("animals").select("id,name,name_en").in("id", animalIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (statusResult.error) throw statusResult.error;
  if (animalResult.error) throw animalResult.error;

  const statuses = statusMap((statusResult.data ?? []) as StatusRow[]);
  const animals = new Map(((animalResult.data ?? []) as AnimalRow[]).map((row) => [row.id, row]));

  return {
    profiles,
    cases: caseRows.map((row) => mapCase(row, statuses, animals)),
    followups: followupRows.map((row) => mapFollowup(row, statuses)),
    successfulAdoptions: successRows.map((row) => mapSuccessfulAdoption(row, animals)),
  };
}
```

- [ ] **Step 4: Wire the loader into supporter detail**

In `src/lib/crm/repository.server.ts`, add this import:

```ts
import { loadSupporterAdoptionContext } from "./adoptionContext.server";
```

Inside `getSupporterDetail`, after `auditLogs` are mapped, load adoption context:

```ts
const adoption = await loadSupporterAdoptionContext(client, id);
```

Return the context and pass it into timeline assembly:

```ts
return {
  ...summary,
  source: (supporterRow as SupporterRow).source,
  createdAt: (supporterRow as SupporterRow).created_at,
  updatedAt: (supporterRow as SupporterRow).updated_at,
  donations,
  payments,
  receipts,
  consents,
  messages,
  auditLogs,
  adoption,
  timeline: assembleSupporterTimeline({
    donations,
    payments,
    receipts,
    consents,
    messages,
    auditLogs,
    adoption,
  }),
} satisfies SupporterDetail;
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun test src/lib/crm/adoptionContext.server.test.ts src/lib/crm/timeline.test.ts
bunx tsc --noEmit --pretty false
```

Expected: all tests pass and TypeScript exits with no output.

Commit:

```bash
git add src/lib/crm/adoptionContext.server.ts src/lib/crm/adoptionContext.server.test.ts src/lib/crm/repository.server.ts src/lib/crm/types.ts src/lib/crm/timeline.ts src/lib/crm/timeline.test.ts
git commit -m "feat: enrich supporter detail with adoption context"
```

## Task 3: Timeline Filter Logic And Rendering Links

**Files:**

- Create: `src/components/admin/crm/supporterTimelineFilters.ts`
- Create: `src/components/admin/crm/supporterTimelineFilters.test.ts`
- Modify: `src/components/admin/crm/SupporterTimeline.tsx`

- [ ] **Step 1: Write failing filter tests**

Create `src/components/admin/crm/supporterTimelineFilters.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { SupporterTimelineKind } from "../../../lib/crm/types";
import { filterTimelineItems, timelineFilterOptions, type TimelineFilter } from "./supporterTimelineFilters";

function item(kind: SupporterTimelineKind) {
  return {
    id: kind,
    at: "2026-06-01T10:00:00.000Z",
    kind,
    title: kind,
    description: kind,
  };
}

describe("supporter timeline filters", () => {
  test("groups timeline kinds into staff-facing filter buckets", () => {
    const items = [
      item("donation"),
      item("payment"),
      item("receipt"),
      item("consent"),
      item("message"),
      item("adoption_case"),
      item("successful_adoption"),
      item("adoption_followup"),
      item("audit"),
    ];

    const idsByFilter = Object.fromEntries(
      (["all", "donations", "receipts", "communication", "adoption", "followups", "system"] satisfies TimelineFilter[]).map(
        (filter) => [filter, filterTimelineItems(items, filter).map((row) => row.kind)],
      ),
    );

    expect(idsByFilter.all).toHaveLength(9);
    expect(idsByFilter.donations).toEqual(["donation", "payment"]);
    expect(idsByFilter.receipts).toEqual(["receipt"]);
    expect(idsByFilter.communication).toEqual(["consent", "message"]);
    expect(idsByFilter.adoption).toEqual(["adoption_case", "successful_adoption"]);
    expect(idsByFilter.followups).toEqual(["adoption_followup"]);
    expect(idsByFilter.system).toEqual(["audit"]);
  });

  test("keeps a stable option order for the segmented control", () => {
    expect(timelineFilterOptions.map((option) => option.id)).toEqual([
      "all",
      "donations",
      "receipts",
      "communication",
      "adoption",
      "followups",
      "system",
    ]);
  });
});
```

- [ ] **Step 2: Run the filter tests and verify failure**

Run:

```bash
bun test src/components/admin/crm/supporterTimelineFilters.test.ts
```

Expected: failure because `supporterTimelineFilters.ts` does not exist yet.

- [ ] **Step 3: Implement the filter helper**

Create `src/components/admin/crm/supporterTimelineFilters.ts`:

```ts
import type { SupporterTimelineItem, SupporterTimelineKind } from "../../../lib/crm/types";

export const timelineFilterOptions = [
  { id: "all", labelKey: "all" },
  { id: "donations", labelKey: "donations" },
  { id: "receipts", labelKey: "receipts" },
  { id: "communication", labelKey: "communication" },
  { id: "adoption", labelKey: "adoption" },
  { id: "followups", labelKey: "followups" },
  { id: "system", labelKey: "system" },
] as const;

export type TimelineFilter = (typeof timelineFilterOptions)[number]["id"];

const filterKinds: Record<Exclude<TimelineFilter, "all">, SupporterTimelineKind[]> = {
  donations: ["donation", "payment"],
  receipts: ["receipt"],
  communication: ["consent", "message"],
  adoption: ["adoption_case", "successful_adoption"],
  followups: ["adoption_followup"],
  system: ["audit"],
};

export function filterTimelineItems(
  items: SupporterTimelineItem[],
  filter: TimelineFilter,
): SupporterTimelineItem[] {
  if (filter === "all") return items;
  const allowedKinds = new Set(filterKinds[filter]);
  return items.filter((item) => allowedKinds.has(item.kind));
}
```

- [ ] **Step 4: Render optional timeline links**

In `src/components/admin/crm/SupporterTimeline.tsx`, import `Link`:

```ts
import { Link } from "@tanstack/react-router";
```

Inside the timeline item header, replace the title `<p>` with a link-aware title:

```tsx
{item.link ? (
  <Link
    to={item.link.to}
    params={item.link.params}
    className="font-semibold text-[var(--color-primary)] hover:underline"
  >
    {item.title}
  </Link>
) : (
  <p className="font-semibold text-[var(--color-panel)]">{item.title}</p>
)}
```

Add new timeline copy labels in `TIMELINE_COPY`:

```ts
adoption_case: "領養個案",
adoption_followup: "跟進",
successful_adoption: "成功領養",
message: "訊息",
audit: "系統紀錄",
```

and the English labels:

```ts
adoption_case: "Adoption case",
adoption_followup: "Follow-up",
successful_adoption: "Successful adoption",
message: "Message",
audit: "System record",
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun test src/components/admin/crm/supporterTimelineFilters.test.ts src/lib/crm/timeline.test.ts
```

Expected: both test files pass.

Commit:

```bash
git add src/components/admin/crm/supporterTimelineFilters.ts src/components/admin/crm/supporterTimelineFilters.test.ts src/components/admin/crm/SupporterTimeline.tsx
git commit -m "feat: add supporter timeline filters"
```

## Task 4: Sidebar And Activity Workspace UI

**Files:**

- Create: `src/components/admin/crm/SupporterProfileSidebar.tsx`
- Create: `src/components/admin/crm/SupporterActivitySummary.tsx`
- Create: `src/components/admin/crm/SupporterTimelineFilters.tsx`
- Modify: `src/components/admin/crm/SupporterDetail.tsx`

- [ ] **Step 1: Create presentational component tests**

Create `src/components/admin/crm/SupporterProfileSidebar.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { SupporterDetail } from "../../../lib/crm/types";
import { SupporterProfileSidebar } from "./SupporterProfileSidebar";

function supporter(overrides: Partial<SupporterDetail> = {}): SupporterDetail {
  return {
    id: "supporter-1",
    name: "Ada",
    email: "ada@example.com",
    phone: "9123 4567",
    language: "zh-HK",
    tags: ["demo"],
    roles: ["adopter", "volunteer"],
    deletedAt: null,
    lastGiftAt: null,
    lastGiftAmountCents: null,
    lifetimeAmountCents: 0,
    donationCount: 0,
    receiptNeeded: false,
    emailConsent: "opt_in",
    whatsappConsent: "opt_out",
    source: "admin",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T10:00:00.000Z",
    donations: [],
    payments: [],
    receipts: [],
    consents: [],
    messages: [],
    auditLogs: [],
    timeline: [],
    adoption: {
      profiles: [
        {
          id: "profile-1",
          displayName: "黃雅達 / Ada Wong",
          email: "ada@example.com",
          phone: "9123 4567",
          livingArea: "香港島",
          isBlacklisted: false,
          birthday: "1990-01-01",
          address: "HK Island",
          householdSize: "3",
          blacklistReason: null,
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-02T10:00:00.000Z",
        },
      ],
      cases: [],
      followups: [],
      successfulAdoptions: [],
    },
    ...overrides,
  };
}

describe("SupporterProfileSidebar", () => {
  test("renders contact, consent, roles, and linked adopter profile", () => {
    const markup = renderToStaticMarkup(
      <SupporterProfileSidebar
        supporter={supporter()}
        language="zh"
        roleLabels={{ donor: "捐款人", adopter: "領養人", volunteer: "義工", foster: "暫托" }}
      />,
    );

    expect(markup).toContain("Ada");
    expect(markup).toContain("ada@example.com");
    expect(markup).toContain("領養人");
    expect(markup).toContain("義工");
    expect(markup).toContain("黃雅達 / Ada Wong");
    expect(markup).toContain("香港島");
  });

  test("renders quiet empty adoption text when no profile is linked", () => {
    const markup = renderToStaticMarkup(
      <SupporterProfileSidebar
        supporter={supporter({ adoption: { profiles: [], cases: [], followups: [], successfulAdoptions: [] } })}
        language="en"
        roleLabels={{ donor: "Donor", adopter: "Adopter", volunteer: "Volunteer", foster: "Foster" }}
      />,
    );

    expect(markup).toContain("No linked adoption history.");
  });
});
```

Create `src/components/admin/crm/SupporterActivitySummary.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SupporterActivitySummary } from "./SupporterActivitySummary";

describe("SupporterActivitySummary", () => {
  test("renders CRM and adoption counters", () => {
    const markup = renderToStaticMarkup(
      <SupporterActivitySummary
        language="en"
        lifetimeAmountCents={123400}
        donationCount={4}
        receiptCount={2}
        pendingPaymentCount={1}
        adoptionCaseCount={3}
        openFollowupCount={2}
        successfulAdoptionCount={1}
      />,
    );

    expect(markup).toContain("HK$1,234");
    expect(markup).toContain("Donations");
    expect(markup).toContain("Open follow-ups");
    expect(markup).toContain("Successful adoptions");
  });
});
```

- [ ] **Step 2: Run component tests and verify failure**

Run:

```bash
bun test src/components/admin/crm/SupporterProfileSidebar.test.tsx src/components/admin/crm/SupporterActivitySummary.test.tsx
```

Expected: failure because the new components do not exist yet.

- [ ] **Step 3: Implement `SupporterProfileSidebar`**

Create `src/components/admin/crm/SupporterProfileSidebar.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { Mail, Phone } from "lucide-react";

import type { SupporterDetail, SupporterRole } from "../../../lib/crm/types";
import { formatAdminDateTime } from "../adminPageCopy";

type SupporterProfileSidebarProps = {
  supporter: SupporterDetail;
  language: "zh" | "en";
  roleLabels: Record<SupporterRole, string>;
};

const COPY = {
  zh: {
    contact: "聯絡資料",
    consent: "通訊同意",
    email: "電郵",
    whatsapp: "WhatsApp",
    record: "紀錄",
    source: "來源",
    created: "建立",
    updated: "更新",
    linkedAdoption: "領養資料",
    noAdoption: "未有相關領養紀錄。",
    livingArea: "居住地區",
    birthday: "生日",
    householdSize: "家庭人數",
    address: "地址",
    blacklist: "黑名單",
    clear: "正常",
    openAdopter: "開啟領養人檔案",
    otherProfiles: "其他領養人檔案",
  },
  en: {
    contact: "Contact",
    consent: "Communication consent",
    email: "Email",
    whatsapp: "WhatsApp",
    record: "Record",
    source: "Source",
    created: "Created",
    updated: "Updated",
    linkedAdoption: "Adoption profile",
    noAdoption: "No linked adoption history.",
    livingArea: "Living area",
    birthday: "Birthday",
    householdSize: "Household size",
    address: "Address",
    blacklist: "Blacklist",
    clear: "Clear",
    openAdopter: "Open adopter profile",
    otherProfiles: "Other adopter profiles",
  },
} as const;

function fallback(value: string | null | undefined) {
  return value?.trim() || "-";
}

function consentLabel(value: SupporterDetail["emailConsent"]) {
  if (value === "opt_in") return "opt-in";
  if (value === "opt_out") return "opt-out";
  return "-";
}

function field(label: string, value: string | null | undefined) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-[var(--color-panel)]">{fallback(value)}</dd>
    </div>
  );
}

export function SupporterProfileSidebar({
  supporter,
  language,
  roleLabels,
}: SupporterProfileSidebarProps) {
  const copy = COPY[language];
  const [primaryProfile, ...otherProfiles] = [...supporter.adoption.profiles].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );

  return (
    <aside className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 xl:sticky xl:top-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-panel)]">{supporter.name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {supporter.roles.map((role) => (
            <span
              key={role}
              className="rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--color-panel)]"
            >
              {roleLabels[role]}
            </span>
          ))}
          {supporter.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-[var(--color-panel)]">{copy.contact}</h2>
        <div className="mt-3 space-y-2 text-sm text-[var(--color-text-muted)]">
          <p className="inline-flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {supporter.email}
          </p>
          <p className="inline-flex items-center gap-2">
            <Phone className="h-4 w-4" />
            {fallback(supporter.phone)}
          </p>
          <p>{supporter.language}</p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-[var(--color-panel)]">{copy.consent}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          {field(copy.email, consentLabel(supporter.emailConsent))}
          {field(copy.whatsapp, consentLabel(supporter.whatsappConsent))}
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-[var(--color-panel)]">{copy.linkedAdoption}</h2>
        {primaryProfile ? (
          <div className="mt-3 space-y-3">
            <div>
              <Link
                to="/admin/coordinator/adopters/$id"
                params={{ id: primaryProfile.id }}
                className="font-semibold text-[var(--color-primary)] hover:underline"
              >
                {primaryProfile.displayName}
              </Link>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{copy.openAdopter}</p>
            </div>
            <dl className="grid gap-3">
              {field(copy.livingArea, primaryProfile.livingArea)}
              {field(copy.birthday, primaryProfile.birthday)}
              {field(copy.householdSize, primaryProfile.householdSize)}
              {field(copy.address, primaryProfile.address)}
              {field(
                copy.blacklist,
                primaryProfile.isBlacklisted ? primaryProfile.blacklistReason || copy.blacklist : copy.clear,
              )}
            </dl>
            {otherProfiles.length > 0 && (
              <div className="border-t border-[var(--color-border)] pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  {copy.otherProfiles}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {otherProfiles.map((profile) => (
                    <Link
                      key={profile.id}
                      to="/admin/coordinator/adopters/$id"
                      params={{ id: profile.id }}
                      className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-primary)] hover:underline"
                    >
                      {profile.displayName}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">{copy.noAdoption}</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-[var(--color-panel)]">{copy.record}</h2>
        <dl className="mt-3 grid gap-3">
          {field(copy.source, supporter.source)}
          {field(copy.created, formatAdminDateTime(supporter.createdAt, language))}
          {field(copy.updated, formatAdminDateTime(supporter.updatedAt, language))}
        </dl>
      </section>
    </aside>
  );
}
```

- [ ] **Step 4: Implement `SupporterActivitySummary`**

Create `src/components/admin/crm/SupporterActivitySummary.tsx`:

```tsx
import { formatAdminNumber } from "../adminPageCopy";

type SupporterActivitySummaryProps = {
  language: "zh" | "en";
  lifetimeAmountCents: number;
  donationCount: number;
  receiptCount: number;
  pendingPaymentCount: number;
  adoptionCaseCount: number;
  openFollowupCount: number;
  successfulAdoptionCount: number;
};

const COPY = {
  zh: {
    lifetime: "累計捐款",
    donations: "捐款",
    receipts: "收據",
    pendingPayments: "待處理付款",
    adoptionCases: "領養個案",
    openFollowups: "未完成跟進",
    successfulAdoptions: "成功領養",
  },
  en: {
    lifetime: "Lifetime",
    donations: "Donations",
    receipts: "Receipts",
    pendingPayments: "Pending payments",
    adoptionCases: "Adoption cases",
    openFollowups: "Open follow-ups",
    successfulAdoptions: "Successful adoptions",
  },
} as const;

function formatHkd(amountCents: number, language: "zh" | "en") {
  return new Intl.NumberFormat(language === "zh" ? "zh-HK" : "en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

export function SupporterActivitySummary(props: SupporterActivitySummaryProps) {
  const copy = COPY[props.language];
  const rows = [
    [copy.lifetime, formatHkd(props.lifetimeAmountCents, props.language)],
    [copy.donations, formatAdminNumber(props.donationCount, props.language)],
    [copy.receipts, formatAdminNumber(props.receiptCount, props.language)],
    [copy.pendingPayments, formatAdminNumber(props.pendingPaymentCount, props.language)],
    [copy.adoptionCases, formatAdminNumber(props.adoptionCaseCount, props.language)],
    [copy.openFollowups, formatAdminNumber(props.openFollowupCount, props.language)],
    [copy.successfulAdoptions, formatAdminNumber(props.successfulAdoptionCount, props.language)],
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            {label}
          </p>
          <p className="mt-2 text-xl font-bold text-[var(--color-panel)]">{value}</p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Implement `SupporterTimelineFilters`**

Create `src/components/admin/crm/SupporterTimelineFilters.tsx`:

```tsx
import type { TimelineFilter } from "./supporterTimelineFilters";
import { timelineFilterOptions } from "./supporterTimelineFilters";

type SupporterTimelineFiltersProps = {
  language: "zh" | "en";
  value: TimelineFilter;
  onChange: (value: TimelineFilter) => void;
};

const LABELS = {
  zh: {
    all: "全部",
    donations: "捐款",
    receipts: "收據",
    communication: "通訊",
    adoption: "領養",
    followups: "跟進",
    system: "系統紀錄",
  },
  en: {
    all: "All",
    donations: "Donations",
    receipts: "Receipts",
    communication: "Communication",
    adoption: "Adoption",
    followups: "Follow-ups",
    system: "System",
  },
} as const;

export function SupporterTimelineFilters({
  language,
  value,
  onChange,
}: SupporterTimelineFiltersProps) {
  const labels = LABELS[language];

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={labels.all}>
      {timelineFilterOptions.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={
              active
                ? "rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-panel)]"
            }
          >
            {labels[option.labelKey]}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Refactor `SupporterDetail` into sidebar/workspace**

In `src/components/admin/crm/SupporterDetail.tsx`:

1. Import `useState`, new components, and timeline filter helpers:

```ts
import { useState } from "react";
import { SupporterActivitySummary } from "./SupporterActivitySummary";
import { SupporterProfileSidebar } from "./SupporterProfileSidebar";
import { SupporterTimelineFilters } from "./SupporterTimelineFilters";
import { filterTimelineItems, type TimelineFilter } from "./supporterTimelineFilters";
```

2. Remove the old header card and summary array rendering.

3. Add filter state after mutation declarations:

```ts
const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
```

4. After data is loaded, derive open followups and filtered timeline without adding a hook below the existing loading/error returns:

```ts
const pendingPayments = data.payments.filter((payment) => payment.status === "pending").length;
const openFollowups = data.adoption.followups.filter((followup) => !followup.completedAt).length;
const filteredTimeline = filterTimelineItems(data.timeline, timelineFilter);
```

5. Replace the root content after the back/actions row with:

```tsx
<div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
  <SupporterProfileSidebar supporter={data} language={language} roleLabels={roleLabels} />
  <div className="space-y-6">
    <SupporterActivitySummary
      language={language}
      lifetimeAmountCents={data.lifetimeAmountCents}
      donationCount={data.donationCount}
      receiptCount={data.receipts.length}
      pendingPaymentCount={pendingPayments}
      adoptionCaseCount={data.adoption.cases.length}
      openFollowupCount={openFollowups}
      successfulAdoptionCount={data.adoption.successfulAdoptions.length}
    />

    <ConsentEditor
      supporterId={supporterId}
      emailConsent={data.emailConsent}
      whatsappConsent={data.whatsappConsent}
    />

    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">{copy.timeline}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.timelineSubtitle}</p>
        </div>
        <SupporterTimelineFilters
          language={language}
          value={timelineFilter}
          onChange={setTimelineFilter}
        />
      </div>
      <SupporterTimeline items={filteredTimeline} />
    </section>

    {/* Keep the existing donation section here unchanged. */}
    {/* Keep the existing receipt section here unchanged. */}
  </div>
</div>
```

When applying this step, move the existing donation and receipt section JSX into the marked positions. Do not change receipt action conditions in this task.

- [ ] **Step 7: Run component tests and commit**

Run:

```bash
bun test src/components/admin/crm/SupporterProfileSidebar.test.tsx src/components/admin/crm/SupporterActivitySummary.test.tsx src/components/admin/crm/supporterTimelineFilters.test.ts
bunx tsc --noEmit --pretty false
```

Expected: tests pass and TypeScript exits with no output.

Commit:

```bash
git add src/components/admin/crm/SupporterProfileSidebar.tsx src/components/admin/crm/SupporterProfileSidebar.test.tsx src/components/admin/crm/SupporterActivitySummary.tsx src/components/admin/crm/SupporterActivitySummary.test.tsx src/components/admin/crm/SupporterTimelineFilters.tsx src/components/admin/crm/SupporterDetail.tsx src/components/admin/crm/supporterTimelineFilters.ts src/components/admin/crm/supporterTimelineFilters.test.ts
git commit -m "feat: redesign supporter detail workspace"
```

## Task 5: Verification, Polish, And PR Update

**Files:**

- Modify only files touched by earlier tasks if verification finds a defect.

- [ ] **Step 1: Run focused regression tests**

Run:

```bash
bun test src/lib/crm/timeline.test.ts src/lib/crm/adoptionContext.server.test.ts src/components/admin/crm/supporterTimelineFilters.test.ts src/components/admin/crm/SupporterProfileSidebar.test.tsx src/components/admin/crm/SupporterActivitySummary.test.tsx src/lib/crm/service.test.ts src/lib/crm/schemas.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 2: Run lint and typecheck**

Run:

```bash
bun run lint
bunx tsc --noEmit --pretty false
```

Expected: lint exits `0` with only existing Fast Refresh warnings if they still appear; TypeScript exits with no output.

- [ ] **Step 3: Try a production build**

Run:

```bash
bun run build
```

Expected: build exits `0`. If the local Vite build hangs because of unrelated machine load again, interrupt it, record the exact behavior, and do not claim build success.

- [ ] **Step 4: Optional browser smoke check**

Run the dev server:

```bash
bun run dev
```

Open `/admin/supporters/$id` with a seeded supporter id that has adoption data. Verify:

- Contact/profile sidebar appears above the workspace on mobile and to the left on desktop.
- Role and tag chips do not overflow.
- Adoption empty state appears for donor-only supporters.
- Timeline filters change visible events without page reload.
- Donation and receipt action sections still render.

Stop the dev server after the smoke check.

- [ ] **Step 5: Commit final polish if needed**

If Step 1-4 required fixes, commit them:

```bash
git add src/lib/crm src/components/admin/crm
git commit -m "fix: polish supporter detail adoption workspace"
```

If no fixes were needed, do not create an empty commit.

- [ ] **Step 6: Push branch and update the draft PR**

Run:

```bash
git status -sb
git push
gh pr view 27 --json url,isDraft,headRefName,baseRefName
```

Expected:

- `git status -sb` shows only intentional untracked local files such as `AGENTS.md`.
- `git push` updates `origin/codex/admin-supporter-role-fixes`.
- The existing draft PR is still `https://github.com/YNWAforever/hkscda/pull/27`.

Update the PR description with the implementation summary and verification results:

```bash
gh pr edit 27 --body-file /tmp/supporter-detail-pr-body.md
```

Use this body, editing only the verification lines to match actual command output:

```md
## Summary
- make the admin CRM supporter list and detail flow role-aware across donors, adopters, volunteers, and fosters
- add a balanced supporter detail workspace with contact sidebar, activity counters, timeline filters, and linked adoption context
- enrich `GET /api/admin/supporters/:id` with read-only adopter profile, case, follow-up, and successful adoption summaries
- keep donation, receipt, consent, and manual donation workflows available from supporter detail

## Verification
- `bun test src/lib/crm/timeline.test.ts src/lib/crm/adoptionContext.server.test.ts src/components/admin/crm/supporterTimelineFilters.test.ts src/components/admin/crm/SupporterProfileSidebar.test.tsx src/components/admin/crm/SupporterActivitySummary.test.tsx src/lib/crm/service.test.ts src/lib/crm/schemas.test.ts`
- `bun run lint`
- `bunx tsc --noEmit --pretty false`
- `bun run build`
```
