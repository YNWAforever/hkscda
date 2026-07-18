# Annual Reports and Donation Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sensitive audit display with CMS-managed annual reports, establish safe PDF asset management, add optional donation-purpose notes, and publish language-aware wedding forms.

**Architecture:** Add a focused `documents` domain with schemas, service, Supabase repository, public readers, and authenticated admin handlers. Public pages receive initial data from TanStack route loaders; admin lists stay paginated and upload PDFs directly to Supabase through signed upload URLs. Extend the existing donation domain without changing its controlled purpose or payment-provider lifecycle.

**Tech Stack:** TanStack Start, React 19, TypeScript, Zod, Tailwind CSS, Supabase Postgres/Storage, Bun test, Vite, Playwright

## Global Constraints

- Work from `codex/hkscda-content-expansion-design` in the isolated worktree.
- Follow the existing TanStack Start service/repository/HTTP boundaries; do not introduce Next.js APIs.
- Public PDFs use Supabase Storage bucket `site-documents`; receipt templates stay private in `receipts`.
- Exact page title: `年度報告 Annual Report`.
- Exact page description: `我們每年發表協會年度報告電子書，分享救援成果與資金運用摘要。`
- Exact wedding title: `💍 Share the Love – 婚宴回禮計劃`.
- Exact wedding intro: `以婚禮分享愛心，賓客祝福化作救援能量。填寫表格，我們會與您聯絡安排感謝證書及小卡。`
- Exact custom-purpose label: `其他捐款用途（婚宴／活動／粉絲籌款 等）`.
- Keep `purpose` controlled; canonical medical URL is `/donate?purpose=medical`.
- Missing 2023-24 and receipt-template files must never produce public links.
- Write failing tests before production changes and commit after every independently reviewable task.

---

## File Structure

- Create `supabase/migrations/20260718100000_public_documents_and_donation_purpose.sql`: tables, indexes, RLS, Storage bucket, null receipt configuration, and donation column.
- Modify `src/lib/supabaseMigrations.test.ts`: migration safety contract.
- Create `src/lib/documents/types.ts`: public/admin document contracts.
- Create `src/lib/documents/schemas.ts` and `.test.ts`: list, mutation, path, and upload schemas.
- Create `src/lib/documents/service.ts` and `.test.ts`: publication/reference/upload rules and audit actions.
- Create `src/lib/documents/repository.server.ts` and `.test.ts`: selected-column Supabase queries and Storage operations.
- Create `src/lib/documents/http.server.ts` and `.test.ts`: safe public/admin response handling.
- Create `src/lib/documents/public.server.ts` and `.test.ts`: annual-report and slot readers for SSR loaders.
- Create `src/routes/api/admin/documents/-handlers.ts`: dependency wiring and admin roles.
- Create admin routes under `src/routes/api/admin/documents/` and `src/routes/api/admin/annual-reports/`.
- Create `src/components/admin/content/DocumentManagement.tsx` and `AnnualReportManagement.tsx` with focused tests.
- Create `/admin/content/documents` and `/admin/content/annual-reports` route files.
- Modify `src/components/admin/content/ContentManagement.tsx`: module links only; do not merge document rows into story queries.
- Modify `src/routes/report/audit.tsx` and create `src/routes/report/audit.test.tsx`.
- Modify donation domain, service, repository, search, route, admin/export projections, and their focused tests.
- Modify `src/routes/donate.tsx` and create `src/routes/donate.test.tsx`.
- Regenerate `src/routeTree.gen.ts` through the route plugin; never edit it manually.

### Task 1: Add the document and donation schema migration

**Files:**

