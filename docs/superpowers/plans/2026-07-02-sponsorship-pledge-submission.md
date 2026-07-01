# Public Sponsorship Pledge Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `開始助養` into a real public sponsorship pledge flow — a visitor picks a monthly tier, provides contact info, optionally uploads payment proof, and submits; the server creates the pledge and emails a bilingual confirmation with a reference.

**Architecture:** Mirror the existing public adoption submission pipeline (`src/lib/publicAdoption/`) file-for-file in a new `src/lib/sponsorship/` module: zod schemas + insert mappers, a transactional persist function with orphan cleanup, a bilingual email template, and a thin API route. Reuse the generic `public_status_token`, Turnstile, rate-limit, and email-config helpers directly. A new lightweight client wizard (`PledgeWizard`) reads the existing sponsorship shortlist and posts to the new endpoint.

**Tech Stack:** TypeScript, TanStack Start (file routes + server handlers), React 19, Zod, Supabase (Postgres + Storage), Resend, Bun test runner.

Spec: `docs/superpowers/specs/2026-07-02-sponsorship-pledge-submission-design.md`.

---

## Plan-Time Refinements (vs. the spec)

Two corrections surfaced while grounding this plan in the actual adoption code, both consistent with "mirror adoption exactly":

1. **No stored `reference` column.** Adoption never stores a reference in `adoption_applications` — it derives `APP-<first 8 hex of id>` on the fly (`referenceForApplication`). The pledge table follows suit: no `reference` column, no unique-at-insert-time chicken-and-egg problem. `referenceForPledge(pledgeId)` derives it the same way.
2. **`public_status_token.entity_type` must be widened.** The Phase 1 migration's CHECK constraint only allows `'adoption_application'`. This plan's migration must alter that constraint to also allow `'sponsorship_pledge'`, or every token insert for a pledge will fail.
3. **The confirmation email does not link to a status page.** Per the approved "email + reference now, status page in D" decision, no working status page exists yet. The email includes the reference (and payment instructions when `pending_payment`), but omits a status link — a broken link would be worse than no link. The status token is still generated and returned from `persistSponsorshipPledge` for Slice D to use later.

---

## File Structure

- `supabase/migrations/20260702130000_sponsorship_pledge_phase_2.sql` — **Create.** 3 tables, private storage bucket, RLS, widened `public_status_token` check.
- `src/lib/supabaseMigrations.test.ts` — **Modify.** Add one migration-safety test case.
- `src/lib/sponsorship/schemas.ts` — **Create.** Zod schemas, tier amount resolution, proof descriptor validation, insert mappers.
- `src/lib/sponsorship/schemas.test.ts` — **Create.**
- `src/lib/sponsorship/emailTemplates.server.ts` — **Create.** Bilingual confirmation email.
- `src/lib/sponsorship/emailTemplates.server.test.ts` — **Create.**
- `src/lib/sponsorship/submission.server.ts` — **Create.** Header validation, multipart parsing, transactional persist, email send.
- `src/lib/sponsorship/submission.server.test.ts` — **Create.**
- `src/lib/sponsorship/draft.ts` — **Create.** Thin re-export of the generic draft helpers with a pledge-specific storage key.
- `src/routes/api/sponsorships/pledges.ts` — **Create.** POST handler.
- `src/components/site/sponsorship/PledgeWizard.tsx` — **Create.** 5-step wizard (plain `useState`, mirroring `donate.tsx`'s style rather than `ApplicationWizard`'s react-hook-form — this form is simpler and has no per-file-category photo grid).
- `src/routes/sponsors_.pledge.tsx` — **Create.** Route wrapper (trailing-underscore convention, matching the existing sibling `sponsors_.$id.tsx`, so it doesn't nest under `sponsors.tsx`'s layout).
- `src/components/site/ShortlistTray.tsx` — **Modify.** `開始助養` now links to `/sponsors/pledge`.

---

## Task 1: Migration — pledge tables, storage bucket, RLS

