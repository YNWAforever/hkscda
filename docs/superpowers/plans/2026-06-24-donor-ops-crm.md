# Donor Ops CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first donor-operations CRM slice so treasurer/admin users can find supporters, review giving history, manage consent, enter offline gifts, issue receipts, and export audited CSVs.

**Architecture:** Keep the Phase 2 donations MVP as the source of truth and add a focused `src/lib/crm/` layer for validation, timeline assembly, CSV output, manual donation orchestration, and Supabase repository functions. Add role-gated TanStack Start server routes under `/api/admin`, then build `/admin/supporters` routes with small admin CRM components while leaving animal and adoption admin screens intact.

**Tech Stack:** TypeScript 5, TanStack Start file routes, React 19, TanStack Query, Supabase Auth/Postgres/Storage via `@supabase/supabase-js`, Zod, Tailwind CSS v4 tokens, shadcn/ui primitives, Bun test runner.

---

## File Map

### Create

```txt
src/lib/crm/types.ts                         - Shared CRM row/input/output types.
src/lib/crm/schemas.ts                       - Zod schemas for search, supporter edits, consents, manual gifts, and exports.
src/lib/crm/schemas.test.ts                  - Validation and normalization tests.
src/lib/crm/consent.ts                       - Latest-consent derivation from append-only rows.
src/lib/crm/consent.test.ts                  - Latest consent tests.
src/lib/crm/timeline.ts                      - Supporter timeline assembly from donations, payments, receipts, consents, messages, and audit rows.
src/lib/crm/timeline.test.ts                 - Timeline ordering and label tests.
src/lib/crm/csv.ts                           - CSV escaping and export builders.
src/lib/crm/csv.test.ts                      - CSV column and escaping tests.
src/lib/crm/manualDonation.ts                - Pure manual donation record builder.
src/lib/crm/manualDonation.test.ts           - Manual donation validation and insert-shape tests.
src/lib/crm/service.ts                       - CRM use cases backed by a repository interface.
src/lib/crm/service.test.ts                  - Dedupe, consent append, manual gift, and export audit tests with a fake repository.
src/lib/crm/repository.server.ts             - Supabase-backed CRM repository.
src/lib/crm/http.server.ts                   - Role-gated route handlers for easier route tests.
src/lib/crm/http.test.ts                     - Integration-style request tests with fake auth/repository dependencies.
src/components/admin/crm/api.ts              - Browser-side authenticated admin fetch helper.
src/components/admin/crm/SupporterList.tsx   - Search/filter table and pagination.
src/components/admin/crm/SupporterDetail.tsx - Profile header, summaries, sections, and actions.
src/components/admin/crm/SupporterTimeline.tsx - Timeline rendering.
src/components/admin/crm/ConsentEditor.tsx   - Append-only consent editor.
src/components/admin/crm/SupporterFormDialog.tsx - Manual supporter create/edit fields.
src/components/admin/crm/ManualDonationDialog.tsx - Manual/offline gift entry.
src/components/admin/crm/ExportBar.tsx       - Supporter/donation CSV export controls.
src/routes/admin/supporters.tsx              - `/admin/supporters` list page.
src/routes/admin/supporters/$id.tsx          - `/admin/supporters/$id` detail page.
src/routes/api/admin/supporters.ts           - `GET` list and `POST` manual supporter entry.
src/routes/api/admin/supporters/$id.ts       - `GET` detail and `PATCH` donor ops fields.
src/routes/api/admin/supporters/$id/consents.ts - `POST` append consent changes.
src/routes/api/admin/donations/manual.ts     - `POST` manual/offline donation entry.
src/routes/api/admin/exports/supporters[.]csv.ts - `GET /api/admin/exports/supporters.csv`.
src/routes/api/admin/exports/donations[.]csv.ts  - `GET /api/admin/exports/donations.csv`.
src/routes/api/admin/receipts/$id/void.ts     - `POST` void issued receipt.
supabase/migrations/*_donor_ops_crm_foundation.sql - CLI-generated migration for CRM indexes.
```

### Modify

```txt
src/components/admin/AdminLayout.tsx          - Add Supporters nav item and support route-style active section.
src/routes/admin/index.tsx                   - Keep existing section dashboard, add link to supporter workspace from payments header.
src/routes/api/admin/receipts.ts             - Accept optional `supporterId` context and keep existing issue behavior.
src/lib/donations/reconcile.server.ts        - Add `voidReceipt` helper for issued receipts.
```

## Ground Rules

- Use `requireAdmin(request, ["treasurer", "admin"], client)` for every donor-ops API in this slice. Existing animal/application admin behavior remains unchanged.
- Keep public writes out of the browser. CRM writes go through server routes with the Supabase service client after Supabase Auth role checks.
- Money stays integer HKD cents.
- Consent edits insert new `consent` rows. They never update or delete old consent rows.
- Manual gift flows must parse and normalize the whole request before the first repository write.
- CSV exports must log `audit_log` rows with actor, entity, filters, row count, and timestamp.
- Do not edit `src/components/ui/` manually. Use existing shadcn/ui primitives.
- TanStack literal-dot routes use bracket escaping. The local docs show `routes/my-script[.]js.ts` maps to `/my-script.js`, so use `supporters[.]csv.ts` and `donations[.]csv.ts`.
- Supabase CLI guidance: create the migration with `supabase migration new donor_ops_crm_foundation` during implementation, then paste the SQL from Task 1 into the generated file. Do not guess the timestamped filename while executing.
- Supabase changelog note for 2026: public schema objects may need explicit grants for Data API exposure. This slice adds indexes only; if implementation adds new tables/functions reachable through `supabase-js`, include explicit grants and keep RLS enabled.

---

## Task 1: CRM Migration And Query Indexes

**Files:**

- Create: Supabase CLI-generated `supabase/migrations/*_donor_ops_crm_foundation.sql`

- [ ] **Step 1: Check Supabase CLI command shape**

Run:

```bash
supabase --help
supabase migration --help
supabase migration new --help
```

Expected: help output confirms `supabase migration new <name>` is available.

- [ ] **Step 2: Create the migration file**

Run:

```bash
supabase migration new donor_ops_crm_foundation
```

Expected: one new file appears under `supabase/migrations/` with a name ending in `_donor_ops_crm_foundation.sql`.

- [ ] **Step 3: Add the CRM index SQL**

Paste this SQL into the generated migration file:

```sql
create extension if not exists pg_trgm;

create index if not exists supporter_active_email_lower_idx
  on public.supporter (lower(email::text))
  where deleted_at is null;

create index if not exists supporter_active_name_trgm_idx
  on public.supporter using gin (name gin_trgm_ops)
  where deleted_at is null;

create index if not exists supporter_active_phone_trgm_idx
  on public.supporter using gin (coalesce(phone, '') gin_trgm_ops)
  where deleted_at is null;

create index if not exists supporter_tags_gin_idx
  on public.supporter using gin (tags);

create index if not exists supporter_deleted_at_idx
  on public.supporter (deleted_at);

create index if not exists supporter_role_role_supporter_idx
  on public.supporter_role (role, supporter_id);

create index if not exists consent_supporter_channel_timestamp_idx
  on public.consent (supporter_id, channel, timestamp desc);

create index if not exists donation_supporter_created_idx
  on public.donation (supporter_id, created_at desc);

create index if not exists donation_purpose_created_idx
  on public.donation (purpose, created_at desc);

create index if not exists donation_status_receipt_created_idx
  on public.donation (status, receipt_requested, created_at desc);

create index if not exists payment_donation_status_created_idx
  on public.payment (donation_id, status, created_at desc);

create index if not exists payment_bank_reference_idx
  on public.payment (bank_reference)
  where bank_reference is not null;

create index if not exists receipt_supporter_status_issued_idx
  on public.receipt (supporter_id, status, issued_at desc);

create index if not exists message_supporter_created_idx
  on public.message (supporter_id, created_at desc);

create index if not exists audit_entity_created_idx
  on public.audit_log (entity, entity_id, created_at desc);

create index if not exists audit_action_timestamp_idx
  on public.audit_log (action, timestamp desc);
```

- [ ] **Step 4: Verify local migration list**

Run:

```bash
supabase migration list --local
```

Expected: the new `donor_ops_crm_foundation` migration appears after `phase_2_donations_mvp`.

- [ ] **Step 5: Commit**

Run:

```bash
git add supabase/migrations
git commit -m "feat: add donor ops crm indexes"
```

Expected: commit succeeds with only the new migration file staged.

---

## Task 2: CRM Schemas And Types

**Files:**

- Create: `src/lib/crm/types.ts`
- Create: `src/lib/crm/schemas.ts`
- Create: `src/lib/crm/schemas.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `src/lib/crm/schemas.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  consentUpdateSchema,
  exportSearchSchema,
  manualDonationSchema,
  supporterSearchSchema,
  supporterUpdateSchema,
} from "./schemas";