- Create: `supabase/migrations/20260718100000_public_documents_and_donation_purpose.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

**Interfaces:**

- Consumes: existing `private.has_admin_role(text[])`, `public.set_updated_at()`, private `receipts` bucket.
- Produces: `document_assets`, `site_document_slots`, `annual_reports`, `site_config`, `donation.custom_purpose`, and `site-documents` bucket.

- [ ] **Step 1: Write the failing migration safety test**

Add a test that loads the new migration and asserts all security-critical clauses:

```ts
test("adds publish-safe public documents and bounded donation purpose notes", () => {
  const sql = readMigration("20260718100000_public_documents_and_donation_purpose.sql");
  expect(sql).toContain("create table if not exists public.document_assets");
  expect(sql).toContain("unique (slot_key, language)");
  expect(sql).toContain("alter table public.donation add column if not exists custom_purpose text");
  expect(sql).toContain("check (custom_purpose is null or char_length(custom_purpose) <= 200)");
  expect(sql).toContain("revoke all on public.document_assets from anon, authenticated");
  expect(sql).toContain("values ('site-documents', 'site-documents', true, 52428800");
  expect(sql).toContain("'donation_receipt_template_url'");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/supabaseMigrations.test.ts`
Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Create the additive migration**

Use these exact table shapes and constraints:

```sql
create table if not exists public.document_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('annual_report', 'wedding_form', 'adoption_guide')),
  title text not null check (char_length(title) between 1 and 180),
  language text not null check (language in ('zh-HK', 'en', 'bilingual')),
  bucket_name text not null default 'site-documents',
  object_path text not null unique check (object_path !~ '(^/|\\.\\.)'),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_document_slots (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null check (slot_key ~ '^[a-z0-9_]+$'),
  language text not null check (language in ('zh-HK', 'en')),
  document_asset_id uuid not null references public.document_assets(id) on delete restrict,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slot_key, language)
);