**Files:**
- Create: `supabase/migrations/20260702130000_sponsorship_pledge_phase_2.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Write the failing migration-safety test**

Add this test case at the end of the `describe("supabase migration safety", ...)` block in `src/lib/supabaseMigrations.test.ts` (immediately before the final closing `});` of the describe block):

```ts
  test("adds sponsorship pledge tables with private proof storage and widens status token entity types", () => {
    const sql = readMigrationBySuffix("_sponsorship_pledge_phase_2.sql");

    for (const table of ["sponsorship_pledge", "sponsorship_preference", "sponsorship_payment_proof"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(
        `grant select, insert, update, delete on public.${table} to service_role`,
      );
      expect(sql).toContain(`revoke all on public.${table} from anon`);
    }

    expect(sql).not.toContain("reference text not null unique");
    expect(sql).toContain(
      "status text not null default 'pending_payment' check (status in ('pending_payment', 'provisional', 'active', 'needs_followup', 'cancelled'))",
    );
    expect(sql).toContain("drop constraint if exists public_status_token_entity_type_check");
    expect(sql).toContain(
      "add constraint public_status_token_entity_type_check check (entity_type in ('adoption_application', 'sponsorship_pledge'))",
    );
    expect(sql).toContain("sponsorship-payment-proof");
    expect(sql).toContain("private.has_admin_role(array['staff', 'admin'])");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/supabaseMigrations.test.ts`
Expected: FAIL — `Migration not found: _sponsorship_pledge_phase_2.sql`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260702130000_sponsorship_pledge_phase_2.sql`:

```sql
create table if not exists public.sponsorship_pledge (
  id uuid primary key default gen_random_uuid(),
  supporter_id uuid not null references public.supporter(id),
  monthly_tier text not null check (monthly_tier in ('100', '300', '500', 'custom')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'HKD',
  language text not null check (language in ('zh-HK', 'en')),
  notes text,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'provisional', 'active', 'needs_followup', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sponsorship_preference (
  id uuid primary key default gen_random_uuid(),
  pledge_id uuid not null references public.sponsorship_pledge(id) on delete cascade,
  sponsor_animal_id uuid references public.animals(id) on delete set null,
  rank integer not null check (rank between 1 and 10),
  animal_name_snapshot text not null,
  animal_type_snapshot text not null check (animal_type_snapshot in ('sponsor')),
  created_at timestamptz not null default now(),
  unique (pledge_id, rank),
  unique (pledge_id, sponsor_animal_id)
);

create table if not exists public.sponsorship_payment_proof (
  id uuid primary key default gen_random_uuid(),
  pledge_id uuid not null unique references public.sponsorship_pledge(id) on delete cascade,
  storage_bucket text not null default 'sponsorship-payment-proof' check (storage_bucket = 'sponsorship-payment-proof'),
  storage_path text not null,
  file_name text not null,
  file_type text not null check (file_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size integer not null check (file_size > 0 and file_size <= 8388608),
  payment_method text not null check (payment_method in ('fps', 'bank_transfer', 'payme', 'paypal', 'give_asia')),
  reference text,
  amount_cents integer not null check (amount_cents > 0),
  payment_date date not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

do $$
begin
  execute 'drop trigger if exists set_updated_at on public.sponsorship_pledge';
  execute 'create trigger set_updated_at before update on public.sponsorship_pledge for each row execute function public.set_updated_at()';
end $$;

create index if not exists sponsorship_pledge_supporter_idx
  on public.sponsorship_pledge (supporter_id);

create index if not exists sponsorship_pledge_status_idx
  on public.sponsorship_pledge (status);

create index if not exists sponsorship_preference_pledge_rank_idx
  on public.sponsorship_preference (pledge_id, rank);

alter table public.sponsorship_pledge enable row level security;
alter table public.sponsorship_preference enable row level security;
alter table public.sponsorship_payment_proof enable row level security;

grant select on public.sponsorship_pledge to authenticated;
grant select on public.sponsorship_preference to authenticated;
grant select on public.sponsorship_payment_proof to authenticated;

grant select, insert, update, delete on public.sponsorship_pledge to service_role;
grant select, insert, update, delete on public.sponsorship_preference to service_role;
grant select, insert, update, delete on public.sponsorship_payment_proof to service_role;

revoke all on public.sponsorship_pledge from anon;
revoke all on public.sponsorship_preference from anon;
revoke all on public.sponsorship_payment_proof from anon;

create policy "staff can read sponsorship pledges"
  on public.sponsorship_pledge for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read sponsorship preferences"
  on public.sponsorship_preference for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can read sponsorship payment proofs"
  on public.sponsorship_payment_proof for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sponsorship-payment-proof',
  'sponsorship-payment-proof',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "staff can read sponsorship payment proof files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sponsorship-payment-proof'
    and private.has_admin_role(array['staff', 'admin'])
  );

alter table public.public_status_token
  drop constraint if exists public_status_token_entity_type_check;

alter table public.public_status_token
  add constraint public_status_token_entity_type_check
  check (entity_type in ('adoption_application', 'sponsorship_pledge'));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/supabaseMigrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260702130000_sponsorship_pledge_phase_2.sql src/lib/supabaseMigrations.test.ts
git commit -m "feat: add sponsorship pledge tables, private proof storage, and RLS"
```

---

## Task 2: `schemas.ts` — validation, tier amounts, insert mappers

**Files:**
- Create: `src/lib/sponsorship/schemas.ts`
- Test: `src/lib/sponsorship/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sponsorship/schemas.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  SPONSORSHIP_TIER_AMOUNTS_CENTS,
  resolveTierAmountCents,
  sponsorshipPledgeSubmissionSchema,
  toPaymentProofInsert,
  toPledgeInsert,
  toPreferenceInserts,
  validateProofDescriptor,
} from "./schemas";

const animalA = "11111111-2222-4333-8444-555555555555";
const animalB = "22222222-3333-4333-8444-555555555555";

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    language: "zh-HK",
    monthlyTier: "300",
    animalPreferences: [
      { rank: 1, animalId: animalA, animalName: "白雪", animalType: "sponsor" },
    ],
    contact: { supporterName: "陳小姐", email: "chan@example.com", phone: "91234567" },
    consents: { email: true, whatsapp: false },
    terms: { agreed: true },
    ...overrides,
  };
}

describe("sponsorshipPledgeSubmissionSchema", () => {
  test("parses a valid preset-tier payload without proof", () => {
    const result = sponsorshipPledgeSubmissionSchema.parse(basePayload());
    expect(result.monthlyTier).toBe("300");
    expect(result.animalPreferences).toHaveLength(1);
  });

  test("requires a positive customAmountCents when monthlyTier is custom", () => {
    expect(() =>
      sponsorshipPledgeSubmissionSchema.parse(basePayload({ monthlyTier: "custom" })),
    ).toThrow();

    const result = sponsorshipPledgeSubmissionSchema.parse(
      basePayload({ monthlyTier: "custom", customAmountCents: 20000 }),
    );
    expect(result.customAmountCents).toBe(20000);
  });

  test("rejects customAmountCents on a preset tier", () => {
    expect(() =>
      sponsorshipPledgeSubmissionSchema.parse(
        basePayload({ monthlyTier: "300", customAmountCents: 20000 }),
      ),
    ).toThrow();
  });

  test("rejects duplicate ranks and duplicate animal ids", () => {
    expect(() =>
      sponsorshipPledgeSubmissionSchema.parse(
        basePayload({
          animalPreferences: [
            { rank: 1, animalId: animalA, animalName: "白雪", animalType: "sponsor" },
            { rank: 1, animalId: animalB, animalName: "小黑", animalType: "sponsor" },
          ],
        }),
      ),
    ).toThrow();

    expect(() =>
      sponsorshipPledgeSubmissionSchema.parse(
        basePayload({
          animalPreferences: [
            { rank: 1, animalId: animalA, animalName: "白雪", animalType: "sponsor" },
            { rank: 2, animalId: animalA, animalName: "白雪", animalType: "sponsor" },
          ],
        }),
      ),
    ).toThrow();
  });

  test("rejects more than 10 animal preferences", () => {
    const tooMany = Array.from({ length: 11 }, (_, index) => ({
      rank: index + 1,
      animalId: `33333333-0000-4000-8000-${String(index).padStart(12, "0")}`,
      animalName: `Sponsor ${index}`,
      animalType: "sponsor",
    }));
    expect(() =>
      sponsorshipPledgeSubmissionSchema.parse(basePayload({ animalPreferences: tooMany })),
    ).toThrow();
  });

  test("sorts animal preferences by rank", () => {
    const result = sponsorshipPledgeSubmissionSchema.parse(
      basePayload({
        animalPreferences: [
          { rank: 2, animalId: animalB, animalName: "小黑", animalType: "sponsor" },
          { rank: 1, animalId: animalA, animalName: "白雪", animalType: "sponsor" },
        ],
      }),
    );
    expect(result.animalPreferences.map((a) => a.animalId)).toEqual([animalA, animalB]);
  });
});

describe("resolveTierAmountCents", () => {
  test("resolves preset tier amounts", () => {
    expect(resolveTierAmountCents({ monthlyTier: "100", customAmountCents: undefined })).toBe(
      SPONSORSHIP_TIER_AMOUNTS_CENTS["100"],
    );
    expect(resolveTierAmountCents({ monthlyTier: "500", customAmountCents: undefined })).toBe(
      SPONSORSHIP_TIER_AMOUNTS_CENTS["500"],
    );
  });

  test("resolves the custom amount when tier is custom", () => {
    expect(resolveTierAmountCents({ monthlyTier: "custom", customAmountCents: 45000 })).toBe(
      45000,
    );
  });
});

describe("validateProofDescriptor", () => {
  test("accepts a valid jpeg descriptor", () => {
    const descriptor = validateProofDescriptor({
      fileName: "proof.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
    });
    expect(descriptor.mimeType).toBe("image/jpeg");
  });

  test("rejects an oversized file", () => {
    expect(() =>
      validateProofDescriptor({
        fileName: "proof.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 9 * 1024 * 1024,
      }),
    ).toThrow();
  });

  test("rejects a disallowed mime type", () => {
    expect(() =>
      validateProofDescriptor({
        fileName: "proof.gif",
        mimeType: "image/gif",
        sizeBytes: 1024,
      }),
    ).toThrow();
  });
});

describe("insert mappers", () => {
  const parsed = sponsorshipPledgeSubmissionSchema.parse(basePayload());

  test("toPledgeInsert maps camelCase to snake_case with the resolved amount", () => {
    expect(toPledgeInsert("supporter-1", "pending_payment", parsed)).toEqual({
      supporter_id: "supporter-1",
      monthly_tier: "300",
      amount_cents: 30000,
      currency: "HKD",
      language: "zh-HK",
      notes: null,
      status: "pending_payment",
    });
  });

  test("toPreferenceInserts maps ranked animals", () => {
    expect(toPreferenceInserts("pledge-1", parsed)).toEqual([
      {
        pledge_id: "pledge-1",
        sponsor_animal_id: animalA,
        rank: 1,
        animal_name_snapshot: "白雪",
        animal_type_snapshot: "sponsor",
      },
    ]);
  });

  test("toPaymentProofInsert maps descriptor and metadata", () => {
    const descriptor = validateProofDescriptor({
      fileName: "proof.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 2048,
    });
    const metadata = {
      paymentMethod: "fps" as const,
      reference: "REF123",
      amountCents: 30000,
      paymentDate: "2026-07-01",
    };
    expect(toPaymentProofInsert("pledge-1", "pledge-1/proof.jpg", descriptor, metadata)).toEqual({
      pledge_id: "pledge-1",
      storage_path: "pledge-1/proof.jpg",
      file_name: "proof.jpg",
      file_type: "image/jpeg",
      file_size: 2048,
      payment_method: "fps",
      reference: "REF123",
      amount_cents: 30000,
      payment_date: "2026-07-01",
      review_status: "pending",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/sponsorship/schemas.test.ts`
Expected: FAIL — `Cannot find module './schemas'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/sponsorship/schemas.ts`:

```ts
import { z } from "zod";

export const SPONSORSHIP_TERMS_VERSION = "sponsorship-terms-2026-07";
export const MAX_SPONSORSHIP_PREFERENCES = 10;
export const MAX_PROOF_BYTES = 8 * 1024 * 1024;
export const PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const SPONSORSHIP_TIER_AMOUNTS_CENTS: Record<"100" | "300" | "500", number> = {
  "100": 10_000,
  "300": 30_000,
  "500": 50_000,
};

const trimmed = z.string().trim();
const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || null);

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const isoDate = trimmed.refine(isIsoDate, "Invalid date");

export const sponsorshipLanguageSchema = z.enum(["zh-HK", "en"]);
export const monthlyTierSchema = z.enum(["100", "300", "500", "custom"]);
export const paymentMethodSchema = z.enum([
  "fps",
  "bank_transfer",
  "payme",
  "paypal",
  "give_asia",
]);

export const sponsorshipAnimalPreferenceSchema = z.object({
  rank: z.number().int().min(1).max(MAX_SPONSORSHIP_PREFERENCES),
  animalId: z.string().uuid(),
  animalName: trimmed.min(1),
  animalType: z.literal("sponsor"),
});

export const sponsorshipPaymentProofMetadataSchema = z.object({
  paymentMethod: paymentMethodSchema,
  reference: optionalTrimmed,
  amountCents: z.number().int().positive(),
  paymentDate: isoDate,
});

export type SponsorshipPaymentProofMetadata = z.infer<
  typeof sponsorshipPaymentProofMetadataSchema
>;

export const sponsorshipPledgeSubmissionSchema = z
  .object({
    language: sponsorshipLanguageSchema,
    monthlyTier: monthlyTierSchema,
    customAmountCents: z.number().int().positive().optional(),
    animalPreferences: z
      .array(sponsorshipAnimalPreferenceSchema)
      .min(1)
      .max(MAX_SPONSORSHIP_PREFERENCES),
    contact: z.object({
      supporterName: trimmed.min(1),
      email: trimmed
        .email()
        .transform((email) => email.toLowerCase()),
      phone: optionalTrimmed,
    }),
    consents: z.object({
      email: z.boolean(),
      whatsapp: z.boolean(),
    }),
    notes: optionalTrimmed,
    proofMetadata: sponsorshipPaymentProofMetadataSchema.optional(),
    terms: z.object({
      agreed: z.literal(true),
      version: z.string().min(1).default(SPONSORSHIP_TERMS_VERSION),
    }),
  })
  .superRefine((value, context) => {
    const ranks = new Set(value.animalPreferences.map((animal) => animal.rank));
    if (ranks.size !== value.animalPreferences.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animalPreferences"],
        message: "Animal preference ranks must be unique",
      });
    }

    const animalIds = new Set(value.animalPreferences.map((animal) => animal.animalId));
    if (animalIds.size !== value.animalPreferences.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animalPreferences"],
        message: "Each animal can only appear once",
      });
    }

    if (value.monthlyTier === "custom") {
      if (!value.customAmountCents || value.customAmountCents <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customAmountCents"],
          message: "Custom amount must be a positive number of cents",
        });
      }
    } else if (value.customAmountCents !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customAmountCents"],
        message: "Custom amount must not be set for a preset tier",
      });
    }
  })
  .transform((value) => ({
    ...value,
    animalPreferences: [...value.animalPreferences].sort((left, right) => left.rank - right.rank),
  }));

export type SponsorshipPledgeSubmission = z.infer<typeof sponsorshipPledgeSubmissionSchema>;
export type SponsorshipPledgeStatus =
  | "pending_payment"
  | "provisional"
  | "active"
  | "needs_followup"
  | "cancelled";

export type SponsorshipProofDescriptor = {
  fileName: string;
  mimeType: (typeof PROOF_MIME_TYPES)[number];
  sizeBytes: number;
};

export function validateProofDescriptor(input: {
  fileName: unknown;
  mimeType: unknown;
  sizeBytes: unknown;
}): SponsorshipProofDescriptor {
  return z
    .object({
      fileName: trimmed.min(1).max(180),
      mimeType: z.enum(PROOF_MIME_TYPES),
      sizeBytes: z.number().int().positive().max(MAX_PROOF_BYTES),
    })
    .parse(input);
}

export function resolveTierAmountCents(
  input: Pick<SponsorshipPledgeSubmission, "monthlyTier" | "customAmountCents">,
): number {
  if (input.monthlyTier === "custom") return input.customAmountCents!;
  return SPONSORSHIP_TIER_AMOUNTS_CENTS[input.monthlyTier];
}

export function toPledgeInsert(
  supporterId: string,
  status: SponsorshipPledgeStatus,
  input: SponsorshipPledgeSubmission,
) {
  return {
    supporter_id: supporterId,
    monthly_tier: input.monthlyTier,
    amount_cents: resolveTierAmountCents(input),
    currency: "HKD",
    language: input.language,
    notes: input.notes,
    status,
  };
}

export function toPreferenceInserts(pledgeId: string, input: SponsorshipPledgeSubmission) {
  return input.animalPreferences.map((animal) => ({
    pledge_id: pledgeId,
    sponsor_animal_id: animal.animalId,
    rank: animal.rank,
    animal_name_snapshot: animal.animalName,
    animal_type_snapshot: animal.animalType,
  }));
}

export function toPaymentProofInsert(
  pledgeId: string,
  storagePath: string,
  descriptor: SponsorshipProofDescriptor,
  metadata: SponsorshipPaymentProofMetadata,
) {
  return {
    pledge_id: pledgeId,
    storage_path: storagePath,
    file_name: descriptor.fileName,
    file_type: descriptor.mimeType,
    file_size: descriptor.sizeBytes,
    payment_method: metadata.paymentMethod,
    reference: metadata.reference,
    amount_cents: metadata.amountCents,
    payment_date: metadata.paymentDate,
    review_status: "pending",
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/sponsorship/schemas.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Lint**

Run: `bunx eslint src/lib/sponsorship/schemas.ts src/lib/sponsorship/schemas.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sponsorship/schemas.ts src/lib/sponsorship/schemas.test.ts
git commit -m "feat: add sponsorship pledge validation schemas and insert mappers"
```

---

## Task 3: `emailTemplates.server.ts` — bilingual confirmation email

**Files:**
- Create: `src/lib/sponsorship/emailTemplates.server.ts`
- Test: `src/lib/sponsorship/emailTemplates.server.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sponsorship/emailTemplates.server.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { renderPledgeConfirmationEmail } from "./emailTemplates.server";

describe("renderPledgeConfirmationEmail", () => {
  test("renders zh-HK pending_payment email with payment instructions", () => {
    const email = renderPledgeConfirmationEmail({
      language: "zh-HK",
      supporterName: "陳小姐",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      status: "pending_payment",
    });
    expect(email.subject).toContain("SP-ABCDEF12");
    expect(email.html).toContain("陳小姐");
    expect(email.html).toContain("SP-ABCDEF12");
    expect(email.html).toContain("HK$300");
    expect(email.html).toContain("轉數快");
  });

  test("renders en provisional email without payment instructions", () => {
    const email = renderPledgeConfirmationEmail({
      language: "en",
      supporterName: "Ms. Chan",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      status: "provisional",
    });
    expect(email.subject).toContain("SP-ABCDEF12");
    expect(email.html).toContain("Ms. Chan");
    expect(email.html).not.toContain("FPS");
  });

  test("HTML-escapes the supporter name", () => {
    const email = renderPledgeConfirmationEmail({
      language: "en",
      supporterName: "<script>alert(1)</script>",
      reference: "SP-ABCDEF12",
      amountCents: 10000,
      status: "pending_payment",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/sponsorship/emailTemplates.server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/sponsorship/emailTemplates.server.ts`:

```ts
import { centsToHkd } from "../donations/domain";

type PledgeConfirmationEmailInput = {
  language: "zh-HK" | "en";
  supporterName: string;
  reference: string;
  amountCents: number;
  status: "pending_payment" | "provisional";
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const PAYMENT_METHODS_ZH = [
  ["轉數快 FPS", "9864 1089"],
  ["銀行轉帳", "匯豐銀行 012-345-678901"],
  ["PayMe", "@hkscda"],
  ["PayPal", "paypal@hkscda.com"],
  ["Give.asia", "give.asia/hkscda"],
] as const;

const PAYMENT_METHODS_EN = [
  ["FPS", "9864 1089"],
  ["Bank Transfer", "HSBC 012-345-678901"],
  ["PayMe", "@hkscda"],
  ["PayPal", "paypal@hkscda.com"],
  ["Give.asia", "give.asia/hkscda"],
] as const;

export function renderPledgeConfirmationEmail(input: PledgeConfirmationEmailInput) {
  const supporterName = escapeHtml(input.supporterName);
  const reference = escapeHtml(input.reference);
  const amount = centsToHkd(input.amountCents);

  if (input.language === "en") {
    const paymentBlock =
      input.status === "pending_payment"
        ? [
            "<p>Please complete your first monthly payment using one of the following methods, and quote your reference:</p>",
            "<ul>",
            ...PAYMENT_METHODS_EN.map(
              ([label, value]) => `<li>${escapeHtml(label)}: ${escapeHtml(value)}</li>`,
            ),
            "</ul>",
          ].join("")
        : "<p>We have received your payment proof and will confirm your sponsorship shortly.</p>";

    return {
      subject: `HKSCDA received your sponsorship pledge ${input.reference}`,
      html: [
        `<p>Dear ${supporterName},</p>`,
        `<p>Thank you for pledging <strong>${amount}/month</strong>. Your reference is <strong>${reference}</strong>.</p>`,
        paymentBlock,
        "<p>HKSCDA Sponsorship Team</p>",
      ].join(""),
    };
  }

  const paymentBlockZh =
    input.status === "pending_payment"
      ? [
          "<p>請使用以下其中一種方式完成首月付款，並註明您的參考編號：</p>",
          "<ul>",
          ...PAYMENT_METHODS_ZH.map(
            ([label, value]) => `<li>${escapeHtml(label)}：${escapeHtml(value)}</li>`,
          ),
          "</ul>",
        ].join("")
      : "<p>我們已收到您的付款證明，將盡快為您確認助養資格。</p>";

  return {
    subject: `HKSCDA 已收到您的助養承諾 ${input.reference}`,
    html: [
      `<p>${supporterName} 您好：</p>`,
      `<p>多謝您承諾每月助養 <strong>${amount}</strong>，參考編號為 <strong>${reference}</strong>。</p>`,
      paymentBlockZh,
      "<p>HKSCDA 助養團隊</p>",
    ].join(""),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/sponsorship/emailTemplates.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
bunx eslint src/lib/sponsorship/emailTemplates.server.ts src/lib/sponsorship/emailTemplates.server.test.ts
git add src/lib/sponsorship/emailTemplates.server.ts src/lib/sponsorship/emailTemplates.server.test.ts
git commit -m "feat: add bilingual sponsorship pledge confirmation email"
```

---

## Task 4: `submission.server.ts` — header validation + multipart parsing

**Files:**
- Create: `src/lib/sponsorship/submission.server.ts`
- Test: `src/lib/sponsorship/submission.server.test.ts`

This task creates the file with header validation and multipart parsing only. Tasks 5 and 6 add to the same two files.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sponsorship/submission.server.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  SPONSORSHIP_MULTIPART_MAX_BYTES,
  parseSponsorshipMultipart,
  validateSponsorshipSubmissionRequestHeaders,
} from "./submission.server";

const animalId = "11111111-2222-4333-8444-555555555555";

function basePayloadJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    language: "zh-HK",
    monthlyTier: "300",
    animalPreferences: [
      { rank: 1, animalId, animalName: "白雪", animalType: "sponsor" },
    ],
    contact: { supporterName: "陳小姐", email: "chan@example.com", phone: "91234567" },
    consents: { email: true, whatsapp: false },
    terms: { agreed: true },
    turnstileToken: "test-token",
    ...overrides,
  });
}

function multipartRequest(fields: Record<string, string>, file?: { name: string; content: string }) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  if (file) formData.set("proof", new File([file.content], file.name, { type: "image/jpeg" }));
  return new Request("http://localhost/api/sponsorships/pledges", {
    method: "POST",
    body: formData,
  });
}

describe("validateSponsorshipSubmissionRequestHeaders", () => {
  test("rejects a missing content-type", () => {
    const request = new Request("http://localhost", { method: "POST" });
    expect(validateSponsorshipSubmissionRequestHeaders(request)).toEqual({
      ok: false,
      status: 400,
      error: "Missing content-type",
    });
  });

  test("rejects a non-multipart content-type", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(validateSponsorshipSubmissionRequestHeaders(request).ok).toBe(false);
  });

  test("rejects an oversized content-length", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(SPONSORSHIP_MULTIPART_MAX_BYTES + 1),
      },
    });
    expect(validateSponsorshipSubmissionRequestHeaders(request)).toEqual({
      ok: false,
      status: 413,
      error: "Sponsorship pledge upload is too large",
    });
  });

  test("accepts a well-formed multipart request", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
    });
    expect(validateSponsorshipSubmissionRequestHeaders(request)).toEqual({ ok: true });
  });
});

describe("parseSponsorshipMultipart", () => {
  test("parses a payload without proof", async () => {
    const request = multipartRequest({ payload: basePayloadJson() });
    const parsed = await parseSponsorshipMultipart(request);
    expect(parsed.payload.contact.supporterName).toBe("陳小姐");
    expect(parsed.payload.turnstileToken).toBe("test-token");
    expect(parsed.proof).toBeUndefined();
  });

  test("parses a payload with proof metadata and a proof file", async () => {
    const request = multipartRequest(
      {
        payload: basePayloadJson({
          proofMetadata: {
            paymentMethod: "fps",
            reference: "REF1",
            amountCents: 30000,
            paymentDate: "2026-07-01",
          },
        }),
      },
      { name: "proof.jpg", content: "fake-image-bytes" },
    );
    const parsed = await parseSponsorshipMultipart(request);
    expect(parsed.proof?.fileName).toBe("proof.jpg");
    expect(parsed.proof?.metadata.paymentMethod).toBe("fps");
  });

  test("rejects proof metadata without a file", async () => {
    const request = multipartRequest({
      payload: basePayloadJson({
        proofMetadata: {
          paymentMethod: "fps",
          amountCents: 30000,
          paymentDate: "2026-07-01",
        },
      }),
    });
    await expect(parseSponsorshipMultipart(request)).rejects.toThrow();
  });

  test("rejects a proof file without metadata", async () => {
    const request = multipartRequest(
      { payload: basePayloadJson() },
      { name: "proof.jpg", content: "fake-image-bytes" },
    );
    await expect(parseSponsorshipMultipart(request)).rejects.toThrow();
  });

  test("rejects a missing payload field", async () => {
    const request = multipartRequest({});
    await expect(parseSponsorshipMultipart(request)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/sponsorship/submission.server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation (part 1)**

Create `src/lib/sponsorship/submission.server.ts`:

```ts
import { ZodError } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createStatusTokenPair, statusTokenExpiry } from "../publicAdoption/statusToken.server";
import { renderPledgeConfirmationEmail } from "./emailTemplates.server";
import {
  type SponsorshipPaymentProofMetadata,
  type SponsorshipPledgeStatus,
  type SponsorshipPledgeSubmission,
  type SponsorshipProofDescriptor,
  MAX_PROOF_BYTES,
  sponsorshipPledgeSubmissionSchema,
  toPaymentProofInsert,
  toPledgeInsert,
  toPreferenceInserts,
  validateProofDescriptor,
} from "./schemas";
import { getAppUrl, getEmailConfig } from "../donations/config.server";

export const SPONSORSHIP_PROOF_BUCKET = "sponsorship-payment-proof";
export const SPONSORSHIP_MULTIPART_MAX_BYTES = MAX_PROOF_BYTES + 2 * 1024 * 1024;

export class SubmissionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionValidationError";
  }
}

export type ParsedSponsorshipPayload = SponsorshipPledgeSubmission & {
  turnstileToken?: string;
};

export type ParsedSponsorshipProof = SponsorshipProofDescriptor & {
  file: File;
  metadata: SponsorshipPaymentProofMetadata;
};

export type ParsedSponsorshipMultipart = {
  payload: ParsedSponsorshipPayload;
  proof?: ParsedSponsorshipProof;
};

export type SponsorshipPledgePersistResult = {
  pledgeId: string;
  supporterId: string;
  reference: string;
  status: SponsorshipPledgeStatus;
  amountCents: number;
  statusToken: string;
  statusUrl: string;
  expiresAt: string;
};

type QueryResult<T = unknown> = {
  data: T | null;
  error: unknown;
};

export type PublicSponsorshipSupabaseClient = SupabaseClient;

export type SponsorshipSubmissionHeaderValidation =
  | { ok: true }
  | { ok: false; status: 400 | 413 | 415; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNoError<T>(result: QueryResult<T>, message: string): T | null {
  if (result.error) throw result.error;
  return result.data ?? null;
}

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function safeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "proof";
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_");
}

function referenceForPledge(pledgeId: string) {
  return `SP-${pledgeId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function buildStatusUrl(appUrl: string, rawToken: string) {
  return `${appUrl.replace(/\/+$/, "")}/sponsors/status/${encodeURIComponent(rawToken)}`;
}

export function validateSponsorshipSubmissionRequestHeaders(
  request: Request,
): SponsorshipSubmissionHeaderValidation {
  const contentType = request.headers.get("content-type");
  if (!contentType) {
    return { ok: false, status: 400, error: "Missing content-type" };
  }
  if (!/^multipart\/form-data\b/i.test(contentType)) {
    return { ok: false, status: 415, error: "Expected multipart/form-data" };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > SPONSORSHIP_MULTIPART_MAX_BYTES) {
      return { ok: false, status: 413, error: "Sponsorship pledge upload is too large" };
    }
  }

  return { ok: true };
}

export async function parseSponsorshipMultipart(
  request: Request,
): Promise<ParsedSponsorshipMultipart> {
  const formData = await request.formData();
  const payloadValue = formData.get("payload");
  if (typeof payloadValue !== "string") {
    throw new SubmissionValidationError("Missing sponsorship pledge payload");
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(payloadValue);
  } catch (error) {
    throw new SyntaxError("Invalid sponsorship pledge payload JSON", { cause: error });
  }

  const parsed = sponsorshipPledgeSubmissionSchema.parse(rawPayload);
  const turnstileToken =
    isRecord(rawPayload) && typeof rawPayload.turnstileToken === "string"
      ? rawPayload.turnstileToken
      : undefined;

  const proofValue = formData.get("proof");
  const hasProofFile = isFile(proofValue);

  if (parsed.proofMetadata && !hasProofFile) {
    throw new SubmissionValidationError("Payment proof metadata was provided without a file");
  }
  if (!parsed.proofMetadata && hasProofFile) {
    throw new SubmissionValidationError("Payment proof file was provided without metadata");
  }

  let proof: ParsedSponsorshipProof | undefined;
  if (hasProofFile && parsed.proofMetadata) {
    const descriptor = validateProofDescriptor({
      fileName: proofValue.name,
      mimeType: proofValue.type,
      sizeBytes: proofValue.size,
    });
    proof = { ...descriptor, file: proofValue, metadata: parsed.proofMetadata };
  }

  return {
    payload: turnstileToken ? { ...parsed, turnstileToken } : parsed,
    proof,
  };
}

export function isSubmissionValidationError(error: unknown) {
  return (
    error instanceof SubmissionValidationError ||
    error instanceof SyntaxError ||
    error instanceof ZodError
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/sponsorship/submission.server.test.ts`
Expected: PASS — all header/parsing tests green (persist/email tests come in Tasks 5–6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sponsorship/submission.server.ts src/lib/sponsorship/submission.server.test.ts
git commit -m "feat: add sponsorship submission header validation and multipart parsing"
```

---

## Task 5: `submission.server.ts` — `persistSponsorshipPledge`

**Files:**
- Modify: `src/lib/sponsorship/submission.server.ts`
- Modify: `src/lib/sponsorship/submission.server.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this fake-client helper and test suite to the end of `src/lib/sponsorship/submission.server.test.ts` (after the existing `describe` blocks; add the new imports to the top-level import list from `./submission.server`):

Update the import at the top of the file to also pull in `persistSponsorshipPledge`:

```ts
import {
  SPONSORSHIP_MULTIPART_MAX_BYTES,
  parseSponsorshipMultipart,
  persistSponsorshipPledge,
  validateSponsorshipSubmissionRequestHeaders,
  type ParsedSponsorshipMultipart,
  type PublicSponsorshipSupabaseClient,
} from "./submission.server";
```

Then append at the end of the file:

```ts
type QueryCall = { table: string; method: string; payload?: unknown };
type StorageCall = { bucket: string; method: string; path?: string; paths?: string[] };
type FakeClientOptions = { failInsertTable?: string; supporterId?: string };

class FakeQuery {
  private action: "insert" | "select" | "delete" | null = null;
  private mutationPayload: unknown;

  constructor(
    private readonly state: {
      calls: QueryCall[];
      failInsertTable?: string;
      supporterId: string;
    },
    private readonly table: string,
  ) {}

  insert(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "insert", payload });
    this.action = "insert";
    this.mutationPayload = payload;
    return this;
  }

  select(columns: string) {
    this.state.calls.push({ table: this.table, method: "select", payload: columns });
    if (!this.action) this.action = "select";
    return this;
  }

  delete() {
    this.state.calls.push({ table: this.table, method: "delete" });
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "eq", payload: { column, value } });
    return this;
  }

  upsert(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "upsert", payload });
    this.action = "insert";
    this.mutationPayload = { id: this.state.supporterId };
    return this;
  }

  async single() {
    if (this.action === "insert" && this.state.failInsertTable === this.table) {
      return { data: null, error: new Error(`insert failed: ${this.table}`) };
    }
    if (this.table === "supporter") return { data: { id: this.state.supporterId }, error: null };
    if (this.table === "sponsorship_pledge") return { data: { id: "pledge-1" }, error: null };
    return { data: this.mutationPayload ?? { id: `${this.table}-id` }, error: null };
  }

  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    const result =
      this.action === "insert" && this.state.failInsertTable === this.table
        ? { data: null, error: new Error(`insert failed: ${this.table}`) }
        : { data: this.mutationPayload, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

function createFakeClient(options: FakeClientOptions = {}) {
  const state = {
    calls: [] as QueryCall[],
    storageCalls: [] as StorageCall[],
    failInsertTable: options.failInsertTable,
    supporterId: options.supporterId ?? "supporter-1",
  };

  const client = {
    from(table: string) {
      return new FakeQuery(state, table);
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string) {
            state.storageCalls.push({ bucket, method: "upload", path });
            return { data: { path }, error: null };
          },
          async remove(paths: string[]) {
            state.storageCalls.push({ bucket, method: "remove", paths });
            return { data: null, error: null };
          },
        };
      },
    },
  };

  return { client: client as unknown as PublicSponsorshipSupabaseClient, state };
}

function parsedPayload(overrides: Record<string, unknown> = {}): ParsedSponsorshipMultipart {
  return {
    payload: {
      language: "zh-HK",
      monthlyTier: "300",
      customAmountCents: undefined,
      animalPreferences: [
        {
          rank: 1,
          animalId: "11111111-2222-4333-8444-555555555555",
          animalName: "白雪",
          animalType: "sponsor",
        },
      ],
      contact: { supporterName: "陳小姐", email: "chan@example.com", phone: "91234567" },
      consents: { email: true, whatsapp: false },
      notes: null,
      terms: { agreed: true, version: "sponsorship-terms-2026-07" },
      ...overrides,
    } as ParsedSponsorshipMultipart["payload"],
    proof: undefined,
  };
}

describe("persistSponsorshipPledge", () => {
  test("creates a pending_payment pledge when no proof is attached", async () => {
    const { client, state } = createFakeClient();
    const result = await persistSponsorshipPledge({
      client,
      parsed: parsedPayload(),
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(result.status).toBe("pending_payment");
    expect(result.pledgeId).toBe("pledge-1");
    expect(result.reference).toMatch(/^SP-[A-Z0-9]{8}$/);
    expect(result.amountCents).toBe(30000);
    expect(state.calls.some((c) => c.table === "sponsorship_preference" && c.method === "insert")).toBe(true);
    expect(state.calls.some((c) => c.table === "sponsorship_payment_proof")).toBe(false);
    expect(
      state.calls.some(
        (c) => c.table === "public_status_token" && c.method === "insert",
      ),
    ).toBe(true);
  });

  test("creates a provisional pledge and uploads proof when proof is attached", async () => {
    const { client, state } = createFakeClient();
    const proof = {
      fileName: "proof.jpg",
      mimeType: "image/jpeg" as const,
      sizeBytes: 2048,
      file: new File(["bytes"], "proof.jpg", { type: "image/jpeg" }),
      metadata: {
        paymentMethod: "fps" as const,
        reference: "REF1",
        amountCents: 30000,
        paymentDate: "2026-07-01",
      },
    };

    const result = await persistSponsorshipPledge({
      client,
      parsed: { ...parsedPayload(), proof },
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(result.status).toBe("provisional");
    expect(state.storageCalls.some((c) => c.method === "upload")).toBe(true);
    expect(state.calls.some((c) => c.table === "sponsorship_payment_proof" && c.method === "insert")).toBe(true);
  });

  test("cleans up the pledge and uploaded proof when persistence fails mid-way", async () => {
    const { client, state } = createFakeClient({ failInsertTable: "public_status_token" });
    const proof = {
      fileName: "proof.jpg",
      mimeType: "image/jpeg" as const,
      sizeBytes: 2048,
      file: new File(["bytes"], "proof.jpg", { type: "image/jpeg" }),
      metadata: {
        paymentMethod: "fps" as const,
        reference: "REF1",
        amountCents: 30000,
        paymentDate: "2026-07-01",
      },
    };

    await expect(
      persistSponsorshipPledge({ client, parsed: { ...parsedPayload(), proof } }),
    ).rejects.toThrow("Failed to save sponsorship pledge");

    expect(state.storageCalls.some((c) => c.method === "remove")).toBe(true);
    expect(
      state.calls.some((c) => c.table === "sponsorship_pledge" && c.method === "delete"),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/sponsorship/submission.server.test.ts`
Expected: FAIL — `persistSponsorshipPledge` is not exported yet.

- [ ] **Step 3: Add `persistSponsorshipPledge` to the implementation**

Append these to `src/lib/sponsorship/submission.server.ts` (after `parseSponsorshipMultipart`, before `isSubmissionValidationError`). First add this import at the top of the file, next to the existing `./schemas` import (extend it — the full import line becomes):

```ts
import {
  type SponsorshipPaymentProofMetadata,
  type SponsorshipPledgeStatus,
  type SponsorshipPledgeSubmission,
  type SponsorshipProofDescriptor,
  MAX_PROOF_BYTES,
  sponsorshipPledgeSubmissionSchema,
  toPaymentProofInsert,
  toPledgeInsert,
  toPreferenceInserts,
  validateProofDescriptor,
} from "./schemas";
```

Then append the persist logic:

```ts
type PersistSponsorshipPledgeInput = {
  client: PublicSponsorshipSupabaseClient;
  parsed: ParsedSponsorshipMultipart;
  now?: () => Date;
  createStatusTokenPair?: typeof createStatusTokenPair;
  appUrl?: string;
  logger?: Pick<Console, "error">;
};

async function cleanupFailedPersistence(input: {
  client: PublicSponsorshipSupabaseClient;
  pledgeId: string | null;
  uploadedPaths: string[];
  logger: Pick<Console, "error">;
}) {
  if (input.uploadedPaths.length > 0) {
    try {
      const { error } = await input.client.storage
        .from(SPONSORSHIP_PROOF_BUCKET)
        .remove(input.uploadedPaths);
      if (error) input.logger.error("Failed to clean up sponsorship payment proof", error);
    } catch (error) {
      input.logger.error("Failed to clean up sponsorship payment proof", error);
    }
  }

  if (input.pledgeId) {
    try {
      const { error } = await input.client
        .from("public_status_token")
        .delete()
        .eq("entity_id", input.pledgeId)
        .eq("entity_type", "sponsorship_pledge");
      if (error) input.logger.error("Failed to clean up sponsorship status token", error);
    } catch (error) {
      input.logger.error("Failed to clean up sponsorship status token", error);
    }

    try {
      const { error } = await input.client
        .from("sponsorship_pledge")
        .delete()
        .eq("id", input.pledgeId);
      if (error) input.logger.error("Failed to clean up sponsorship pledge row", error);
    } catch (error) {
      input.logger.error("Failed to clean up sponsorship pledge row", error);
    }
  }
}

export async function persistSponsorshipPledge({
  client,
  parsed,
  now = () => new Date(),
  createStatusTokenPair: makeStatusToken = createStatusTokenPair,
  appUrl = getAppUrl(),
  logger = console,
}: PersistSponsorshipPledgeInput): Promise<SponsorshipPledgePersistResult> {
  let pledgeId: string | null = null;
  const uploadedPaths: string[] = [];

  try {
    const supporter = requireNoError(
      await client
        .from("supporter")
        .upsert(
          {
            name: parsed.payload.contact.supporterName,
            email: parsed.payload.contact.email,
            phone: parsed.payload.contact.phone,
            language: parsed.payload.language,
            source: "sponsorship_pledge_form",
          },
          { onConflict: "email" },
        )
        .select("id")
        .single(),
      "Failed to save sponsorship supporter",
    ) as { id: string } | null;
    if (!supporter?.id) throw new Error("Missing supporter id");
    const supporterId = supporter.id;

    const status: SponsorshipPledgeStatus = parsed.proof ? "provisional" : "pending_payment";

    const pledge = requireNoError(
      await client
        .from("sponsorship_pledge")
        .insert(toPledgeInsert(supporterId, status, parsed.payload))
        .select("id")
        .single(),
      "Failed to save sponsorship pledge",
    ) as { id: string } | null;
    if (!pledge?.id) throw new Error("Missing sponsorship pledge id");
    pledgeId = pledge.id;

    requireNoError(
      await client.from("sponsorship_preference").insert(toPreferenceInserts(pledgeId, parsed.payload)),
      "Failed to save sponsorship animal preferences",
    );

    if (parsed.proof) {
      const storagePath = `${pledgeId}/${safeFileName(parsed.proof.fileName)}`;
      const upload = await client.storage
        .from(SPONSORSHIP_PROOF_BUCKET)
        .upload(storagePath, parsed.proof.file, {
          contentType: parsed.proof.mimeType,
          upsert: false,
        });
      if (upload.error) throw upload.error;
      uploadedPaths.push(upload.data?.path ?? storagePath);

      requireNoError(
        await client
          .from("sponsorship_payment_proof")
          .insert(
            toPaymentProofInsert(
              pledgeId,
              upload.data?.path ?? storagePath,
              parsed.proof,
              parsed.proof.metadata,
            ),
          ),
        "Failed to save sponsorship payment proof",
      );
    }

    const reference = referenceForPledge(pledgeId);
    const token = makeStatusToken();
    const expiresAt = statusTokenExpiry(now);
    requireNoError(
      await client.from("public_status_token").insert({
        token_hash: token.tokenHash,
        entity_type: "sponsorship_pledge",
        entity_id: pledgeId,
        expires_at: expiresAt,
      }),
      "Failed to save sponsorship status token",
    );

    return {
      pledgeId,
      supporterId,
      reference,
      status,
      amountCents: toPledgeInsert(supporterId, status, parsed.payload).amount_cents,
      statusToken: token.rawToken,
      statusUrl: buildStatusUrl(appUrl, token.rawToken),
      expiresAt,
    };
  } catch (error) {
    await cleanupFailedPersistence({ client, pledgeId, uploadedPaths, logger });
    logger.error("Failed to save sponsorship pledge", error);
    throw new Error("Failed to save sponsorship pledge");
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/sponsorship/submission.server.test.ts`
Expected: PASS — all persist tests green.

- [ ] **Step 5: Lint and commit**

```bash
bunx eslint src/lib/sponsorship/submission.server.ts src/lib/sponsorship/submission.server.test.ts
git add src/lib/sponsorship/submission.server.ts src/lib/sponsorship/submission.server.test.ts
git commit -m "feat: persist sponsorship pledges with proof upload and orphan cleanup"
```

---

## Task 6: `submission.server.ts` — `sendPledgeConfirmationEmail`

**Files:**
- Modify: `src/lib/sponsorship/submission.server.ts`
- Modify: `src/lib/sponsorship/submission.server.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the top-level import from `./submission.server` in the test file to also include `sendPledgeConfirmationEmail`:

```ts
import {
  SPONSORSHIP_MULTIPART_MAX_BYTES,
  parseSponsorshipMultipart,
  persistSponsorshipPledge,
  sendPledgeConfirmationEmail,
  validateSponsorshipSubmissionRequestHeaders,
  type ParsedSponsorshipMultipart,
  type PublicSponsorshipSupabaseClient,
} from "./submission.server";
```

Append at the end of the file:

```ts
describe("sendPledgeConfirmationEmail", () => {
  function fakeResult(overrides: Record<string, unknown> = {}) {
    return {
      pledgeId: "pledge-1",
      supporterId: "supporter-1",
      reference: "SP-ABCDEF12",
      status: "pending_payment" as const,
      amountCents: 30000,
      statusToken: "token",
      statusUrl: "http://localhost:3000/sponsors/status/token",
      expiresAt: "2026-08-01T00:00:00.000Z",
      ...overrides,
    };
  }

  test("queues the email and returns 'queued' with no Resend key configured", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeConfirmationEmail(client, parsedPayload().payload, fakeResult(), {
      getEmailConfig: () => ({
        resendApiKey: undefined,
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
    });
    expect(result).toBe("queued");
  });

  test("returns 'sent' when the email sender succeeds", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeConfirmationEmail(client, parsedPayload().payload, fakeResult(), {
      getEmailConfig: () => ({
        resendApiKey: "key",
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
      createEmailSender: () => ({ send: async () => ({}) }),
    });
    expect(result).toBe("sent");
  });

  test("returns 'failed' when the email sender throws", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeConfirmationEmail(client, parsedPayload().payload, fakeResult(), {
      getEmailConfig: () => ({
        resendApiKey: "key",
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
      createEmailSender: () => ({
        send: async () => {
          throw new Error("network down");
        },
      }),
      logger: { error: () => {} },
    });
    expect(result).toBe("failed");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/sponsorship/submission.server.test.ts`
Expected: FAIL — `sendPledgeConfirmationEmail` is not exported yet.

- [ ] **Step 3: Add `sendPledgeConfirmationEmail` to the implementation**

Append to `src/lib/sponsorship/submission.server.ts` (after `persistSponsorshipPledge`, before `isSubmissionValidationError`):

```ts
type EmailConfig = ReturnType<typeof getEmailConfig>;

type EmailSender = {
  send(payload: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
};

type SendPledgeConfirmationEmailDeps = {
  getEmailConfig?: () => EmailConfig;
  createEmailSender?: (apiKey: string) => Promise<EmailSender> | EmailSender;
  logger?: Pick<Console, "error">;
};

export type SponsorshipConfirmationEmailResult = "queued" | "sent" | "failed";

async function defaultCreateEmailSender(apiKey: string): Promise<EmailSender> {
  const { Resend } = await import("resend");
  return new Resend(apiKey).emails;
}

export async function sendPledgeConfirmationEmail(
  client: PublicSponsorshipSupabaseClient,
  payload: ParsedSponsorshipPayload,
  result: SponsorshipPledgePersistResult,
  {
    getEmailConfig: loadEmailConfig = getEmailConfig,
    createEmailSender = defaultCreateEmailSender,
    logger = console,
  }: SendPledgeConfirmationEmailDeps = {},
): Promise<SponsorshipConfirmationEmailResult> {
  const config = loadEmailConfig();
  const email = renderPledgeConfirmationEmail({
    language: payload.language,
    supporterName: payload.contact.supporterName,
    reference: result.reference,
    amountCents: result.amountCents,
    status: result.status === "provisional" ? "provisional" : "pending_payment",
  });

  const messagePayload = {
    kind: "sponsorship_pledge_confirmation",
    pledgeId: result.pledgeId,
    reference: result.reference,
    subject: email.subject,
    entityType: "sponsorship_pledge",
  };

  const { data: message, error: messageError } = await client
    .from("message")
    .insert({
      supporter_id: result.supporterId,
      channel: "email",
      status: "queued",
      payload: messagePayload,
    })
    .select("id")
    .single();
  if (messageError || !message) {
    logger.error("Failed to queue sponsorship pledge confirmation email", messageError);
    return "failed";
  }

  const messageId = (message as { id: string }).id;
  if (!config.resendApiKey) return "queued";

  try {
    const emails = await createEmailSender(config.resendApiKey);
    await emails.send({
      from: config.from,
      to: payload.contact.email,
      replyTo: config.replyTo,
      subject: email.subject,
      html: email.html,
    });
  } catch (error) {
    logger.error("Failed to send sponsorship pledge confirmation email", error);
    await client.from("message").update({ status: "failed" }).eq("id", messageId);
    return "failed";
  }

  await client
    .from("message")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", messageId);
  return "sent";
}
```

Also update the `FakeQuery.single()` method in the test file's fake client to return a message id, by adding this branch (insert it in the `if` chain inside `single()`, before the final fallback `return`):

```ts
    if (this.table === "message") return { data: { id: "message-1" }, error: null };
```

And add an `update` method to `FakeQuery` so `.update({...}).eq(...)` resolves (add this method next to `insert`/`delete`):

```ts
  update(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "update", payload });
    this.action = "insert";
    this.mutationPayload = payload;
    return this;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/sponsorship/submission.server.test.ts`
Expected: PASS — full file green.

- [ ] **Step 5: Lint and commit**

```bash
bunx eslint src/lib/sponsorship/submission.server.ts src/lib/sponsorship/submission.server.test.ts
git add src/lib/sponsorship/submission.server.ts src/lib/sponsorship/submission.server.test.ts
git commit -m "feat: send bilingual sponsorship pledge confirmation email"
```

---

## Task 7: API route

**Files:**
- Create: `src/routes/api/sponsorships/pledges.ts`

- [ ] **Step 1: Create the route**

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  isSubmissionValidationError,
  parseSponsorshipMultipart,
  persistSponsorshipPledge,
  sendPledgeConfirmationEmail,
  validateSponsorshipSubmissionRequestHeaders,
} from "../../../lib/sponsorship/submission.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../lib/security/turnstile.server";

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export const Route = createFileRoute("/api/sponsorships/pledges")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await enforceRateLimit(ip, {
          prefix: "sponsorship",
          max: 5,
          window: "1 m",
        });
        if (!limit.ok) {
          return jsonNoStore(
            { error: "Too many requests. Please try again shortly." },
            { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
          );
        }

        const headerValidation = validateSponsorshipSubmissionRequestHeaders(request);
        if (!headerValidation.ok) {
          return jsonNoStore(
            { error: headerValidation.error },
            { status: headerValidation.status },
          );
        }

        try {
          const parsed = await parseSponsorshipMultipart(request);
          if (!(await verifyTurnstile(parsed.payload.turnstileToken, ip))) {
            return jsonNoStore({ error: "Verification failed" }, { status: 403 });
          }

          const client = createSupabaseServiceClient();
          const result = await persistSponsorshipPledge({ client, parsed });
          await sendPledgeConfirmationEmail(client, parsed.payload, result);

          return jsonNoStore(
            { pledgeId: result.pledgeId, reference: result.reference },
            { status: 201 },
          );
        } catch (error) {
          if (isSubmissionValidationError(error)) {
            return jsonNoStore({ error: "Invalid sponsorship pledge request" }, { status: 400 });
          }
          console.error(error);
          return jsonNoStore(
            { error: "Sponsorship pledge could not be created" },
            { status: 500 },
          );
        }
      },
    },
  },
});
```

- [ ] **Step 2: Lint**

Run: `bunx eslint src/routes/api/sponsorships/pledges.ts`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/sponsorships/pledges.ts
git commit -m "feat: add public sponsorship pledge submission API route"
```

---

## Task 8: Client draft module

**Files:**
- Create: `src/lib/sponsorship/draft.ts`

- [ ] **Step 1: Create the thin draft wrapper**

```ts
export { serializeDraft, parseDraft } from "../publicAdoption/draft";

export const SPONSORSHIP_PLEDGE_DRAFT_STORAGE_KEY = "hkscda-sponsorship-pledge-draft-v1";
```

- [ ] **Step 2: Lint and commit**

```bash
bunx eslint src/lib/sponsorship/draft.ts
git add src/lib/sponsorship/draft.ts
git commit -m "feat: reuse the generic draft helpers for sponsorship pledges"
```

---

## Task 9: Client wizard + route

**Files:**
- Create: `src/components/site/sponsorship/PledgeWizard.tsx`
- Create: `src/routes/sponsors_.pledge.tsx`

- [ ] **Step 1: Create the wizard component**

Create `src/components/site/sponsorship/PledgeWizard.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { Loader2, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";

import { centsToHkd } from "../../../lib/donations/domain";
import {
  SPONSORSHIP_PLEDGE_DRAFT_STORAGE_KEY,
  parseDraft,
  serializeDraft,
} from "../../../lib/sponsorship/draft";
import { SPONSORSHIP_TIER_AMOUNTS_CENTS } from "../../../lib/sponsorship/schemas";
import { TurnstileWidget, turnstileEnabled } from "../TurnstileWidget";
import { useShortlist } from "../ShortlistContext";

type Language = "zh-HK" | "en";
type MonthlyTier = "100" | "300" | "500" | "custom";
type PaymentMethod = "fps" | "bank_transfer" | "payme" | "paypal" | "give_asia";

const copy = {
  "zh-HK": {
    empty: "您尚未選擇任何助養動物。",
    backToSponsors: "返回助養區",
    tierTitle: "每月助養金額",
    customAmount: "自訂金額",
    contactTitle: "聯絡資料",
    name: "姓名",
    email: "電郵",
    phone: "電話（選填）",
    proofTitle: "付款證明（選填，可稍後補交）",
    proofSkip: "我將稍後透過電郵中的付款方式完成付款",
    method: "付款方式",
    reference: "付款參考",
    amount: "付款金額",
    date: "付款日期",
    notes: "備註（選填）",
    emailConsent: "我同意以電郵接收助養確認及通知",
    whatsappConsent: "我同意以 WhatsApp 接收助養相關通知",
    submit: "確認助養承諾",
    processing: "處理中",
    verifyRequired: "請先完成人機驗證",
    submitError: "暫時未能建立助養承諾，請稍後再試。",
    successTitle: "多謝您的助養承諾！",
    successRef: "參考編號",
  },
  en: {
    empty: "You have not selected any sponsor animals yet.",
    backToSponsors: "Back to sponsorship",
    tierTitle: "Monthly sponsorship amount",
    customAmount: "Custom amount",
    contactTitle: "Contact details",
    name: "Name",
    email: "Email",
    phone: "Phone (optional)",
    proofTitle: "Payment proof (optional, can be provided later)",
    proofSkip: "I will pay later using the methods in the confirmation email",
    method: "Payment method",
    reference: "Payment reference",
    amount: "Payment amount",
    date: "Payment date",
    notes: "Notes (optional)",
    emailConsent: "I agree to receive sponsorship confirmation and updates by email",
    whatsappConsent: "I agree to receive sponsorship updates by WhatsApp",
    submit: "Confirm sponsorship pledge",
    processing: "Processing",
    verifyRequired: "Please complete the verification first.",
    submitError: "Sponsorship pledge could not be created. Please try again later.",
    successTitle: "Thank you for your sponsorship pledge!",
    successRef: "Reference",
  },
} satisfies Record<Language, Record<string, string>>;

const tiers: MonthlyTier[] = ["100", "300", "500", "custom"];
const paymentMethods: { value: PaymentMethod; zh: string; en: string }[] = [
  { value: "fps", zh: "轉數快 FPS", en: "FPS" },
  { value: "bank_transfer", zh: "銀行轉帳", en: "Bank Transfer" },
  { value: "payme", zh: "PayMe", en: "PayMe" },
  { value: "paypal", zh: "PayPal", en: "PayPal" },
  { value: "give_asia", zh: "Give.asia", en: "Give.asia" },
];

type SubmitResult = { pledgeId: string; reference: string };

export function PledgeWizard() {
  const { items, clearIntent } = useShortlist();
  const sponsorshipItems = useMemo(
    () =>
      [...items]
        .filter((item) => item.intent === "sponsorship")
        .sort((left, right) => left.rank - right.rank),
    [items],
  );

  const [language, setLanguage] = useState<Language>("zh-HK");
  const t = copy[language];

  const draft = useMemo(() => {
    try {
      return parseDraft(window.localStorage.getItem(SPONSORSHIP_PLEDGE_DRAFT_STORAGE_KEY));
    } catch {
      return {};
    }
  }, []);

  const [monthlyTier, setMonthlyTier] = useState<MonthlyTier>(
    (draft.monthlyTier as MonthlyTier) ?? "300",
  );
  const [customAmount, setCustomAmount] = useState((draft.customAmount as string) ?? "");
  const [supporterName, setSupporterName] = useState((draft.supporterName as string) ?? "");
  const [email, setEmail] = useState((draft.email as string) ?? "");
  const [phone, setPhone] = useState((draft.phone as string) ?? "");
  const [notes, setNotes] = useState((draft.notes as string) ?? "");
  const [emailConsent, setEmailConsent] = useState(true);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [includeProof, setIncludeProof] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofMethod, setProofMethod] = useState<PaymentMethod>("fps");
  const [proofReference, setProofReference] = useState("");
  const [proofAmount, setProofAmount] = useState("");
  const [proofDate, setProofDate] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  function saveDraft() {
    try {
      window.localStorage.setItem(
        SPONSORSHIP_PLEDGE_DRAFT_STORAGE_KEY,
        serializeDraft({ monthlyTier, customAmount, supporterName, email, phone, notes }),
      );
    } catch {
      // Draft persistence is best-effort; submission still proceeds.
    }
  }

  const amountCents =
    monthlyTier === "custom"
      ? Math.round((Number(customAmount) || 0) * 100)
      : SPONSORSHIP_TIER_AMOUNTS_CENTS[monthlyTier];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    saveDraft();

    if (turnstileEnabled && !turnstileToken) {
      setError(t.verifyRequired);
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        language,
        monthlyTier,
        animalPreferences: sponsorshipItems.map((item) => ({
          rank: item.rank,
          animalId: item.id,
          animalName: item.name,
          animalType: "sponsor",
        })),
        contact: { supporterName, email, phone: phone || undefined },
        consents: { email: emailConsent, whatsapp: whatsappConsent },
        notes: notes || undefined,
        terms: { agreed: true },
        turnstileToken,
      };
      if (monthlyTier === "custom") payload.customAmountCents = amountCents;
      if (includeProof && proofFile) {
        payload.proofMetadata = {
          paymentMethod: proofMethod,
          reference: proofReference || undefined,
          amountCents: Math.round((Number(proofAmount) || 0) * 100),
          paymentDate: proofDate,
        };
      }

      const formData = new FormData();
      formData.set("payload", JSON.stringify(payload));
      if (includeProof && proofFile) formData.set("proof", proofFile);

      const response = await fetch("/api/sponsorships/pledges", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Sponsorship pledge request failed");
      const data = (await response.json()) as SubmitResult;

      try {
        window.localStorage.removeItem(SPONSORSHIP_PLEDGE_DRAFT_STORAGE_KEY);
      } catch {
        // Ignore draft cleanup failure; the pledge already succeeded.
      }
      clearIntent("sponsorship");
      setResult(data);
    } catch (submitError) {
      console.error(submitError);
      setError(t.submitError);
    } finally {
      setLoading(false);
    }
  }

  if (sponsorshipItems.length === 0 && !result) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-[var(--color-text-muted)]">{t.empty}</p>
        <Link to="/sponsors" className="text-[var(--color-primary)] hover:underline">
          ← {t.backToSponsors}
        </Link>
      </main>
    );
  }

  if (result) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <ReceiptText className="h-10 w-10 mx-auto text-[var(--color-primary)]" />
        <h1 className="font-display text-2xl font-bold">{t.successTitle}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          {t.successRef}: <strong>{result.reference}</strong>
        </p>
        <Link to="/sponsors" className="text-[var(--color-primary)] hover:underline">
          ← {t.backToSponsors}
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <form onSubmit={handleSubmit} className="card-dashed bg-[var(--color-surface)] p-5 space-y-6">
        <div className="flex justify-end">
          <div className="inline-flex rounded-full border border-[var(--color-border)] p-1 text-xs font-bold">
            {(["zh-HK", "en"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                aria-pressed={language === lang}
                onClick={() => setLanguage(lang)}
                className={`rounded-full px-3 py-1.5 ${
                  language === lang ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"
                }`}
              >
                {lang === "zh-HK" ? "繁" : "EN"}
              </button>
            ))}
          </div>
        </div>

        <ul className="space-y-2">
          {sponsorshipItems.map((item) => (
            <li key={item.id} className="text-sm text-[var(--color-panel)]">
              {item.rank}. {item.name}
            </li>
          ))}
        </ul>

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold">{t.tierTitle}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tiers.map((tier) => (
              <button
                key={tier}
                type="button"
                aria-pressed={monthlyTier === tier}
                onClick={() => setMonthlyTier(tier)}
                className={`rounded-full border px-4 py-3 text-sm font-bold ${
                  monthlyTier === tier
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] bg-white"
                }`}
              >
                {tier === "custom" ? t.customAmount : `HK$${tier}`}
              </button>
            ))}
          </div>
          {monthlyTier === "custom" && (
            <input
              type="number"
              min="10"
              value={customAmount}
              onChange={(event) => setCustomAmount(event.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm"
              placeholder="HK$"
            />
          )}
          <p className="text-xs text-[var(--color-text-muted)]">{centsToHkd(amountCents)}/month</p>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="col-span-full text-sm font-bold">{t.contactTitle}</legend>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">{t.name}</span>
            <input
              required
              value={supporterName}
              onChange={(event) => setSupporterName(event.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">{t.email}</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">{t.phone}</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm"
            />
          </label>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold">{t.proofTitle}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeProof}
              onChange={(event) => setIncludeProof(event.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            {includeProof ? t.proofTitle : t.proofSkip}
          </label>
          {includeProof && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                  {t.method}
                </span>
                <select
                  value={proofMethod}
                  onChange={(event) => setProofMethod(event.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm"
                >
                  {paymentMethods.map((m) => (
                    <option key={m.value} value={m.value}>
                      {language === "zh-HK" ? m.zh : m.en}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                  {t.reference}
                </span>
                <input
                  value={proofReference}
                  onChange={(event) => setProofReference(event.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                  {t.amount}
                </span>
                <input
                  type="number"
                  min="1"
                  value={proofAmount}
                  onChange={(event) => setProofAmount(event.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                  {t.date}
                </span>
                <input
                  type="date"
                  value={proofDate}
                  onChange={(event) => setProofDate(event.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                  Proof image / PDF
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
              </label>
            </div>
          )}
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">{t.notes}</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm"
            rows={2}
          />
        </label>

        <div className="space-y-3 rounded-2xl bg-[var(--color-surface-offset)] p-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={emailConsent}
              onChange={(event) => setEmailConsent(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span>{t.emailConsent}</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={whatsappConsent}
              onChange={(event) => setWhatsappConsent(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span>{t.whatsappConsent}</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              required
              type="checkbox"
              checked={termsAgreed}
              onChange={(event) => setTermsAgreed(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span>{language === "zh-HK" ? "我同意條款及細則" : "I agree to the terms"}</span>
          </label>
        </div>

        <TurnstileWidget
          onVerify={setTurnstileToken}
          onExpire={() => setTurnstileToken(null)}
          language={language === "en" ? "en" : "zh-tw"}
        />

        {error && (
          <p role="alert" className="text-sm font-bold text-[var(--color-error)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !termsAgreed || (turnstileEnabled && !turnstileToken)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-6 py-4 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? t.processing : t.submit}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Create the route wrapper**

Create `src/routes/sponsors_.pledge.tsx` (trailing-underscore convention, matching the sibling `sponsors_.$id.tsx`, so this doesn't nest under `sponsors.tsx`):

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { PledgeWizard } from "../components/site/sponsorship/PledgeWizard";

export const Route = createFileRoute("/sponsors_/pledge")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://hkscda.com/sponsors/pledge" }],
  }),
  component: PledgeWizard,
});
```

- [ ] **Step 3: Regenerate the route tree**

TanStack Router's Vite plugin generates `src/routeTree.gen.ts` from route files. Run the dev server briefly (or a build) so it picks up the new route before typechecking:

Run: `bun run build`
Expected: build succeeds; `src/routeTree.gen.ts` is updated to include `/sponsors/pledge` (check with `grep -n "sponsors/pledge" src/routeTree.gen.ts` — it should match).

- [ ] **Step 4: Lint**

Run: `bunx eslint src/components/site/sponsorship/PledgeWizard.tsx src/routes/sponsors_.pledge.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/sponsorship/PledgeWizard.tsx src/routes/sponsors_.pledge.tsx src/routeTree.gen.ts
git commit -m "feat: add the public sponsorship pledge wizard"
```

---

## Task 10: Point the tray's `開始助養` CTA at the wizard

**Files:**
- Modify: `src/components/site/ShortlistTray.tsx`

- [ ] **Step 1: Update the link**

In `src/components/site/ShortlistTray.tsx`, find:

```tsx
          {sponsorshipItems.length > 0 && (
            <Link to="/sponsors" className="btn-cta py-2! px-4! text-xs!">
              開始助養
            </Link>
          )}
```

Replace with:

```tsx
          {sponsorshipItems.length > 0 && (
            <Link to="/sponsors/pledge" className="btn-cta py-2! px-4! text-xs!">
              開始助養
            </Link>
          )}
```

- [ ] **Step 2: Lint and commit**

```bash
bunx eslint src/components/site/ShortlistTray.tsx
git add src/components/site/ShortlistTray.tsx
git commit -m "feat: link the shortlist tray's 開始助養 CTA to the pledge wizard"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: all tests pass (previous ~425 plus the new sponsorship tests).

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (`bun run build` alone does not typecheck — it's esbuild-based.)

- [ ] **Step 3: Lint all new/changed files together**

```bash
bunx eslint \
  src/lib/sponsorship/schemas.ts src/lib/sponsorship/schemas.test.ts \
  src/lib/sponsorship/emailTemplates.server.ts src/lib/sponsorship/emailTemplates.server.test.ts \
  src/lib/sponsorship/submission.server.ts src/lib/sponsorship/submission.server.test.ts \
  src/lib/sponsorship/draft.ts \
  src/routes/api/sponsorships/pledges.ts \
  src/components/site/sponsorship/PledgeWizard.tsx \
  src/routes/sponsors_.pledge.tsx \
  src/components/site/ShortlistTray.tsx \
  src/lib/supabaseMigrations.test.ts
```

Expected: clean. (Avoid `bun run lint` — it lints the whole tree and is slow.)

- [ ] **Step 4: Production build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 5: Manual preview checklist**

Start the dev server and verify (this requires `.env.local` Supabase credentials and at least one `sponsor`-type animal, as in the Phase 1 verification):

- Shortlist ≥1 sponsor animal from `/sponsors`, open the tray, click `開始助養` → lands on `/sponsors/pledge` showing the selected animal(s).
- Pick a preset tier; the displayed amount matches (`HK$300/month` etc.).
- Pick "custom" and enter an amount; the displayed amount updates.
- Fill contact fields, agree to terms, submit **without** proof → success screen shows a `SP-XXXXXXXX` reference; the sponsorship shortlist is now empty (tray disappears if no adoption items remain).
- Repeat, this time checking "include proof", filling method/reference/amount/date, and attaching a small JPEG → submit succeeds.
- Confirm in Supabase (via the dashboard or `list_tables`/`execute_sql` if MCP access is available) that `sponsorship_pledge`, `sponsorship_preference`, and (for the proof case) `sponsorship_payment_proof` rows exist, and the pledge `status` is `pending_payment` for the no-proof case and `provisional` for the proof case.
- Confirm a `message` row was inserted for each submission (`channel = 'email'`).
- If `RESEND_API_KEY` is configured, confirm the email arrives with the correct reference, amount, and (for `pending_payment`) payment instructions.

- [ ] **Step 6: Final commit (if the preview surfaced fixes)**

```bash
git add -A
git commit -m "fix: address sponsorship pledge preview findings"
```

If nothing needed fixing, skip this step.

---

## Self-Review Notes

- **Spec coverage:** data model + private bucket (Task 1) ✓; tier/proof/preference validation (Task 2) ✓; bilingual email (Task 3) ✓; header validation + multipart parsing (Task 4) ✓; transactional persist with orphan cleanup and `provisional`/`pending_payment` derivation (Task 5) ✓; email send with message ledger (Task 6) ✓; API route mirroring adoption's ordering (Task 7) ✓; draft reuse (Task 8) ✓; wizard + route (Task 9) ✓; tray CTA (Task 10) ✓; full verification incl. manual checklist (Task 11) ✓. The "no status link in the email" and "no stored reference column" refinements are called out explicitly in "Plan-Time Refinements" and implemented in Tasks 1, 3, and 5.
- **Type consistency:** `SponsorshipPledgeStatus`, `SponsorshipPledgeSubmission`, `SponsorshipProofDescriptor`, and `SponsorshipPaymentProofMetadata` are defined once in `schemas.ts` and imported with matching names into `submission.server.ts`. `clearIntent("sponsorship")` in the wizard matches the `ShortlistContextValue.clearIntent` signature added in the prior Phase 1 slice. `resolveTierAmountCents` is called with the same `{monthlyTier, customAmountCents}` shape everywhere it's used (schemas tests, `toPledgeInsert`, and the persist result's `amountCents`).
- **Out of scope, unchanged:** admin review surfaces, `active`/`needs_followup`/`cancelled` transitions, the magic-link status page, and lifecycle emails beyond the initial confirmation — all deferred to Slices C and D per the spec.