describe("crm schemas", () => {
  test("normalizes supporter search params", () => {
    const parsed = supporterSearchSchema.parse({
      q: "  Ada  ",
      page: "2",
      pageSize: "50",
      role: "donor",
      receiptNeeded: "true",
      includeDeleted: "false",
    });

    expect(parsed).toEqual({
      q: "Ada",
      page: 2,
      pageSize: 50,
      role: "donor",
      tag: undefined,
      consentChannel: undefined,
      consentStatus: undefined,
      receiptNeeded: true,
      purpose: undefined,
      includeDeleted: false,
    });
  });

  test("rejects unsupported manual donation method", () => {
    expect(() =>
      manualDonationSchema.parse({
        supporter: { name: "Ada", email: "ada@example.com", language: "zh-HK" },
        amountCents: 10000,
        currency: "HKD",
        purpose: "medical",
        method: "stripe",
        paymentStatus: "succeeded",
        bankReference: "FPS-123",
        receiptRequested: true,
        consents: { email: true, whatsapp: false },
      }),
    ).toThrow();
  });

  test("requires bank reference when manual donation is immediately succeeded", () => {
    expect(() =>
      manualDonationSchema.parse({
        supporter: { name: "Ada", email: "ada@example.com", language: "zh-HK" },
        amountCents: 10000,
        currency: "HKD",
        purpose: "general",
        method: "manual",
        paymentStatus: "succeeded",
        receiptRequested: true,
        consents: { email: true, whatsapp: true },
      }),
    ).toThrow("bankReference");
  });

  test("normalizes supporter updates", () => {
    const parsed = supporterUpdateSchema.parse({
      name: "  Ada Wong  ",
      phone: "  9123 4567 ",
      language: "en",
      tags: [" major donor ", "", "medical"],
      deleted: false,
    });

    expect(parsed).toEqual({
      name: "Ada Wong",
      phone: "9123 4567",
      language: "en",
      tags: ["major donor", "medical"],
      deleted: false,
    });
  });

  test("accepts partial channel consent updates", () => {
    const parsed = consentUpdateSchema.parse({
      source: "phone_call",
      email: true,
      whatsapp: false,
      timestamp: "2026-06-24T09:00:00.000Z",
    });

    expect(parsed.source).toBe("phone_call");
    expect(parsed.email).toBe(true);
    expect(parsed.whatsapp).toBe(false);
  });

  test("normalizes export filters with default scope", () => {
    const parsed = exportSearchSchema.parse({
      q: " receipt ",
      purpose: "sponsor",
    });

    expect(parsed.q).toBe("receipt");
    expect(parsed.purpose).toBe("sponsor");
    expect(parsed.includeDeleted).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test src/lib/crm/schemas.test.ts
```

Expected: FAIL because `src/lib/crm/schemas.ts` does not exist.

- [ ] **Step 3: Create CRM types**

Create `src/lib/crm/types.ts`:

```ts
export const crmLanguages = ["zh-HK", "en"] as const;
export const supporterRoles = ["donor", "adopter", "volunteer", "foster"] as const;
export const consentChannels = ["email", "whatsapp"] as const;
export const consentStatuses = ["opt_in", "opt_out"] as const;
export const donationPurposes = ["general", "medical", "sponsor"] as const;
export const manualDonationMethods = ["manual", "fps", "payme"] as const;
export const paymentStatuses = ["pending", "succeeded"] as const;

export type CrmLanguage = (typeof crmLanguages)[number];
export type SupporterRole = (typeof supporterRoles)[number];
export type ConsentChannel = (typeof consentChannels)[number];
export type ConsentStatus = (typeof consentStatuses)[number];
export type DonationPurpose = (typeof donationPurposes)[number];
export type ManualDonationMethod = (typeof manualDonationMethods)[number];
export type ManualPaymentStatus = (typeof paymentStatuses)[number];

export type SupporterSummary = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  language: CrmLanguage;
  tags: string[];
  roles: SupporterRole[];
  deletedAt: string | null;
  lastGiftAt: string | null;
  lastGiftAmountCents: number | null;
  lifetimeAmountCents: number;
  donationCount: number;
  receiptNeeded: boolean;
  emailConsent: ConsentStatus | null;
  whatsappConsent: ConsentStatus | null;
};

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
  timeline: SupporterTimelineItem[];
};

export type DonationHistoryRow = {
  id: string;
  amountCents: number;
  currency: "HKD";
  purpose: DonationPurpose;
  status: "pending" | "succeeded" | "failed" | "refunded";
  method: "stripe" | "paypal" | "fps" | "payme" | "manual";
  receiptRequested: boolean;
  createdAt: string;
};

export type PaymentHistoryRow = {
  id: string;
  donationId: string;
  provider: "stripe" | "paypal" | "fps" | "payme" | "manual";
  providerRef: string | null;
  amountCents: number;
  status: "pending" | "succeeded" | "failed" | "refunded";
  receivedAt: string | null;
  bankReference: string | null;
  createdAt: string;
};

export type ReceiptHistoryRow = {
  id: string;
  receiptNo: string;
  donationIds: string[];
  totalAmountCents: number;
  issuedAt: string;
  status: "issued" | "void";
  pdfUrl: string | null;
};

export type ConsentHistoryRow = {
  id: string;
  supporterId: string;
  channel: ConsentChannel;
  status: ConsentStatus;
  source: string;
  timestamp: string;
};

export type MessageHistoryRow = {
  id: string;
  channel: ConsentChannel;
  status: "queued" | "sent" | "delivered" | "failed";
  payload: Record<string, unknown>;
  sentAt: string | null;
  createdAt: string;
};

export type AuditHistoryRow = {
  id: string;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  detail: Record<string, unknown>;
};

export type SupporterTimelineItem = {
  id: string;
  at: string;
  kind: "donation" | "payment" | "receipt" | "consent" | "message" | "audit";
  title: string;
  description: string;
  amountCents?: number;
  status?: string;
};
```

- [ ] **Step 4: Create CRM schemas**

Create `src/lib/crm/schemas.ts`:

```ts
import { z } from "zod";

import {
  consentChannels,
  consentStatuses,
  crmLanguages,
  donationPurposes,
  manualDonationMethods,
  paymentStatuses,
  supporterRoles,
} from "./types";

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const booleanSearch = z
  .preprocess((value) => {
    if (value === true) return "true";
    if (value === false) return "false";
    return value;
  }, z.enum(["true", "false"]).optional())
  .transform((value) => (value === undefined ? undefined : value === "true"));

const pageNumber = z.coerce.number().int().min(1).catch(1);
const pageSize = z.coerce.number().int().min(1).max(100).catch(25);

const normalizedTags = z
  .array(z.string())
  .optional()
  .default([])
  .transform((tags) =>
    [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))],
  );

const supporterSearchObject = z.object({
  q: optionalTrimmed,
  page: pageNumber,
  pageSize,
  role: z.enum(supporterRoles).optional(),
  tag: optionalTrimmed,
  consentChannel: z.enum(consentChannels).optional(),
  consentStatus: z.enum(consentStatuses).optional(),
  receiptNeeded: booleanSearch,
  purpose: z.enum(donationPurposes).optional(),
  includeDeleted: booleanSearch,
});

export const supporterSearchSchema = supporterSearchObject
  .transform((value) => ({
    ...value,
    includeDeleted: value.includeDeleted ?? false,
  }));

export const exportSearchSchema = supporterSearchObject
  .omit({ page: true, pageSize: true })
  .transform((value) => ({
    ...value,
    includeDeleted: value.includeDeleted ?? false,
  }));

export const supporterInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  phone: optionalTrimmed,
  language: z.enum(crmLanguages),
  tags: normalizedTags,
  source: z.string().trim().min(1).max(80).default("admin_manual"),
});

export const supporterUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: optionalTrimmed,
  language: z.enum(crmLanguages).optional(),
  tags: normalizedTags.optional(),
  deleted: z.boolean().optional(),
});

export const consentUpdateSchema = z
  .object({
    source: z.string().trim().min(1).max(80),
    email: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
    timestamp: z.string().datetime().optional(),
  })
  .refine((value) => value.email !== undefined || value.whatsapp !== undefined, {
    message: "At least one channel consent must be provided",
  });