create table if not exists public.annual_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  year_label text not null unique,
  document_asset_id uuid not null references public.document_assets(id) on delete restrict,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_config (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

alter table public.donation add column if not exists custom_purpose text;
alter table public.donation drop constraint if exists donation_custom_purpose_length_check;
alter table public.donation add constraint donation_custom_purpose_length_check
  check (custom_purpose is null or char_length(custom_purpose) <= 200);

create index if not exists document_assets_public_idx
  on public.document_assets (kind, is_published, sort_order, created_at desc);
create index if not exists annual_reports_public_idx
  on public.annual_reports (is_published, sort_order, created_at desc);

alter table public.document_assets enable row level security;
alter table public.site_document_slots enable row level security;
alter table public.annual_reports enable row level security;
alter table public.site_config enable row level security;

grant select, insert, update, delete on public.document_assets to service_role;
grant select, insert, update, delete on public.site_document_slots to service_role;
grant select, insert, update, delete on public.annual_reports to service_role;
grant select, insert, update, delete on public.site_config to service_role;
revoke all on public.document_assets from anon, authenticated;
revoke all on public.site_document_slots from anon, authenticated;
revoke all on public.annual_reports from anon, authenticated;
revoke all on public.site_config from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-documents', 'site-documents', true, 52428800, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.site_config (key, value)
values ('donation_receipt_template_url', null)
on conflict (key) do nothing;
```

Add updated-at triggers and no report, asset, or slot seed rows. Asset metadata requires verified uploaded bytes and therefore is created only through the admin upload workflow. Do not create a 2023-24 report row.

- [ ] **Step 4: Run migration tests**

Run: `bun test src/lib/supabaseMigrations.test.ts src/lib/content/migrationPolicy.test.ts`
Expected: PASS with zero failures.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260718100000_public_documents_and_donation_purpose.sql src/lib/supabaseMigrations.test.ts
git commit -m "feat: add public document schema"
```

### Task 2: Define document contracts and validation

**Files:**

- Create: `src/lib/documents/types.ts`
- Create: `src/lib/documents/schemas.ts`
- Create: `src/lib/documents/schemas.test.ts`

**Interfaces:**

- Consumes: Zod.
- Produces: `DocumentAsset`, `AnnualReport`, `DocumentSlot`, `documentAssetInputSchema`, `annualReportInputSchema`, `documentListSearchSchema`, `uploadTargetSchema`.

- [ ] **Step 1: Write failing schema tests**

```ts
test("normalizes a PDF asset and rejects unsafe paths", () => {
  expect(
    documentAssetInputSchema.parse({
      kind: "annual_report",
      title: "Annual Report 2025–26",
      language: "bilingual",
      objectPath: "transparency/annual-reports/annual_report_2526.pdf",
      byteSize: 1024,
    }).objectPath,
  ).toBe("transparency/annual-reports/annual_report_2526.pdf");
  expect(() =>
    documentAssetInputSchema.parse({
      kind: "annual_report",
      title: "Bad",
      language: "en",
      objectPath: "../bad.pdf",
      byteSize: 10,
    }),
  ).toThrow();
});

test("bounds admin document pagination", () => {
  expect(documentListSearchSchema.parse({ page: "2", pageSize: "500" })).toMatchObject({
    page: 2,
    pageSize: 50,
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/documents/schemas.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add the contracts and schemas**

Define the public contract exactly:

```ts
export type DocumentKind = "annual_report" | "wedding_form" | "adoption_guide";
export type DocumentLanguage = "zh-HK" | "en" | "bilingual";
export type DocumentAsset = {
  id: string;
  kind: DocumentKind;
  title: string;
  language: DocumentLanguage;
  bucketName: string;
  objectPath: string;
  fileUrl: string | null;
  mimeType: "application/pdf";
  byteSize: number;
  checksumSha256: string | null;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
export type AnnualReport = {
  id: string;
  title: string;
  yearLabel: string;
  document: DocumentAsset;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
export type DocumentSlot = {
  id: string;
  slotKey: string;
  language: "zh-HK" | "en";
  document: DocumentAsset;
  isPublished: boolean;
};
```

Use `z.coerce.number().int()` for page values, a 50 MiB maximum, `.pdf` suffix enforcement, no leading slash, no `..`, and a `slotKey` regex of `/^[a-z0-9_]+$/`. The 50 MiB ceiling accommodates the supplied 29.4 MiB annual report with headroom while remaining bounded.

- [ ] **Step 4: Run schema tests**

Run: `bun test src/lib/documents/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/types.ts src/lib/documents/schemas.ts src/lib/documents/schemas.test.ts
git commit -m "feat: define document contracts"
```

### Task 3: Add the document service, repository, and HTTP boundary

**Files:**

- Create: `src/lib/documents/service.ts`
- Create: `src/lib/documents/service.test.ts`
- Create: `src/lib/documents/repository.server.ts`
- Create: `src/lib/documents/repository.server.test.ts`
- Create: `src/lib/documents/http.server.ts`
- Create: `src/lib/documents/http.test.ts`
- Create: `src/lib/documents/public.server.ts`
- Create: `src/lib/documents/public.server.test.ts`

**Interfaces:**

- Consumes: Task 2 schemas/types and a Supabase service client.
- Produces: `createDocumentService`, `createSupabaseDocumentRepository`, `createDocumentHandlers`, `loadPublishedAnnualReports`, `loadPublishedDocumentSlots`.

- [ ] **Step 1: Write failing service and repository tests**

Cover these exact behaviors:

```ts
test("publishing requires a verified Storage object", async () => {
  repo.verifyObject.mockResolvedValue(false);
  await expect(service.publishAsset({ actorUserId: "admin", assetId: "asset" })).rejects.toThrow(
    "Document object is missing",
  );
});

test("public annual reports select only published report and asset rows", async () => {
  await repository.listPublishedAnnualReports();
  expect(fake.queryFor("annual_reports").selectedColumns).toContain("document_assets!");
  expect(fake.queryFor("annual_reports").filters).toContainEqual(["eq", "is_published", true]);
});
```

HTTP tests must assert 401/403 before service work, 400 for Zod issues, 409 for referenced deletion, and `cache-control: no-store` for admin responses.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `bun test src/lib/documents/service.test.ts src/lib/documents/repository.server.test.ts src/lib/documents/http.test.ts src/lib/documents/public.server.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Add the minimal domain implementation**

Use this repository boundary:

```ts
export type DocumentRepository = {
  listPublishedAnnualReports(): Promise<AnnualReport[]>;
  listPublishedSlots(slotKeys: string[]): Promise<DocumentSlot[]>;
  listAssets(search: DocumentListSearch): Promise<{ items: DocumentAsset[]; total: number }>;
  createAsset(input: DocumentAssetInput): Promise<DocumentAsset>;
  updateAsset(id: string, input: Partial<DocumentAssetInput>): Promise<DocumentAsset>;
  setAssetPublished(id: string, isPublished: boolean): Promise<DocumentAsset>;
  countAssetReferences(id: string): Promise<number>;
  deleteAsset(id: string): Promise<void>;
  createSignedUploadUrl(objectPath: string): Promise<{ token: string; path: string }>;
  verifyObject(objectPath: string): Promise<boolean>;
  insertAuditLog(row: DocumentAuditLogInsert): Promise<void>;
};
```

`createDocumentService` parses every input, verifies objects before publication, rejects referenced deletion with `DocumentConflictError`, and logs `document.create`, `document.update`, `document.publish`, `document.unpublish`, and `document.delete`.

Resolve public URLs only through:

```ts
function publicDocumentUrl(client: SupabaseClient, bucket: string, path: string) {
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
```

Public repository queries select explicit columns and require publication on both the domain row and joined asset. The public reader catches provider errors and throws `Could not load annual reports` or `Could not load document slots` without leaking Supabase details.

- [ ] **Step 4: Run focused tests**

Run the command from Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents
git commit -m "feat: add document service and repository"
```

### Task 4: Add authenticated document and annual-report administration

**Files:**

- Create: `src/routes/api/admin/documents/-handlers.ts`
- Create: `src/routes/api/admin/documents.ts`
- Create: `src/routes/api/admin/documents/$id.ts`
- Create: `src/routes/api/admin/documents/$id/publish.ts`
- Create: `src/routes/api/admin/documents/upload-target.ts`
- Create: `src/routes/api/admin/annual-reports.ts`
- Create: `src/routes/api/admin/annual-reports/$id.ts`
- Create: `src/components/admin/content/DocumentManagement.tsx`
- Create: `src/components/admin/content/DocumentManagement.test.tsx`
- Create: `src/components/admin/content/AnnualReportManagement.tsx`
- Create: `src/components/admin/content/AnnualReportManagement.test.tsx`
- Create: `src/routes/admin/content/documents.tsx`
- Create: `src/routes/admin/content/annual-reports.tsx`
- Modify: `src/components/admin/content/ContentManagement.tsx`

**Interfaces:**

- Consumes: Task 3 handlers and existing `fetchAdminJson`.
- Produces: paginated document UI, signed upload flow, report ordering, and publish controls.

- [ ] **Step 1: Write failing component tests**

```tsx
test("document management loads summaries and uploads directly with the signed token", async () => {
  render(<DocumentManagement />);
  expect(await screen.findByRole("heading", { name: "文件" })).toBeTruthy();
  await userEvent.upload(screen.getByLabelText("PDF 檔案"), pdfFile);
  expect(fetchMock).toHaveFetched("/api/admin/documents/upload-target");
  expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
});

test("annual reports do not offer publish when the asset is unpublished", () => {
  render(<AnnualReportManagement initialRows={[draftReport]} />);
  expect(screen.getByRole("button", { name: "發佈" })).toBeDisabled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/components/admin/content/DocumentManagement.test.tsx src/components/admin/content/AnnualReportManagement.test.tsx`
Expected: FAIL because the components do not exist.

- [ ] **Step 3: Add routes and focused admin components**

Wire admin auth exactly as existing content handlers:

```ts
requireDocumentAdmin: (request) => requireAdmin(request, ["staff", "admin"], client);
```

Use React Query keys `['admin-documents', search]` and `['admin-annual-reports']`. Document list responses contain summary columns only. File selection validates PDF MIME and 50 MiB before requesting a signed target; call Supabase `uploadToSignedUrl(path, token, file, { contentType: 'application/pdf' })`; create metadata only after upload succeeds. Mutations invalidate only their own list/detail keys.

Add links labelled `文件` and `年度報告` to the content workspace without changing the existing story list query.

- [ ] **Step 4: Run admin tests and generate routes**

Run: `bun test src/components/admin/content/DocumentManagement.test.tsx src/components/admin/content/AnnualReportManagement.test.tsx src/components/admin/content/ContentManagement.test.tsx`
Expected: PASS.

Run: `bun run build`
Expected: exit 0 and route tree contains both new admin paths.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/admin/documents src/routes/api/admin/documents.ts src/routes/api/admin/annual-reports src/routes/api/admin/annual-reports.ts src/routes/admin/content src/components/admin/content src/routeTree.gen.ts
git commit -m "feat: manage annual report documents"
```

### Task 5: Replace the audit page with published annual reports

**Files:**

- Modify: `src/routes/report/audit.tsx`
- Create: `src/routes/report/audit.test.tsx`

**Interfaces:**

- Consumes: `loadPublishedAnnualReports(): Promise<AnnualReport[]>`.
- Produces: loader-backed annual report page with no sensitive financial values.

- [ ] **Step 1: Write the failing route test**

```tsx
test("renders annual reports and removes all sensitive audit summaries", () => {
  const html = renderToString(<AnnualReportPage reports={[report2526, report2425]} />);
  expect(html).toContain("年度報告 Annual Report");
  expect(html).toContain("我們每年發表協會年度報告電子書，分享救援成果與資金運用摘要。");
  expect(html).not.toContain("總收入");
  expect(html).not.toContain("總支出");
  expect(html).not.toContain("盈餘");
  expect(html.match(/查看報告/g)).toHaveLength(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/routes/report/audit.test.tsx`
Expected: FAIL because the current page renders audit figures.

- [ ] **Step 3: Add the loader-backed page**

Export a testable `AnnualReportPage({ reports })`. Remove `auditData`, `StatCard`, and `AuditChart` imports. The route loader calls `loadPublishedAnnualReports`; head/JSON-LD/breadcrumb copy uses annual-report wording. Render a three-column desktop/one-column mobile grid with PDF icon, title, year, formatted byte size, and:

```tsx
<a
  href={report.document.fileUrl!}
  target="_blank"
  rel="noopener noreferrer"
  className="btn-primary min-h-11"
>
  查看報告 / View Report
</a>
```

Filter out rows with null `fileUrl` defensively. The empty state provides `info@hkscda.com` without restoring financial figures.

- [ ] **Step 4: Run route and brand tests**

Run: `bun test src/routes/report/audit.test.tsx src/components/site/SiteChrome.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/report/audit.tsx src/routes/report/audit.test.tsx
git commit -m "feat: publish annual report library"
```

### Task 6: Persist optional custom donation purpose

**Files:**

- Modify: `src/lib/donations/domain.ts`
- Modify: `src/lib/donations/domain.test.ts`
- Modify: `src/lib/donations/service.ts`
- Modify: `src/lib/donations/service.test.ts`
- Modify: `src/lib/donations/supabase.server.ts`
- Modify: `src/lib/donations/adminPayments.ts`
- Modify: `src/lib/donations/adminPayments.server.ts`
- Modify: `src/routes/api/admin/exports/donations[.]csv.ts`

**Interfaces:**

- Consumes: `donationRequestSchema` and `DonationRepository.createDonation`.
- Produces: normalized `customPurpose?: string` and database `custom_purpose` projection.

- [ ] **Step 1: Write failing domain and service tests**

```ts
test("trims optional custom purpose and converts blank text to undefined", () => {
  expect(
    donationRequestSchema.parse({ ...validRequest, customPurpose: "  婚宴回禮  " }).customPurpose,
  ).toBe("婚宴回禮");
  expect(
    donationRequestSchema.parse({ ...validRequest, customPurpose: "   " }).customPurpose,
  ).toBeUndefined();
});

test("stores custom purpose without changing the controlled checkout purpose", async () => {
  await createDonation({
    input: { ...validRequest, purpose: "medical", customPurpose: "個案 A" },
    repository,
    providers,
  });
  expect(repository.createDonation).toHaveBeenCalledWith(
    expect.objectContaining({ custom_purpose: "個案 A" }),
  );
  expect(providers.createStripeCheckout).toHaveBeenCalledWith(
    expect.objectContaining({ purpose: "medical" }),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/donations/domain.test.ts src/lib/donations/service.test.ts`
Expected: FAIL because `customPurpose` is not accepted or persisted.

- [ ] **Step 3: Thread the field through existing contracts**

Add to `donationRequestSchema`:

```ts
customPurpose: z.string().trim().max(200).optional().transform((value) => value || undefined),
```

Add `custom_purpose: donationInput.customPurpose ?? null` to the repository insert. Extend admin payment/detail and CSV types/selects with `custom_purpose`; use display label `其他用途` in CSV. Do not add the text to Stripe/PayPal provider metadata or reconciliation matching.

- [ ] **Step 4: Run donation regression tests**

Run: `bun test src/lib/donations/domain.test.ts src/lib/donations/service.test.ts src/lib/donations/adminPayments.server.test.ts src/lib/donations/reconcile.server.test.ts src/routes/api/webhooks/-stripe.test.ts src/routes/api/webhooks/-paypal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/donations src/routes/api/admin/exports/donations\[.\]csv.ts
git commit -m "feat: store custom donation purpose"
```

### Task 7: Add donation search selection and wedding forms

**Files:**

- Modify: `src/lib/donations/donateSearch.ts`
- Modify: `src/lib/donations/donateSearch.test.ts`
- Modify: `src/routes/donate.tsx`
- Create: `src/routes/donate.test.tsx`

**Interfaces:**

- Consumes: `loadPublishedDocumentSlots(["wedding_gift_return_plan"])` and controlled `DonationPurpose`.
- Produces: `DonateSearch.purpose`, request `customPurpose`, and language-aware form links.

- [ ] **Step 1: Write failing search and route tests**

```ts
test("accepts only controlled donation purpose query values", () => {
  expect(donateSearchSchema.parse({ purpose: "medical" }).purpose).toBe("medical");
  expect(donateSearchSchema.parse({ purpose: "醫療" }).purpose).toBeUndefined();
});
```

```tsx
test("renders the optional purpose note and matching wedding form language", () => {
  render(
    <DonatePage initialSlots={[zhWedding, enWedding]} initialSearch={{ purpose: "medical" }} />,
  );
  expect(screen.getByLabelText("其他捐款用途（婚宴／活動／粉絲籌款 等）")).toBeTruthy();
  expect(screen.getByRole("link", { name: "下載表格 / Download Form" })).toHaveAttribute(
    "href",
    zhWedding.document.fileUrl,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/donations/donateSearch.test.ts src/routes/donate.test.tsx`
Expected: FAIL because purpose and slots are not wired.

- [ ] **Step 3: Update the route and form**

Extend search with `purpose: z.enum(donationPurposes).optional().catch(undefined)`. Initialize state from `search.purpose ?? "general"`. Add `customPurpose` state and request body property.

Add a route loader for `wedding_gift_return_plan` slots. Export a testable page component that receives loader slots. Render the exact title/intro below the form; choose `zh-HK` or `en` from the page language and show an alternate-language link only when that published slot exists. Every PDF anchor uses a new tab and safe rel attributes.

- [ ] **Step 4: Run route, donation, and accessibility tests**

Run: `bun test src/lib/donations/donateSearch.test.ts src/routes/donate.test.tsx src/lib/donations/domain.test.ts src/lib/donations/service.test.ts src/lib/brand/publicFormGuard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/donations/donateSearch.ts src/lib/donations/donateSearch.test.ts src/routes/donate.tsx src/routes/donate.test.tsx
git commit -m "feat: add wedding donation documents"
```

### Task 8: Verify, upload, migrate, and deploy PR 1

**Files:**

- Verify only; record deployment evidence in the pull request.

**Interfaces:**

- Consumes: Tasks 1-7.
- Produces: migrated database, four uploaded public PDFs, two published annual reports, two published wedding slots, and verified Vercel deployment.

- [ ] **Step 1: Run the focused suite**

Run:

```bash
bun test src/lib/documents src/lib/donations src/routes/report/audit.test.tsx src/routes/donate.test.tsx src/lib/supabaseMigrations.test.ts src/components/admin/content
```

Expected: zero failures.

- [ ] **Step 2: Run repository-wide static verification**

Run: `bun run lint`
Expected: exit 0, or record only pre-existing baseline findings with exact paths.

Run: `bun run build`
Expected: exit 0 and generated routes include document administration.

- [ ] **Step 3: Verify and apply Supabase changes**

Run: `supabase status` and `supabase projects list`; confirm the linked project is the intended HKSCDA production project before continuing.

Run: `supabase db push --dry-run`
Expected: only `20260718100000_public_documents_and_donation_purpose.sql` is pending.

Run: `supabase db push`
Expected: migration applied once with no SQL error.

- [ ] **Step 4: Upload and publish supplied assets through the admin UI**

Upload these exact source files through the signed-upload flow, then create their asset metadata from the verified object path, MIME type, byte size, and checksum:

```text
C:\Users\laich\Downloads\2025-2026 Annual report.pdf
C:\Users\laich\Downloads\2024-2025 Year-End Review Winter Edition.pdf
C:\Users\laich\Downloads\HKSCDA_Wedding Donation Form (2021)-Chi_fillable_update.pdf
C:\Users\laich\Downloads\HKSCDA_Wedding Donation Form (2021)-Eng_fillable_update.pdf
```

Verify MIME, byte size, open/download behavior, and wedding AcroForm fields before publishing the two reports and two slots. Leave 2023-24 and `donation_receipt_template_url` unpublished/null.

- [ ] **Step 5: Deploy and perform browser verification**

Deploy the branch to Vercel. Verify desktop and mobile for `/report/audit`, `/donate`, `/admin/content/documents`, and `/admin/content/annual-reports`. Submit one FPS test donation with `purpose=medical` and `customPurpose="PR1 verification"`; verify the saved row and remove/mark the test record according to existing test-data policy.

- [ ] **Step 6: Commit any generated route-only change**

If `src/routeTree.gen.ts` changed after the final build:

```bash
git add src/routeTree.gen.ts
git commit -m "chore: refresh document routes"
```