export const manualDonationSchema = z
  .object({
    supporterId: z.string().uuid().optional(),
    supporter: supporterInputSchema.optional(),
    amountCents: z.number().int().min(1000).max(1_000_000),
    currency: z.literal("HKD"),
    purpose: z.enum(donationPurposes),
    method: z.enum(manualDonationMethods),
    paymentStatus: z.enum(paymentStatuses),
    bankReference: optionalTrimmed,
    receiptRequested: z.boolean(),
    consents: z
      .object({
        email: z.boolean().optional(),
        whatsapp: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((value) => Boolean(value.supporterId || value.supporter), {
    message: "Either supporterId or supporter is required",
  })
  .refine((value) => value.paymentStatus !== "succeeded" || Boolean(value.bankReference), {
    message: "bankReference is required for succeeded manual payments",
    path: ["bankReference"],
  });

export type SupporterSearch = z.infer<typeof supporterSearchSchema>;
export type ExportSearch = z.infer<typeof exportSearchSchema>;
export type SupporterInput = z.infer<typeof supporterInputSchema>;
export type SupporterUpdate = z.infer<typeof supporterUpdateSchema>;
export type ConsentUpdate = z.infer<typeof consentUpdateSchema>;
export type ManualDonationInput = z.infer<typeof manualDonationSchema>;
```

- [ ] **Step 5: Run schema tests**

Run:

```bash
bun test src/lib/crm/schemas.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/crm/types.ts src/lib/crm/schemas.ts src/lib/crm/schemas.test.ts
git commit -m "feat: add donor crm schemas"
```

Expected: commit succeeds with schema files only.

---

## Task 3: Pure CRM Helpers

**Files:**

- Create: `src/lib/crm/consent.ts`
- Create: `src/lib/crm/consent.test.ts`
- Create: `src/lib/crm/timeline.ts`
- Create: `src/lib/crm/timeline.test.ts`
- Create: `src/lib/crm/csv.ts`
- Create: `src/lib/crm/csv.test.ts`
- Create: `src/lib/crm/manualDonation.ts`
- Create: `src/lib/crm/manualDonation.test.ts`

- [ ] **Step 1: Write consent tests**

Create `src/lib/crm/consent.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { buildConsentRowsForUpdate, latestConsentByChannel } from "./consent";

describe("crm consent helpers", () => {
  test("selects latest consent per channel", () => {
    const latest = latestConsentByChannel([
      {
        id: "1",
        supporterId: "s1",
        channel: "email",
        status: "opt_in",
        source: "donation_form",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        supporterId: "s1",
        channel: "email",
        status: "opt_out",
        source: "phone_call",
        timestamp: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "3",
        supporterId: "s1",
        channel: "whatsapp",
        status: "opt_in",
        source: "admin_manual",
        timestamp: "2026-01-15T00:00:00.000Z",
      },
    ]);

    expect(latest.email?.status).toBe("opt_out");
    expect(latest.whatsapp?.status).toBe("opt_in");
  });

  test("builds append-only rows for provided channels", () => {
    expect(
      buildConsentRowsForUpdate({
        supporterId: "s1",
        update: {
          source: "phone_call",
          email: false,
          timestamp: "2026-06-24T09:00:00.000Z",
        },
      }),
    ).toEqual([
      {
        supporter_id: "s1",
        channel: "email",
        status: "opt_out",
        source: "phone_call",
        timestamp: "2026-06-24T09:00:00.000Z",
      },
    ]);
  });
});
```

- [ ] **Step 2: Create consent helper**

Create `src/lib/crm/consent.ts`:

```ts
import type { ConsentHistoryRow } from "./types";
import type { ConsentUpdate } from "./schemas";

export function latestConsentByChannel(rows: ConsentHistoryRow[]) {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return {
    email: sorted.find((row) => row.channel === "email") ?? null,
    whatsapp: sorted.find((row) => row.channel === "whatsapp") ?? null,
  };
}

export function buildConsentRowsForUpdate(input: {
  supporterId: string;
  update: ConsentUpdate;
  now?: () => Date;
}) {
  const timestamp = input.update.timestamp ?? (input.now ?? (() => new Date()))().toISOString();
  const rows: Array<{
    supporter_id: string;
    channel: "email" | "whatsapp";
    status: "opt_in" | "opt_out";
    source: string;
    timestamp: string;
  }> = [];

  if (input.update.email !== undefined) {
    rows.push({
      supporter_id: input.supporterId,
      channel: "email",
      status: input.update.email ? "opt_in" : "opt_out",
      source: input.update.source,
      timestamp,
    });
  }

  if (input.update.whatsapp !== undefined) {
    rows.push({
      supporter_id: input.supporterId,
      channel: "whatsapp",
      status: input.update.whatsapp ? "opt_in" : "opt_out",
      source: input.update.source,
      timestamp,
    });
  }

  return rows;
}
```

- [ ] **Step 3: Write timeline tests**

Create `src/lib/crm/timeline.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { assembleSupporterTimeline } from "./timeline";

describe("crm timeline", () => {
  test("combines supporter events newest first", () => {
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
      payments: [
        {
          id: "p1",
          donationId: "d1",
          provider: "fps",
          providerRef: "HKSCDA-ABC12345",
          amountCents: 20000,
          status: "succeeded",
          receivedAt: "2026-06-02T10:00:00.000Z",
          bankReference: "FPS-1",
          createdAt: "2026-06-01T10:01:00.000Z",
        },
      ],
      receipts: [
        {
          id: "r1",
          receiptNo: "HKSCDA-2026-000001",
          donationIds: ["d1"],
          totalAmountCents: 20000,
          issuedAt: "2026-06-03T10:00:00.000Z",
          status: "issued",
          pdfUrl: "2026/HKSCDA-2026-000001.pdf",
        },
      ],
      consents: [],
      messages: [],
      auditLogs: [],
    });

    expect(timeline.map((item) => item.kind)).toEqual(["receipt", "payment", "donation"]);
    expect(timeline[0].title).toContain("HKSCDA-2026-000001");
  });
});
```

- [ ] **Step 4: Create timeline helper**

Create `src/lib/crm/timeline.ts`:

```ts
import { centsToHkd } from "../donations/domain";
import type {
  AuditHistoryRow,
  ConsentHistoryRow,
  DonationHistoryRow,
  MessageHistoryRow,
  PaymentHistoryRow,
  ReceiptHistoryRow,
  SupporterTimelineItem,
} from "./types";

export function assembleSupporterTimeline(input: {
  donations: DonationHistoryRow[];
  payments: PaymentHistoryRow[];
  receipts: ReceiptHistoryRow[];
  consents: ConsentHistoryRow[];
  messages: MessageHistoryRow[];
  auditLogs: AuditHistoryRow[];
}): SupporterTimelineItem[] {
  const items: SupporterTimelineItem[] = [
    ...input.donations.map((donation) => ({
      id: `donation:${donation.id}`,
      at: donation.createdAt,
      kind: "donation" as const,
      title: `Donation ${donation.status}`,
      description: `${donation.purpose} via ${donation.method}`,
      amountCents: donation.amountCents,
      status: donation.status,
    })),
    ...input.payments.map((payment) => ({
      id: `payment:${payment.id}`,
      at: payment.receivedAt ?? payment.createdAt,
      kind: "payment" as const,
      title: `Payment ${payment.status}`,
      description: `${payment.providerRef ?? payment.bankReference ?? payment.provider} ${centsToHkd(payment.amountCents)}`,
      amountCents: payment.amountCents,
      status: payment.status,
    })),
    ...input.receipts.map((receipt) => ({
      id: `receipt:${receipt.id}`,
      at: receipt.issuedAt,
      kind: "receipt" as const,
      title: `Receipt ${receipt.receiptNo}`,
      description: `${receipt.status} ${centsToHkd(receipt.totalAmountCents)}`,
      amountCents: receipt.totalAmountCents,
      status: receipt.status,
    })),
    ...input.consents.map((consent) => ({
      id: `consent:${consent.id}`,
      at: consent.timestamp,
      kind: "consent" as const,
      title: `${consent.channel} consent ${consent.status}`,
      description: `Source: ${consent.source}`,
      status: consent.status,
    })),
    ...input.messages.map((message) => ({
      id: `message:${message.id}`,
      at: message.sentAt ?? message.createdAt,
      kind: "message" as const,
      title: `${message.channel} message ${message.status}`,
      description: String(message.payload.subject ?? message.payload.template ?? "Message"),
      status: message.status,
    })),
    ...input.auditLogs.map((log) => ({
      id: `audit:${log.id}`,
      at: log.timestamp,
      kind: "audit" as const,
      title: log.action,
      description: `${log.entity}:${log.entityId}`,
    })),
  ];

  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
```

- [ ] **Step 5: Write CSV tests**

Create `src/lib/crm/csv.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { buildDonationCsv, buildSupporterCsv, escapeCsvValue } from "./csv";

describe("crm csv", () => {
  test("escapes commas, quotes, and newlines", () => {
    expect(escapeCsvValue('Ada, "Cat"\nHK')).toBe('"Ada, ""Cat""\nHK"');
  });

  test("builds supporter export columns", () => {
    const csv = buildSupporterCsv([
      {
        id: "s1",
        name: "Ada",
        email: "ada@example.com",
        phone: null,
        language: "zh-HK",
        tags: ["medical"],
        roles: ["donor"],
        deletedAt: null,
        lastGiftAt: "2026-06-01T00:00:00.000Z",
        lastGiftAmountCents: 10000,
        lifetimeAmountCents: 30000,
        donationCount: 2,
        receiptNeeded: true,
        emailConsent: "opt_in",
        whatsappConsent: "opt_out",
      },
    ]);

    expect(csv.split("\n")[0]).toBe(
      "supporter_id,name,email,phone,language,roles,tags,lifetime_hkd,last_gift_hkd,last_gift_at,donation_count,receipt_needed,email_consent,whatsapp_consent,deleted_at",
    );
    expect(csv).toContain("300.00");
  });

  test("builds donation export columns", () => {
    const csv = buildDonationCsv([
      {
        supporterId: "s1",
        supporterName: "Ada",
        supporterEmail: "ada@example.com",
        donationId: "d1",
        amountCents: 10000,
        purpose: "general",
        status: "succeeded",
        method: "manual",
        receiptRequested: true,
        receiptNo: "HKSCDA-2026-000001",
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ]);

    expect(csv).toContain("receipt_no");
    expect(csv).toContain("HKSCDA-2026-000001");
  });
});
```

- [ ] **Step 6: Create CSV helper**

Create `src/lib/crm/csv.ts`:

```ts
import type { SupporterSummary } from "./types";

export type DonationExportRow = {
  supporterId: string;
  supporterName: string;
  supporterEmail: string;
  donationId: string;
  amountCents: number;
  purpose: string;
  status: string;
  method: string;
  receiptRequested: boolean;
  receiptNo: string | null;
  createdAt: string;
};

function centsToDecimal(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

export function escapeCsvValue(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function buildCsv(headers: string[], rows: unknown[][]) {
  return [headers.join(","), ...rows.map((row) => row.map(escapeCsvValue).join(","))].join("\n");
}

export function buildSupporterCsv(rows: SupporterSummary[]) {
  return buildCsv(
    [
      "supporter_id",
      "name",
      "email",
      "phone",
      "language",
      "roles",
      "tags",
      "lifetime_hkd",
      "last_gift_hkd",
      "last_gift_at",
      "donation_count",
      "receipt_needed",
      "email_consent",
      "whatsapp_consent",
      "deleted_at",
    ],
    rows.map((row) => [
      row.id,
      row.name,
      row.email,
      row.phone,
      row.language,
      row.roles.join("|"),
      row.tags.join("|"),
      centsToDecimal(row.lifetimeAmountCents),
      row.lastGiftAmountCents === null ? "" : centsToDecimal(row.lastGiftAmountCents),
      row.lastGiftAt,
      row.donationCount,
      row.receiptNeeded,
      row.emailConsent,
      row.whatsappConsent,
      row.deletedAt,
    ]),
  );
}

export function buildDonationCsv(rows: DonationExportRow[]) {
  return buildCsv(
    [
      "supporter_id",
      "supporter_name",
      "supporter_email",
      "donation_id",
      "amount_hkd",
      "purpose",
      "status",
      "method",
      "receipt_requested",
      "receipt_no",
      "created_at",
    ],
    rows.map((row) => [
      row.supporterId,
      row.supporterName,
      row.supporterEmail,
      row.donationId,
      centsToDecimal(row.amountCents),
      row.purpose,
      row.status,
      row.method,
      row.receiptRequested,
      row.receiptNo,
      row.createdAt,
    ]),
  );
}
```

- [ ] **Step 7: Write manual donation tests**

Create `src/lib/crm/manualDonation.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { buildManualDonationRecords } from "./manualDonation";

describe("manual donation records", () => {
  test("builds succeeded manual payment records", () => {
    const records = buildManualDonationRecords({
      supporterId: "s1",
      input: {
        supporterId: "s1",
        amountCents: 12000,
        currency: "HKD",
        purpose: "medical",
        method: "manual",
        paymentStatus: "succeeded",
        bankReference: "CASH-2026-001",
        receiptRequested: true,
      },
      actorUserId: "admin-1",
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    });

    expect(records.donation).toMatchObject({
      supporter_id: "s1",
      amount_cents: 12000,
      status: "succeeded",
      method: "manual",
    });
    expect(records.payment).toMatchObject({
      amount_cents: 12000,
      status: "succeeded",
      bank_reference: "CASH-2026-001",
      reconciled_by: "admin-1",
    });
  });
});
```

- [ ] **Step 8: Create manual donation helper**

Create `src/lib/crm/manualDonation.ts`:

```ts
import { createManualPaymentReference } from "../donations/domain";
import type { ManualDonationInput } from "./schemas";

export function buildManualDonationRecords(input: {
  supporterId: string;
  input: ManualDonationInput;
  actorUserId: string;
  now?: () => Date;
}) {
  const now = (input.now ?? (() => new Date()))().toISOString();
  const donationIdSeed = crypto.randomUUID();
  const providerRef = createManualPaymentReference(donationIdSeed);

  return {
    donationSeedId: donationIdSeed,
    donation: {
      id: donationIdSeed,
      supporter_id: input.supporterId,
      amount_cents: input.input.amountCents,
      currency: input.input.currency,
      purpose: input.input.purpose,
      type: "one_time" as const,
      status: input.input.paymentStatus === "succeeded" ? ("succeeded" as const) : ("pending" as const),
      method: input.input.method,
      receipt_requested: input.input.receiptRequested,
      created_at: now,
    },
    payment: {
      donation_id: donationIdSeed,
      provider: input.input.method,
      provider_ref: providerRef,
      amount_cents: input.input.amountCents,
      status: input.input.paymentStatus,
      received_at: input.input.paymentStatus === "succeeded" ? now : null,
      reconciled_by: input.input.paymentStatus === "succeeded" ? input.actorUserId : null,
      bank_reference: input.input.bankReference ?? null,
      created_at: now,
    },
    audit: {
      actor_user_id: input.actorUserId,
      action: "donation.manual_create",
      entity: "donation",
      entity_id: donationIdSeed,
      timestamp: now,
      detail: {
        method: input.input.method,
        paymentStatus: input.input.paymentStatus,
        bankReference: input.input.bankReference ?? null,
      },
    },
  };
}
```

- [ ] **Step 9: Run helper tests**

Run:

```bash
bun test src/lib/crm/consent.test.ts src/lib/crm/timeline.test.ts src/lib/crm/csv.test.ts src/lib/crm/manualDonation.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```bash
git add src/lib/crm/consent.ts src/lib/crm/consent.test.ts src/lib/crm/timeline.ts src/lib/crm/timeline.test.ts src/lib/crm/csv.ts src/lib/crm/csv.test.ts src/lib/crm/manualDonation.ts src/lib/crm/manualDonation.test.ts
git commit -m "feat: add donor crm helpers"
```

Expected: commit succeeds with pure helper files only.

---

## Task 4: CRM Service And Supabase Repository

**Files:**

- Create: `src/lib/crm/service.ts`
- Create: `src/lib/crm/service.test.ts`
- Create: `src/lib/crm/repository.server.ts`

- [ ] **Step 1: Write service tests with a fake repository**

Create `src/lib/crm/service.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { createCrmService, type CrmRepository } from "./service";

function makeRepo(): CrmRepository & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async listSupporters() {
      calls.push("listSupporters");
      return { supporters: [], total: 0 };
    },
    async getSupporterDetail() {
      calls.push("getSupporterDetail");
      return null;
    },
    async upsertSupporter(input) {
      calls.push(`upsertSupporter:${input.email}`);
      return { id: "s1", email: input.email };
    },
    async updateSupporter() {
      calls.push("updateSupporter");
    },
    async ensureSupporterRole(input) {
      calls.push(`ensureSupporterRole:${input.role}`);
    },
    async insertConsentRows(rows) {
      calls.push(`insertConsentRows:${rows.length}`);
    },
    async insertManualDonation() {
      calls.push("insertManualDonation");
      return { donationId: "d1", paymentId: "p1" };
    },
    async listSupportersForExport() {
      calls.push("listSupportersForExport");
      return [];
    },
    async listDonationsForExport() {
      calls.push("listDonationsForExport");
      return [];
    },
    async insertAuditLog(input) {
      calls.push(`audit:${input.action}`);
    },
  };
}

describe("crm service", () => {
  test("manual supporter entry dedupes by normalized email and ensures donor role", async () => {
    const repo = makeRepo();
    const service = createCrmService({ repo });

    const supporter = await service.createSupporter({
      actorUserId: "admin-1",
      input: {
        name: "Ada",
        email: " ADA@EXAMPLE.COM ",
        language: "zh-HK",
        tags: ["medical"],
      },
    });

    expect(supporter.id).toBe("s1");
    expect(repo.calls).toEqual([
      "upsertSupporter:ada@example.com",
      "ensureSupporterRole:donor",
      "audit:supporter.create_or_update",
    ]);
  });

  test("append consent change writes only provided channels", async () => {
    const repo = makeRepo();
    const service = createCrmService({
      repo,
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    });

    await service.appendConsents({
      actorUserId: "admin-1",
      supporterId: "s1",
      input: { source: "phone_call", email: true },
    });

    expect(repo.calls).toEqual(["insertConsentRows:1", "audit:consent.append"]);
  });

  test("manual donation validates before writes and logs audit", async () => {
    const repo = makeRepo();
    const service = createCrmService({
      repo,
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    });

    const result = await service.createManualDonation({
      actorUserId: "admin-1",
      input: {
        supporterId: "s1",
        amountCents: 15000,
        currency: "HKD",
        purpose: "general",
        method: "fps",
        paymentStatus: "pending",
        receiptRequested: true,
      },
    });

    expect(result).toEqual({ donationId: "d1", paymentId: "p1" });
    expect(repo.calls).toContain("insertManualDonation");
  });
});
```

- [ ] **Step 2: Create CRM service**

Create `src/lib/crm/service.ts`:

```ts
import { buildConsentRowsForUpdate } from "./consent";
import { buildDonationCsv, buildSupporterCsv, type DonationExportRow } from "./csv";
import { buildManualDonationRecords } from "./manualDonation";
import {
  consentUpdateSchema,
  exportSearchSchema,
  manualDonationSchema,
  supporterInputSchema,
  supporterSearchSchema,
  supporterUpdateSchema,
  type ExportSearch,
  type SupporterSearch,
} from "./schemas";
import type { SupporterDetail, SupporterSummary } from "./types";

export type CrmRepository = {
  listSupporters(input: SupporterSearch): Promise<{ supporters: SupporterSummary[]; total: number }>;
  getSupporterDetail(id: string): Promise<SupporterDetail | null>;
  upsertSupporter(input: {
    name: string;
    email: string;
    phone?: string;
    language: "zh-HK" | "en";
    tags: string[];
    source: string;
  }): Promise<{ id: string; email: string }>;
  updateSupporter(id: string, input: {
    name?: string;
    phone?: string;
    language?: "zh-HK" | "en";
    tags?: string[];
    deletedAt?: string | null;
  }): Promise<void>;
  ensureSupporterRole(input: { supporterId: string; role: "donor" }): Promise<void>;
  insertConsentRows(rows: Array<{
    supporter_id: string;
    channel: "email" | "whatsapp";
    status: "opt_in" | "opt_out";
    source: string;
    timestamp: string;
  }>): Promise<void>;
  insertManualDonation(input: ReturnType<typeof buildManualDonationRecords>): Promise<{
    donationId: string;
    paymentId: string;
  }>;
  listSupportersForExport(input: ExportSearch): Promise<SupporterSummary[]>;
  listDonationsForExport(input: ExportSearch): Promise<DonationExportRow[]>;
  insertAuditLog(input: {
    actor_user_id: string;
    action: string;
    entity: string;
    entity_id: string;
    timestamp?: string;
    detail: Record<string, unknown>;
  }): Promise<void>;
};

export function createCrmService(input: { repo: CrmRepository; now?: () => Date }) {
  const now = input.now ?? (() => new Date());

  return {
    async listSupporters(raw: unknown) {
      return input.repo.listSupporters(supporterSearchSchema.parse(raw));
    },
    async getSupporterDetail(id: string) {
      return input.repo.getSupporterDetail(id);
    },
    async createSupporter(args: { actorUserId: string; input: unknown }) {
      const parsed = supporterInputSchema.parse(args.input);
      const supporter = await input.repo.upsertSupporter(parsed);
      await input.repo.ensureSupporterRole({ supporterId: supporter.id, role: "donor" });
      await input.repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "supporter.create_or_update",
        entity: "supporter",
        entity_id: supporter.id,
        detail: { email: supporter.email, source: parsed.source },
      });
      return supporter;
    },
    async updateSupporter(args: { actorUserId: string; supporterId: string; input: unknown }) {
      const parsed = supporterUpdateSchema.parse(args.input);
      await input.repo.updateSupporter(args.supporterId, {
        name: parsed.name,
        phone: parsed.phone,
        language: parsed.language,
        tags: parsed.tags,
        deletedAt: parsed.deleted === undefined ? undefined : parsed.deleted ? now().toISOString() : null,
      });
      await input.repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "supporter.update",
        entity: "supporter",
        entity_id: args.supporterId,
        detail: parsed,
      });
    },
    async appendConsents(args: { actorUserId: string; supporterId: string; input: unknown }) {
      const parsed = consentUpdateSchema.parse(args.input);
      const rows = buildConsentRowsForUpdate({
        supporterId: args.supporterId,
        update: parsed,
        now,
      });
      await input.repo.insertConsentRows(rows);
      await input.repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "consent.append",
        entity: "supporter",
        entity_id: args.supporterId,
        detail: { channels: rows.map((row) => row.channel), source: parsed.source },
      });
    },
    async createManualDonation(args: { actorUserId: string; input: unknown }) {
      const parsed = manualDonationSchema.parse(args.input);
      let supporterId = parsed.supporterId;
      if (!supporterId && parsed.supporter) {
        const supporter = await input.repo.upsertSupporter(parsed.supporter);
        supporterId = supporter.id;
      }
      if (!supporterId) throw new Error("supporterId is required after manual donation parsing");
      await input.repo.ensureSupporterRole({ supporterId, role: "donor" });
      const records = buildManualDonationRecords({
        supporterId,
        input: parsed,
        actorUserId: args.actorUserId,
        now,
      });
      const result = await input.repo.insertManualDonation(records);
      if (parsed.consents) {
        await input.repo.insertConsentRows(
          buildConsentRowsForUpdate({
            supporterId,
            update: {
              source: "admin_manual",
              email: parsed.consents.email,
              whatsapp: parsed.consents.whatsapp,
            },
            now,
          }),
        );
      }
      return result;
    },
    async exportSupporters(args: { actorUserId: string; rawSearch: unknown }) {
      const filters = exportSearchSchema.parse(args.rawSearch);
      const rows = await input.repo.listSupportersForExport(filters);
      await input.repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "export.supporters",
        entity: "supporter",
        entity_id: "bulk",
        detail: { filters, rowCount: rows.length },
      });
      return buildSupporterCsv(rows);
    },
    async exportDonations(args: { actorUserId: string; rawSearch: unknown }) {
      const filters = exportSearchSchema.parse(args.rawSearch);
      const rows = await input.repo.listDonationsForExport(filters);
      await input.repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "export.donations",
        entity: "donation",
        entity_id: "bulk",
        detail: { filters, rowCount: rows.length },
      });
      return buildDonationCsv(rows);
    },
  };
}
```

- [ ] **Step 3: Run service tests**

Run:

```bash
bun test src/lib/crm/service.test.ts
```

Expected: PASS.

- [ ] **Step 4: Create Supabase repository**

Create `src/lib/crm/repository.server.ts` with these exported functions and mapping helpers:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { assembleSupporterTimeline } from "./timeline";
import { latestConsentByChannel } from "./consent";
import type { CrmRepository } from "./service";
import type { ExportSearch, SupporterSearch } from "./schemas";
import type { SupporterDetail, SupporterSummary } from "./types";

function mapConsent(row: Record<string, any>) {
  return {
    id: row.id,
    supporterId: row.supporter_id,
    channel: row.channel,
    status: row.status,
    source: row.source,
    timestamp: row.timestamp,
  };
}

function summarizeSupporter(row: Record<string, any>): SupporterSummary {
  const donations = row.donation ?? [];
  const consents = (row.consent ?? []).map(mapConsent);
  const latest = latestConsentByChannel(consents);
  const succeededDonations = donations.filter((donation: any) => donation.status === "succeeded");
  const sortedDonations = [...succeededDonations].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    language: row.language,
    tags: row.tags ?? [],
    roles: (row.supporter_role ?? []).map((role: any) => role.role),
    deletedAt: row.deleted_at,
    lastGiftAt: sortedDonations[0]?.created_at ?? null,
    lastGiftAmountCents: sortedDonations[0]?.amount_cents ?? null,
    lifetimeAmountCents: succeededDonations.reduce(
      (sum: number, donation: any) => sum + donation.amount_cents,
      0,
    ),
    donationCount: donations.length,
    receiptNeeded: donations.some(
      (donation: any) => donation.status === "succeeded" && donation.receipt_requested,
    ),
    emailConsent: latest.email?.status ?? null,
    whatsappConsent: latest.whatsapp?.status ?? null,
  };
}

function applySupporterFilters(query: any, filters: SupporterSearch | ExportSearch) {
  let next = query;
  if (!filters.includeDeleted) next = next.is("deleted_at", null);
  if (filters.tag) next = next.contains("tags", [filters.tag]);
  if (filters.role) next = next.eq("supporter_role.role", filters.role);
  if (filters.purpose) next = next.eq("donation.purpose", filters.purpose);
  if (filters.receiptNeeded === true) next = next.eq("donation.receipt_requested", true);
  return next;
}

async function findSupporterIdsByOperationalSearch(client: SupabaseClient, q: string) {
  const escaped = q.replaceAll("%", "\\%").replaceAll("_", "\\_");
  const [donations, payments, receipts] = await Promise.all([
    client
      .from("donation")
      .select("supporter_id")
      .or(`purpose.ilike.%${escaped}%,id.eq.${q}`),
    client
      .from("payment")
      .select("donation:donation_id(supporter_id)")
      .or(`provider_ref.ilike.%${escaped}%,bank_reference.ilike.%${escaped}%`),
    client
      .from("receipt")
      .select("supporter_id")
      .ilike("receipt_no", `%${escaped}%`),
  ]);

  for (const result of [donations, payments, receipts]) {
    if (result.error) throw result.error;
  }

  return [
    ...(donations.data ?? []).map((row: any) => row.supporter_id),
    ...(payments.data ?? []).map((row: any) => row.donation?.supporter_id).filter(Boolean),
    ...(receipts.data ?? []).map((row: any) => row.supporter_id),
  ];
}

export function createSupabaseCrmRepository(client: SupabaseClient): CrmRepository {
  return {
    async listSupporters(filters) {
      const from = (filters.page - 1) * filters.pageSize;
      const to = from + filters.pageSize - 1;
      const operationalIds = filters.q ? await findSupporterIdsByOperationalSearch(client, filters.q) : [];
      let query = applySupporterFilters(
        client
          .from("supporter")
          .select(
            "id,name,email,phone,language,tags,source,deleted_at,created_at,updated_at,supporter_role(role),consent(id,supporter_id,channel,status,source,timestamp),donation(id,amount_cents,currency,purpose,status,method,receipt_requested,created_at)",
            { count: "exact" },
          ),
        filters,
      );
      if (filters.q && operationalIds.length > 0) {
        const escaped = filters.q.replaceAll("%", "\\%").replaceAll("_", "\\_");
        query = query.or(
          [
            `name.ilike.%${escaped}%`,
            `email.ilike.%${escaped}%`,
            `phone.ilike.%${escaped}%`,
            `id.in.(${operationalIds.join(",")})`,
          ].join(","),
        );
      } else if (filters.q) {
        const escaped = filters.q.replaceAll("%", "\\%").replaceAll("_", "\\_");
        query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
      }
      query = query.order("updated_at", { ascending: false }).range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { supporters: (data ?? []).map((row) => summarizeSupporter(row)), total: count ?? 0 };
    },
    async getSupporterDetail(id) {
      const { data, error } = await client
        .from("supporter")
        .select(
          "id,name,email,phone,language,tags,source,deleted_at,created_at,updated_at,supporter_role(role),consent(id,supporter_id,channel,status,source,timestamp),donation(id,amount_cents,currency,purpose,status,method,receipt_requested,created_at),receipt(id,receipt_no,donation_ids,total_amount_cents,issued_at,status,pdf_url),message(id,channel,status,payload,sent_at,created_at)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const summary = summarizeSupporter(data);
      const donations = (data.donation ?? []).map((row: any) => ({
        id: row.id,
        amountCents: row.amount_cents,
        currency: row.currency,
        purpose: row.purpose,
        status: row.status,
        method: row.method,
        receiptRequested: row.receipt_requested,
        createdAt: row.created_at,
      }));
      const donationIds = donations.map((donation) => donation.id);
      const { data: paymentRows, error: paymentError } = donationIds.length
        ? await client
            .from("payment")
            .select("id,donation_id,provider,provider_ref,amount_cents,status,received_at,bank_reference,created_at")
            .in("donation_id", donationIds)
        : { data: [], error: null };
      if (paymentError) throw paymentError;
      const payments = (paymentRows ?? []).map((row: any) => ({
        id: row.id,
        donationId: row.donation_id,
        provider: row.provider,
        providerRef: row.provider_ref,
        amountCents: row.amount_cents,
        status: row.status,
        receivedAt: row.received_at,
        bankReference: row.bank_reference,
        createdAt: row.created_at,
      }));
      const receipts = (data.receipt ?? []).map((row: any) => ({
        id: row.id,
        receiptNo: row.receipt_no,
        donationIds: row.donation_ids,
        totalAmountCents: row.total_amount_cents,
        issuedAt: row.issued_at,
        status: row.status,
        pdfUrl: row.pdf_url,
      }));
      const consents = (data.consent ?? []).map(mapConsent);
      const messages = (data.message ?? []).map((row: any) => ({
        id: row.id,
        channel: row.channel,
        status: row.status,
        payload: row.payload,
        sentAt: row.sent_at,
        createdAt: row.created_at,
      }));
      const auditEntityIds = [id, ...donationIds, ...payments.map((payment) => payment.id)];
      const { data: auditRows, error: auditError } = await client
        .from("audit_log")
        .select("id,actor_user_id,action,entity,entity_id,timestamp,detail")
        .in("entity_id", auditEntityIds)
        .order("timestamp", { ascending: false })
        .limit(100);
      if (auditError) throw auditError;
      const auditLogs = (auditRows ?? []).map((row: any) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        entity: row.entity,
        entityId: row.entity_id,
        timestamp: row.timestamp,
        detail: row.detail,
      }));

      return {
        ...summary,
        source: data.source,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        donations,
        payments,
        receipts,
        consents,
        messages,
        auditLogs,
        timeline: assembleSupporterTimeline({ donations, payments, receipts, consents, messages, auditLogs }),
      } satisfies SupporterDetail;
    },
    async upsertSupporter(input) {
      const { data, error } = await client
        .from("supporter")
        .upsert(
          {
            name: input.name,
            email: input.email,
            phone: input.phone ?? null,
            language: input.language,
            tags: input.tags,
            source: input.source,
            deleted_at: null,
          },
          { onConflict: "email" },
        )
        .select("id,email")
        .single();
      if (error) throw error;
      return data;
    },
    async updateSupporter(id, input) {
      const { error } = await client.from("supporter").update({
        name: input.name,
        phone: input.phone,
        language: input.language,
        tags: input.tags,
        deleted_at: input.deletedAt,
      }).eq("id", id);
      if (error) throw error;
    },
    async ensureSupporterRole(input) {
      const { error } = await client.from("supporter_role").upsert({
        supporter_id: input.supporterId,
        role: input.role,
      });
      if (error) throw error;
    },
    async insertConsentRows(rows) {
      if (rows.length === 0) return;
      const { error } = await client.from("consent").insert(rows);
      if (error) throw error;
    },
    async insertManualDonation(records) {
      const { error: donationError } = await client.from("donation").insert(records.donation);
      if (donationError) throw donationError;
      const { data: payment, error: paymentError } = await client
        .from("payment")
        .insert(records.payment)
        .select("id")
        .single();
      if (paymentError) throw paymentError;
      const { error: auditError } = await client.from("audit_log").insert(records.audit);
      if (auditError) throw auditError;
      return { donationId: records.donationSeedId, paymentId: payment.id };
    },
    async listSupportersForExport(filters) {
      const { data, error } = await applySupporterFilters(
        client
          .from("supporter")
          .select(
            "id,name,email,phone,language,tags,deleted_at,supporter_role(role),consent(id,supporter_id,channel,status,source,timestamp),donation(id,amount_cents,currency,purpose,status,method,receipt_requested,created_at)",
          ),
        filters,
      ).limit(5000);
      if (error) throw error;
      return (data ?? []).map((row) => summarizeSupporter(row));
    },
    async listDonationsForExport(filters) {
      let query = client
        .from("donation")
        .select("id,amount_cents,purpose,status,method,receipt_requested,created_at,supporter:supporter_id(id,name,email)")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (filters.purpose) query = query.eq("purpose", filters.purpose);
      if (filters.receiptNeeded === true) query = query.eq("receipt_requested", true);
      const { data, error } = await query;
      if (error) throw error;
      const donationIds = (data ?? []).map((row: any) => row.id);
      const { data: receiptRows, error: receiptError } = donationIds.length
        ? await client
            .from("receipt")
            .select("receipt_no,donation_ids")
            .eq("status", "issued")
        : { data: [], error: null };
      if (receiptError) throw receiptError;
      const receiptByDonation = new Map<string, string>();
      for (const receipt of receiptRows ?? []) {
        for (const donationId of receipt.donation_ids ?? []) {
          receiptByDonation.set(donationId, receipt.receipt_no);
        }
      }
      return (data ?? []).map((row: any) => ({
        supporterId: row.supporter.id,
        supporterName: row.supporter.name,
        supporterEmail: row.supporter.email,
        donationId: row.id,
        amountCents: row.amount_cents,
        purpose: row.purpose,
        status: row.status,
        method: row.method,
        receiptRequested: row.receipt_requested,
        receiptNo: receiptByDonation.get(row.id) ?? null,
        createdAt: row.created_at,
      }));
    },
    async insertAuditLog(input) {
      const { error } = await client.from("audit_log").insert(input);
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 5: Run CRM tests**

Run:

```bash
bun test src/lib/crm
```

Expected: all CRM tests PASS and the repository compiles with only real foreign-key relations in nested select strings.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/crm/service.ts src/lib/crm/service.test.ts src/lib/crm/repository.server.ts
git commit -m "feat: add donor crm service"
```

Expected: commit succeeds with CRM service and repository files.

---

## Task 5: Admin CRM API Routes

**Files:**

- Create: `src/lib/crm/http.server.ts`
- Create: `src/lib/crm/http.test.ts`
- Create: `src/routes/api/admin/supporters.ts`
- Create: `src/routes/api/admin/supporters/$id.ts`
- Create: `src/routes/api/admin/supporters/$id/consents.ts`
- Create: `src/routes/api/admin/donations/manual.ts`
- Create: `src/routes/api/admin/exports/supporters[.]csv.ts`
- Create: `src/routes/api/admin/exports/donations[.]csv.ts`

- [ ] **Step 1: Write request handler tests**

Create `src/lib/crm/http.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { createCrmHandlers } from "./http.server";

describe("crm http handlers", () => {
  test("rejects missing admin auth before export", async () => {
    const handlers = createCrmHandlers({
      async requireTreasurer() {
        throw new Response("Missing authorization token", { status: 401 });
      },
      service: {} as never,
    });

    const response = await handlers.exportSupporters(new Request("http://test.local"));
    expect(response.status).toBe(401);
  });

  test("returns csv with download headers", async () => {
    const handlers = createCrmHandlers({
      async requireTreasurer() {
        return { authUserId: "admin-1", email: "a@example.com", role: "treasurer" };
      },
      service: {
        async exportSupporters() {
          return "supporter_id,name\ns1,Ada";
        },
      } as never,
    });

    const response = await handlers.exportSupporters(new Request("http://test.local?q=Ada"));
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("supporters.csv");
    expect(await response.text()).toContain("Ada");
  });
});
```

- [ ] **Step 2: Create shared HTTP handlers**

Create `src/lib/crm/http.server.ts`:

```ts
import { z } from "zod";

import { createCrmService } from "./service";
import type { AdminUser } from "../donations/supabase.server";

type CrmService = ReturnType<typeof createCrmService>;

type HandlerDeps = {
  requireTreasurer(request: Request): Promise<AdminUser>;
  service: CrmService;
};

function jsonError(error: unknown, fallback: string) {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) {
    return Response.json({ error: error.errors[0]?.message ?? "Invalid CRM request" }, { status: 400 });
  }
  console.error(error);
  return Response.json({ error: fallback }, { status: 500 });
}

function csvResponse(filename: string, body: string) {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

export function createCrmHandlers(deps: HandlerDeps) {
  return {
    async listSupporters(request: Request) {
      try {
        await deps.requireTreasurer(request);
        const url = new URL(request.url);
        return Response.json(await deps.service.listSupporters(Object.fromEntries(url.searchParams)));
      } catch (error) {
        return jsonError(error, "Could not load supporters");
      }
    },
    async createSupporter(request: Request) {
      try {
        const admin = await deps.requireTreasurer(request);
        return Response.json(await deps.service.createSupporter({
          actorUserId: admin.authUserId,
          input: await request.json(),
        }));
      } catch (error) {
        return jsonError(error, "Could not save supporter");
      }
    },
    async getSupporter(request: Request, supporterId: string) {
      try {
        await deps.requireTreasurer(request);
        const supporter = await deps.service.getSupporterDetail(supporterId);
        if (!supporter) return Response.json({ error: "Supporter not found" }, { status: 404 });
        return Response.json({ supporter });
      } catch (error) {
        return jsonError(error, "Could not load supporter");
      }
    },
    async updateSupporter(request: Request, supporterId: string) {
      try {
        const admin = await deps.requireTreasurer(request);
        await deps.service.updateSupporter({
          actorUserId: admin.authUserId,
          supporterId,
          input: await request.json(),
        });
        return Response.json({ ok: true });
      } catch (error) {
        return jsonError(error, "Could not update supporter");
      }
    },
    async appendConsents(request: Request, supporterId: string) {
      try {
        const admin = await deps.requireTreasurer(request);
        await deps.service.appendConsents({
          actorUserId: admin.authUserId,
          supporterId,
          input: await request.json(),
        });
        return Response.json({ ok: true });
      } catch (error) {
        return jsonError(error, "Could not update consent");
      }
    },
    async createManualDonation(request: Request) {
      try {
        const admin = await deps.requireTreasurer(request);
        return Response.json(await deps.service.createManualDonation({
          actorUserId: admin.authUserId,
          input: await request.json(),
        }));
      } catch (error) {
        return jsonError(error, "Could not create manual donation");
      }
    },
    async exportSupporters(request: Request) {
      try {
        const admin = await deps.requireTreasurer(request);
        const url = new URL(request.url);
        const csv = await deps.service.exportSupporters({
          actorUserId: admin.authUserId,
          rawSearch: Object.fromEntries(url.searchParams),
        });
        return csvResponse("supporters.csv", csv);
      } catch (error) {
        return jsonError(error, "Could not export supporters");
      }
    },
    async exportDonations(request: Request) {
      try {
        const admin = await deps.requireTreasurer(request);
        const url = new URL(request.url);
        const csv = await deps.service.exportDonations({
          actorUserId: admin.authUserId,
          rawSearch: Object.fromEntries(url.searchParams),
        });
        return csvResponse("donations.csv", csv);
      } catch (error) {
        return jsonError(error, "Could not export donations");
      }
    },
  };
}
```

- [ ] **Step 3: Create route dependency factory**

In each route file, use this same construction pattern:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createCrmHandlers } from "../../../lib/crm/http.server";
import { createSupabaseCrmRepository } from "../../../lib/crm/repository.server";
import { createCrmService } from "../../../lib/crm/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  return createCrmHandlers({
    requireTreasurer: (request) => requireAdmin(request, ["treasurer", "admin"], client),
    service: createCrmService({ repo: createSupabaseCrmRepository(client) }),
  });
}
```

- [ ] **Step 4: Create `src/routes/api/admin/supporters.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createCrmHandlers } from "../../../lib/crm/http.server";
import { createSupabaseCrmRepository } from "../../../lib/crm/repository.server";
import { createCrmService } from "../../../lib/crm/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  return createCrmHandlers({
    requireTreasurer: (request) => requireAdmin(request, ["treasurer", "admin"], client),
    service: createCrmService({ repo: createSupabaseCrmRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/supporters")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listSupporters(request),
      POST: ({ request }) => createHandlers().createSupporter(request),
    },
  },
});
```

- [ ] **Step 5: Create supporter detail and consent routes**

Create `src/routes/api/admin/supporters/$id.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createCrmHandlers } from "../../../../lib/crm/http.server";
import { createSupabaseCrmRepository } from "../../../../lib/crm/repository.server";
import { createCrmService } from "../../../../lib/crm/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  return createCrmHandlers({
    requireTreasurer: (request) => requireAdmin(request, ["treasurer", "admin"], client),
    service: createCrmService({ repo: createSupabaseCrmRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/supporters/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getSupporter(request, params.id),
      PATCH: ({ request, params }) => createHandlers().updateSupporter(request, params.id),
    },
  },
});
```

Create `src/routes/api/admin/supporters/$id/consents.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createCrmHandlers } from "../../../../../lib/crm/http.server";
import { createSupabaseCrmRepository } from "../../../../../lib/crm/repository.server";
import { createCrmService } from "../../../../../lib/crm/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  return createCrmHandlers({
    requireTreasurer: (request) => requireAdmin(request, ["treasurer", "admin"], client),
    service: createCrmService({ repo: createSupabaseCrmRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/supporters/$id/consents")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().appendConsents(request, params.id),
    },
  },
});
```

- [ ] **Step 6: Create manual donation route**

Create `src/routes/api/admin/donations/manual.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createCrmHandlers } from "../../../../lib/crm/http.server";
import { createSupabaseCrmRepository } from "../../../../lib/crm/repository.server";
import { createCrmService } from "../../../../lib/crm/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  return createCrmHandlers({
    requireTreasurer: (request) => requireAdmin(request, ["treasurer", "admin"], client),
    service: createCrmService({ repo: createSupabaseCrmRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/donations/manual")({
  server: {
    handlers: {
      POST: ({ request }) => createHandlers().createManualDonation(request),
    },
  },
});
```

- [ ] **Step 7: Create CSV export routes**

Create `src/routes/api/admin/exports/supporters[.]csv.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createCrmHandlers } from "../../../../lib/crm/http.server";
import { createSupabaseCrmRepository } from "../../../../lib/crm/repository.server";
import { createCrmService } from "../../../../lib/crm/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  return createCrmHandlers({
    requireTreasurer: (request) => requireAdmin(request, ["treasurer", "admin"], client),
    service: createCrmService({ repo: createSupabaseCrmRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/exports/supporters.csv")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().exportSupporters(request),
    },
  },
});
```

Create `src/routes/api/admin/exports/donations[.]csv.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createCrmHandlers } from "../../../../lib/crm/http.server";
import { createSupabaseCrmRepository } from "../../../../lib/crm/repository.server";
import { createCrmService } from "../../../../lib/crm/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  return createCrmHandlers({
    requireTreasurer: (request) => requireAdmin(request, ["treasurer", "admin"], client),
    service: createCrmService({ repo: createSupabaseCrmRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/exports/donations.csv")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().exportDonations(request),
    },
  },
});
```

- [ ] **Step 8: Verify route tree generation**

Run:

```bash
bun run build
```

Expected: route generation includes `/api/admin/exports/supporters.csv` and `/api/admin/exports/donations.csv` in `src/routeTree.gen.ts`, and the build completes. If the generator reports a path mismatch for literal-dot files, rename only the export route files according to the generator error and keep the public route strings as `/api/admin/exports/supporters.csv` and `/api/admin/exports/donations.csv`.

- [ ] **Step 9: Run handler tests**

Run:

```bash
bun test src/lib/crm/http.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```bash
git add src/lib/crm/http.server.ts src/lib/crm/http.test.ts src/routes/api/admin/supporters.ts src/routes/api/admin/supporters src/routes/api/admin/donations/manual.ts src/routes/api/admin/exports
git commit -m "feat: add donor crm admin api"
```

Expected: commit succeeds with API files only.

---

## Task 6: Admin Supporter List UI

**Files:**

- Create: `src/components/admin/crm/api.ts`
- Create: `src/components/admin/crm/SupporterFormDialog.tsx`
- Create: `src/components/admin/crm/SupporterList.tsx`
- Create: `src/components/admin/crm/ExportBar.tsx`
- Create: `src/routes/admin/supporters.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/routes/admin/index.tsx`

- [ ] **Step 1: Create authenticated CRM fetch helper**

Create `src/components/admin/crm/api.ts`:

```ts
import { supabase } from "../../../lib/supabase";

export async function fetchAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("未登入");

  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : "API request failed");
  }

  return response.json() as Promise<T>;
}

export async function getAdminAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("未登入");
  return session.access_token;
}
```

- [ ] **Step 2: Create export bar**

Create `src/components/admin/crm/ExportBar.tsx`:

```tsx
import { Download } from "lucide-react";

import { getAdminAccessToken } from "./api";
import { Button } from "../../ui/button";

type ExportBarProps = {
  search: URLSearchParams;
};

async function downloadCsv(path: string, filename: string) {
  const token = await getAdminAccessToken();
  const response = await fetch(path, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Export failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportBar({ search }: ExportBarProps) {
  const query = search.toString();
  const suffix = query ? `?${query}` : "";

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => downloadCsv(`/api/admin/exports/supporters.csv${suffix}`, "supporters.csv")}
      >
        <Download className="h-4 w-4" />
        Supporters CSV
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => downloadCsv(`/api/admin/exports/donations.csv${suffix}`, "donations.csv")}
      >
        <Download className="h-4 w-4" />
        Donations CSV
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create supporter form dialog**

Create `src/components/admin/crm/SupporterFormDialog.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, UserPlus } from "lucide-react";
import { useState } from "react";

import type { SupporterDetail, SupporterSummary } from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { fetchAdminJson } from "./api";

type SupporterFormDialogProps =
  | { mode: "create" }
  | { mode: "edit"; supporter: SupporterDetail | SupporterSummary };

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function SupporterFormDialog(props: SupporterFormDialogProps) {
  const queryClient = useQueryClient();
  const existing = props.mode === "edit" ? props.supporter : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [language, setLanguage] = useState<"zh-HK" | "en">(existing?.language ?? "zh-HK");
  const [tags, setTags] = useState(existing?.tags.join(", ") ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        name,
        email,
        phone,
        language,
        tags: splitTags(tags),
        source: "admin_manual",
      });
      if (props.mode === "create") {
        return fetchAdminJson("/api/admin/supporters", { method: "POST", body });
      }
      return fetchAdminJson(`/api/admin/supporters/${props.supporter.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, phone, language, tags: splitTags(tags), deleted: false }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-supporters"] });
      if (props.mode === "edit") {
        queryClient.invalidateQueries({ queryKey: ["crm-supporter", props.supporter.id] });
      }
    },
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant={props.mode === "edit" ? "outline" : "default"}>
          {props.mode === "edit" ? <Edit className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {props.mode === "edit" ? "Edit supporter" : "New supporter"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.mode === "edit" ? "Edit supporter" : "New supporter"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Label>
            Name
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Label>
          <Label>
            Email
            <Input value={email} onChange={(event) => setEmail(event.target.value)} disabled={props.mode === "edit"} />
          </Label>
          <Label>
            Phone
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Label>
          <Label>
            Language
            <Select value={language} onValueChange={(value) => setLanguage(value as "zh-HK" | "en")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-HK">繁體中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label>
            Tags
            <Input value={tags} onChange={(event) => setTags(event.target.value)} />
          </Label>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Save supporter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create supporter list component**

Create `src/components/admin/crm/SupporterList.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { SupporterSummary } from "../../../lib/crm/types";
import { Input } from "../../ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { ExportBar } from "./ExportBar";
import { SupporterFormDialog } from "./SupporterFormDialog";
import { fetchAdminJson } from "./api";

type SupporterListResponse = {
  supporters: SupporterSummary[];
  total: number;
};

function formatHkd(amountCents: number | null) {
  if (amountCents === null) return "—";
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

export function SupporterList() {
  const [query, setQuery] = useState("");
  const search = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    params.set("role", "donor");
    return params;
  }, [query]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-supporters", search.toString()],
    queryFn: () => fetchAdminJson<SupporterListResponse>(`/api/admin/supporters?${search}`),
  });

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">Supporters</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Donor records, receipts, consent, and manual gifts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportBar search={search} />
          <SupporterFormDialog mode="create" />
        </div>
      </div>

      <label className="relative block max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search supporters"
          className="pl-9"
        />
      </label>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supporter</TableHead>
              <TableHead>Consent</TableHead>
              <TableHead>Lifetime</TableHead>
              <TableHead>Last gift</TableHead>
              <TableHead>Receipts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[var(--color-text-muted)]">Loading…</TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[var(--color-error)]">Could not load supporters</TableCell>
              </TableRow>
            )}
            {data?.supporters.map((supporter) => (
              <TableRow key={supporter.id}>
                <TableCell>
                  <Link to="/admin/supporters/$id" params={{ id: supporter.id }} className="font-semibold text-[var(--color-panel)] hover:text-[var(--color-primary)]">
                    {supporter.name}
                  </Link>
                  <div className="text-xs text-[var(--color-text-muted)]">{supporter.email}</div>
                </TableCell>
                <TableCell className="text-xs">
                  Email {supporter.emailConsent ?? "—"} · WhatsApp {supporter.whatsappConsent ?? "—"}
                </TableCell>
                <TableCell>{formatHkd(supporter.lifetimeAmountCents)}</TableCell>
                <TableCell>{formatHkd(supporter.lastGiftAmountCents)}</TableCell>
                <TableCell>{supporter.receiptNeeded ? "Needs review" : "Clear"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `/admin/supporters` route**

Create `src/routes/admin/supporters.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { SupporterList } from "../../components/admin/crm/SupporterList";
import { supabase } from "../../lib/supabase";

export const Route = createFileRoute("/admin/supporters")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: AdminSupportersPage,
});

function AdminSupportersPage() {
  return (
    <AdminLayout activeSection="supporters">
      <SupporterList />
    </AdminLayout>
  );
}
```

- [ ] **Step 6: Update admin layout navigation**

Modify `src/components/admin/AdminLayout.tsx`:

```tsx
type AdminSection = "cat" | "dog" | "sponsor" | "applications" | "payments" | "supporters";

interface AdminLayoutProps {
  children: React.ReactNode;
  activeSection: AdminSection;
}

const navItems: { section: AdminSection; label: string; to: string }[] = [
  { section: "cat", label: "🐱 貓貓", to: "/admin?section=cat" },
  { section: "dog", label: "🐶 狗狗", to: "/admin?section=dog" },
  { section: "sponsor", label: "💛 助養", to: "/admin?section=sponsor" },
  { section: "applications", label: "📋 申請", to: "/admin?section=applications" },
  { section: "payments", label: "收款", to: "/admin?section=payments" },
  { section: "supporters", label: "捐款人", to: "/admin/supporters" },
];
```

Keep the existing sidebar markup and active class logic.

- [ ] **Step 7: Add a supporter workspace link from payments**

In `src/routes/admin/index.tsx`, extend the payments header actions inside the `section === "payments"` branch:

```tsx
<Link
  to="/admin/supporters"
  className="rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
>
  捐款人紀錄
</Link>
```

Expected: the existing animal/application/payment UI remains unchanged except for the extra donor workspace link.

- [ ] **Step 8: Run UI type/build check**

Run:

```bash
bun run build
```

Expected: PASS and route tree includes `/admin/supporters`.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/components/admin/AdminLayout.tsx src/routes/admin/index.tsx src/components/admin/crm/api.ts src/components/admin/crm/ExportBar.tsx src/components/admin/crm/SupporterFormDialog.tsx src/components/admin/crm/SupporterList.tsx src/routes/admin/supporters.tsx
git commit -m "feat: add donor supporter list"
```

Expected: commit succeeds with supporter list UI files.

---

## Task 7: Supporter Detail, Consent, Manual Gift, And Receipt Actions

**Files:**

- Create: `src/components/admin/crm/SupporterDetail.tsx`
- Create: `src/components/admin/crm/SupporterTimeline.tsx`
- Create: `src/components/admin/crm/ConsentEditor.tsx`
- Create: `src/components/admin/crm/ManualDonationDialog.tsx`
- Create: `src/routes/admin/supporters/$id.tsx`
- Create: `src/routes/api/admin/receipts/$id/void.ts`
- Modify: `src/routes/api/admin/receipts.ts`
- Modify: `src/lib/donations/reconcile.server.ts`

- [ ] **Step 1: Create timeline component**

Create `src/components/admin/crm/SupporterTimeline.tsx`:

```tsx
import type { SupporterTimelineItem } from "../../../lib/crm/types";

type SupporterTimelineProps = {
  items: SupporterTimelineItem[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SupporterTimeline({ items }: SupporterTimelineProps) {
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-[var(--color-panel)]">{item.title}</div>
            <time className="text-xs text-[var(--color-text-muted)]">{formatDate(item.at)}</time>
          </div>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{item.description}</p>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 2: Create consent editor**

Create `src/components/admin/crm/ConsentEditor.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";

import type { ConsentStatus } from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import { fetchAdminJson } from "./api";

type ConsentEditorProps = {
  supporterId: string;
  emailConsent: ConsentStatus | null;
  whatsappConsent: ConsentStatus | null;
};

export function ConsentEditor({ supporterId, emailConsent, whatsappConsent }: ConsentEditorProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(emailConsent === "opt_in");
  const [whatsapp, setWhatsapp] = useState(whatsappConsent === "opt_in");

  const mutation = useMutation({
    mutationFn: () =>
      fetchAdminJson(`/api/admin/supporters/${supporterId}/consents`, {
        method: "POST",
        body: JSON.stringify({ source: "admin_manual", email, whatsapp }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] }),
  });

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-base font-bold text-[var(--color-panel)]">Consent</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Label className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] p-3">
          Email
          <Switch checked={email} onCheckedChange={setEmail} />
        </Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] p-3">
          WhatsApp
          <Switch checked={whatsapp} onCheckedChange={setWhatsapp} />
        </Label>
      </div>
      <Button type="button" className="mt-4" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        <Save className="h-4 w-4" />
        Save consent
      </Button>
    </section>
  );
}
```

- [ ] **Step 3: Create manual donation dialog**

Create `src/components/admin/crm/ManualDonationDialog.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign } from "lucide-react";
import { useState } from "react";

import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { fetchAdminJson } from "./api";

type ManualDonationDialogProps = {
  supporterId: string;
};

export function ManualDonationDialog({ supporterId }: ManualDonationDialogProps) {
  const queryClient = useQueryClient();
  const [amountHkd, setAmountHkd] = useState("100");
  const [purpose, setPurpose] = useState<"general" | "medical" | "sponsor">("general");
  const [method, setMethod] = useState<"manual" | "fps" | "payme">("manual");
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "succeeded">("pending");
  const [bankReference, setBankReference] = useState("");
  const [receiptRequested, setReceiptRequested] = useState(true);

  const mutation = useMutation({
    mutationFn: () =>
      fetchAdminJson("/api/admin/donations/manual", {
        method: "POST",
        body: JSON.stringify({
          supporterId,
          amountCents: Math.round(Number(amountHkd) * 100),
          currency: "HKD",
          purpose,
          method,
          paymentStatus,
          bankReference,
          receiptRequested,
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] }),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button">
          <CircleDollarSign className="h-4 w-4" />
          Manual gift
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual donation</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Label>
            Amount HKD
            <Input value={amountHkd} onChange={(event) => setAmountHkd(event.target.value)} inputMode="decimal" />
          </Label>
          <Label>
            Purpose
            <Select value={purpose} onValueChange={(value) => setPurpose(value as typeof purpose)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="medical">Medical</SelectItem>
                <SelectItem value="sponsor">Sponsor</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label>
            Method
            <Select value={method} onValueChange={(value) => setMethod(value as typeof method)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="fps">FPS</SelectItem>
                <SelectItem value="payme">PayMe</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label>
            Payment status
            <Select value={paymentStatus} onValueChange={(value) => setPaymentStatus(value as typeof paymentStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label>
            Bank reference
            <Input value={bankReference} onChange={(event) => setBankReference(event.target.value)} />
          </Label>
          <Label className="flex items-center justify-between">
            Receipt requested
            <Switch checked={receiptRequested} onCheckedChange={setReceiptRequested} />
          </Label>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Save gift
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create supporter detail component**

Create `src/components/admin/crm/SupporterDetail.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, ReceiptText } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { SupporterDetail as SupporterDetailData } from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { fetchAdminJson } from "./api";
import { ConsentEditor } from "./ConsentEditor";
import { ManualDonationDialog } from "./ManualDonationDialog";
import { SupporterFormDialog } from "./SupporterFormDialog";
import { SupporterTimeline } from "./SupporterTimeline";

type SupporterDetailProps = {
  supporterId: string;
};

function formatHkd(amountCents: number) {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

export function SupporterDetail({ supporterId }: SupporterDetailProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["crm-supporter", supporterId],
    queryFn: async () => {
      const response = await fetchAdminJson<{ supporter: SupporterDetailData }>(`/api/admin/supporters/${supporterId}`);
      return response.supporter;
    },
  });

  const receiptMutation = useMutation({
    mutationFn: (donationId: string) =>
      fetchAdminJson("/api/admin/receipts", {
        method: "POST",
        body: JSON.stringify({ donationId, supporterId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] }),
  });

  const voidReceiptMutation = useMutation({
    mutationFn: (receiptId: string) =>
      fetchAdminJson(`/api/admin/receipts/${receiptId}/void`, {
        method: "POST",
        body: JSON.stringify({ supporterId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] }),
  });

  if (isLoading) return <div className="p-6 text-[var(--color-text-muted)]">Loading…</div>;
  if (!data) return <div className="p-6 text-[var(--color-error)]">Supporter not found</div>;

  return (
    <div className="space-y-5 p-6">
      <Link to="/admin/supporters" className="inline-flex items-center gap-2 text-sm text-[var(--color-panel)] hover:text-[var(--color-primary)]">
        <ArrowLeft className="h-4 w-4" />
        Back to supporters
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">{data.name}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{data.email} · {data.phone ?? "No phone"}</p>
          <p className="text-sm text-[var(--color-text-muted)]">Language: {data.language} · Tags: {data.tags.join(", ") || "None"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SupporterFormDialog mode="edit" supporter={data} />
          <ManualDonationDialog supporterId={supporterId} />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-xs text-[var(--color-text-muted)]">Lifetime</div>
          <div className="text-xl font-bold text-[var(--color-panel)]">{formatHkd(data.lifetimeAmountCents)}</div>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-xs text-[var(--color-text-muted)]">Donations</div>
          <div className="text-xl font-bold text-[var(--color-panel)]">{data.donationCount}</div>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-xs text-[var(--color-text-muted)]">Receipts</div>
          <div className="text-xl font-bold text-[var(--color-panel)]">{data.receipts.length}</div>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-xs text-[var(--color-text-muted)]">Pending payments</div>
          <div className="text-xl font-bold text-[var(--color-panel)]">{data.payments.filter((payment) => payment.status === "pending").length}</div>
        </div>
      </div>

      <ConsentEditor supporterId={supporterId} emailConsent={data.emailConsent} whatsappConsent={data.whatsappConsent} />

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-base font-bold text-[var(--color-panel)]">Donations</h2>
        <div className="mt-3 divide-y divide-[var(--color-divider)]">
          {data.donations.map((donation) => (
            <div key={donation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium">{formatHkd(donation.amountCents)} · {donation.purpose}</div>
                <div className="text-xs text-[var(--color-text-muted)]">{donation.status} · {donation.method}</div>
              </div>
              {donation.status === "succeeded" && donation.receiptRequested && (
                <Button type="button" variant="outline" size="sm" onClick={() => receiptMutation.mutate(donation.id)}>
                  <ReceiptText className="h-4 w-4" />
                  Issue receipt
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-base font-bold text-[var(--color-panel)]">Receipts</h2>
        <div className="mt-3 divide-y divide-[var(--color-divider)]">
          {data.receipts.map((receipt) => (
            <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium">{receipt.receiptNo}</div>
                <div className="text-xs text-[var(--color-text-muted)]">{receipt.status} · {formatHkd(receipt.totalAmountCents)}</div>
              </div>
              {receipt.status === "issued" && (
                <Button type="button" variant="outline" size="sm" onClick={() => voidReceiptMutation.mutate(receipt.id)}>
                  <Ban className="h-4 w-4" />
                  Void
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold text-[var(--color-panel)]">Timeline</h2>
        <SupporterTimeline items={data.timeline} />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Create `/admin/supporters/$id` route**

Create `src/routes/admin/supporters/$id.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { SupporterDetail } from "../../../components/admin/crm/SupporterDetail";
import { supabase } from "../../../lib/supabase";

export const Route = createFileRoute("/admin/supporters/$id")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: AdminSupporterDetailPage,
});

function AdminSupporterDetailPage() {
  const { id } = Route.useParams();
  return (
    <AdminLayout activeSection="supporters">
      <SupporterDetail supporterId={id} />
    </AdminLayout>
  );
}
```

- [ ] **Step 6: Extend receipt endpoint for supporter detail context**

Modify `src/routes/api/admin/receipts.ts` so the request schema accepts an optional supporter id:

```ts
const issueReceiptSchema = z.object({
  donationId: z.string().uuid(),
  supporterId: z.string().uuid().optional(),
});
```

Pass `body.supporterId` as context to the receipt helper:

```ts
return Response.json(
  await issueReceiptForDonation(client, body.donationId, admin.authUserId, {
    supporterId: body.supporterId,
  }),
);
```

- [ ] **Step 7: Add receipt void helper**

Modify `src/lib/donations/reconcile.server.ts` so `issueReceiptForDonation` accepts audit context and add the void helper:

```ts
export async function issueReceiptForDonation(
  client: SupabaseClient,
  donationId: string,
  actorUserId: string,
  context: { supporterId?: string } = {},
) {
  const { data, error } = await client
    .from("payment")
    .select(
      "id,provider,provider_ref,amount_cents,status,donation:donation_id(id,amount_cents,receipt_requested,status,supporter_id,supporter:supporter_id(id,name,email,language))",
    )
    .eq("donation_id", donationId)
    .eq("status", "succeeded")
    .single();
  if (error) throw error;

  const receiptNo = await issueReceiptIfNeeded(client, data as unknown as PaymentWithDonation);
  await client.from("audit_log").insert({
    actor_user_id: actorUserId,
    action: "receipt.issue",
    entity: "donation",
    entity_id: donationId,
    detail: { receiptNo, supporterId: context.supporterId ?? null },
  });
  return { receiptNo };
}

export async function voidReceipt(
  client: SupabaseClient,
  receiptId: string,
  actorUserId: string,
  context: { supporterId?: string } = {},
) {
  const voidedAt = new Date().toISOString();
  const { error } = await client
    .from("receipt")
    .update({
      status: "void",
      voided_at: voidedAt,
      voided_by: actorUserId,
    })
    .eq("id", receiptId)
    .eq("status", "issued");
  if (error) throw error;

  await client.from("audit_log").insert({
    actor_user_id: actorUserId,
    action: "receipt.void",
    entity: "receipt",
    entity_id: receiptId,
    detail: { voidedAt, supporterId: context.supporterId ?? null },
  });

  return { ok: true };
}
```

- [ ] **Step 8: Create receipt void route**

Create `src/routes/api/admin/receipts/$id/void.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { voidReceipt } from "../../../../../lib/donations/reconcile.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";

const voidReceiptSchema = z.object({
  supporterId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/api/admin/receipts/$id/void")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const client = createSupabaseServiceClient();
          const admin = await requireAdmin(request, ["treasurer", "admin"], client);
          const body = voidReceiptSchema.parse(await request.json().catch(() => ({})));
          return Response.json(
            await voidReceipt(client, params.id, admin.authUserId, {
              supporterId: body.supporterId,
            }),
          );
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof z.ZodError) {
            return Response.json({ error: "Invalid void receipt request" }, { status: 400 });
          }
          console.error(error);
          return Response.json({ error: "Could not void receipt" }, { status: 500 });
        }
      },
    },
  },
});
```

- [ ] **Step 9: Run build**

Run:

```bash
bun run build
```

Expected: PASS and route tree includes `/admin/supporters/$id`.

- [ ] **Step 10: Commit**

Run:

```bash
git add src/components/admin/crm/SupporterDetail.tsx src/components/admin/crm/SupporterTimeline.tsx src/components/admin/crm/ConsentEditor.tsx src/components/admin/crm/ManualDonationDialog.tsx src/routes/admin/supporters src/routes/api/admin/receipts.ts src/routes/api/admin/receipts src/lib/donations/reconcile.server.ts
git commit -m "feat: add donor supporter detail"
```

Expected: commit succeeds with supporter detail UI and receipt-context changes.

---

## Task 8: Verification, Polish, And PR Prep

**Files:**

- Review: `src/lib/crm/**`
- Review: `src/routes/api/admin/**`
- Review: `src/components/admin/crm/**`
- Review: `src/routes/admin/supporters.tsx`
- Review: `src/routes/admin/supporters/$id.tsx`
- Review: `src/components/admin/AdminLayout.tsx`

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun test src/lib/crm src/lib/donations
```

Expected: all tests PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun run test
```

Expected: all tests PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
bun run lint
```

Expected: exit code 0. Existing fast-refresh warnings may remain if they are still present from the baseline; do not introduce new lint errors.

- [ ] **Step 4: Run production build**

Run:

```bash
bun run build
```

Expected: build completes. If the build reaches Vercel publish gating and hangs after route generation, record the last successful build lines in the PR notes and confirm `src/routeTree.gen.ts` contains the CRM routes.

- [ ] **Step 5: Manual smoke check in dev**

Run:

```bash
bun run dev
```

Open the printed localhost URL and verify:

```txt
/admin/supporters loads after login.
Supporter search returns existing donation MVP supporters.
Opening a supporter shows contact, lifetime giving, donations, receipts, consent, and timeline.
Consent editor appends rows and refreshes the detail page.
Manual gift creates a donation and payment, then refreshes the detail page.
Issue receipt action still works for eligible succeeded donations.
Supporters CSV downloads with supporter columns.
Donations CSV downloads with donation and receipt columns.
Animal, application, and payments admin screens still load.
```

- [ ] **Step 6: Inspect audit rows**

Using Supabase SQL editor or local SQL connection, verify audit actions:

```sql
select action, entity, entity_id, detail, created_at
from public.audit_log
where action in (
  'supporter.create_or_update',
  'supporter.update',
  'consent.append',
  'donation.manual_create',
  'export.supporters',
  'export.donations',
  'receipt.issue',
  'receipt.void'
)
order by created_at desc
limit 20;
```

Expected: rows exist for the smoke actions performed, including `receipt.void` after voiding an issued receipt.

- [ ] **Step 7: Confirm no unrelated files are staged**

Run:

```bash
git status --short
```

Expected: only donor-ops CRM files are modified or untracked. Do not stage `.codex/` or `AGENTS.md`.

- [ ] **Step 8: Final commit for polish fixes**

If verification required small fixes, commit them:

```bash
git add src/lib/crm src/routes/api/admin src/components/admin/crm src/routes/admin src/components/admin/AdminLayout.tsx src/lib/donations/reconcile.server.ts
git commit -m "fix: polish donor crm workflows"
```

Expected: commit succeeds only when there were verification fixes.

- [ ] **Step 9: Prepare PR summary**

Use this PR body:

```markdown
## Summary
- Adds treasurer/admin donor CRM APIs for supporter search/detail, consent append, manual gifts, and audited CSV exports.
- Adds `/admin/supporters` and `/admin/supporters/:id` donor ops UI while keeping existing animal/application/payment admin areas intact.
- Adds CRM validation, timeline, consent, CSV, manual donation, and service tests.

## Verification
- bun test src/lib/crm src/lib/donations
- bun run test
- bun run lint
- bun run build

## Manual Smoke
- Supporter search/detail
- Consent append
- Manual donation entry
- Receipt issue from supporter detail
- Supporter and donation CSV export
- Existing admin animal/application/payment screens
```

Expected: PR body accurately reflects the commands run and any known build caveat.
