/** D1: real components/handler factories, synthetic in-memory repositories; never a DB/UAT test. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBankStatementPreviewHandler } from "../src/routes/api/admin/finance/bank-statement-preview";
import { createBankMatchOperationHandler } from "../src/routes/api/admin/finance/bank-match-operations";
import { createBankStatementDryRunService } from "../src/lib/donations/bankStatementDryRun.server";
import { createBankMatchPreviewService } from "../src/lib/donations/bankMatchConfirmation.server";
import type { BankMatchOperation } from "../src/lib/donations/bankMatchConfirmation";
import { createProofUploadUrlHandler } from "../src/routes/api/sponsorships/pledges/proof-upload-url";
import { createSponsorshipFinanceReadHandler } from "../src/lib/sponsorshipAdmin/finance.http.server";
import {
  createSponsorshipFinanceRepository,
  financeCommandSchema,
} from "../src/lib/sponsorshipAdmin/finance.server";
import { handleRecordPaymentUpload } from "../src/routes/api/admin/sponsorships/pledges/-recordPaymentUpload";
import { createSponsorshipAdminService } from "../src/lib/sponsorshipAdmin/service";
import { createSponsorshipAdminHandlers } from "../src/lib/sponsorshipAdmin/http.server";
import type { PledgeDetail } from "../src/lib/sponsorshipAdmin/types";

const origin = "http://127.0.0.1:56571";
const output = process.env.D1_OUTPUT_DIR ?? "/workspace/cli-logs/hkscda-d1-fixture";
await mkdir(output, { recursive: true });
const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const paymentId = "11111111-1111-4111-8111-111111111111";
const pledgeId = "33333333-3333-4333-8333-333333333333";
const legacyProofId = "77777777-7777-4777-8777-777777777777";
const sources: Array<{
  proof_id: string;
  payment_id: string;
  donation_id: string;
  source: string;
}> = [];
const proofId = "44444444-4444-4444-8444-444444444444";
const admin = {
  id: actor,
  authUserId: actor,
  email: "fixture@example.invalid",
  role: "admin" as const,
  status: "active" as const,
};
const now = () => new Date("2026-10-28T04:00:00Z");
const objects = new Map<string, number>();
const calls: string[] = [];
let paymentStatus: "pending" | "succeeded" = "pending";
let operation: BankMatchOperation;
let paymentReads = 0;
let loseSnapshotRead = false;
const preview = createBankStatementDryRunService({
  now,
  lookup: async () => ({
    kind: "ok",
    creditedReferences: paymentStatus === "succeeded" ? ["D1-BANK-001"] : [],
    pendingPayments:
      paymentStatus === "pending"
        ? [
            {
              id: paymentId,
              provider: "fps",
              providerRef: "HKSCDA-D1-FIXTURE",
              amountCents: 30000,
              paymentStatus,
              donationStatus: paymentStatus,
            },
          ]
        : [],
  }),
});
const bank = createBankMatchOperationHandler({
  authorize: async () => actor,
  create: createBankMatchPreviewService({
    preview,
    persist: async (_actor, fileSha256, items) => {
      operation = {
        operationId: "55555555-5555-4555-8555-555555555555",
        fileSha256,
        createdAt: now().toISOString(),
        expiresAt: "2026-10-28T04:30:00Z",
        state: "queued",
        items: items.map((i) => ({
          ...i,
          status: "pending",
          reasonCode: null,
          deliveryJobId: null,
          appliedAt: null,
        })),
      };
      return operation;
    },
  }),
  get: async () => {
    if (loseSnapshotRead) {
      loseSnapshotRead = false;
      throw Error("synthetic lost snapshot read");
    }
    return operation;
  },
  apply: async (_actor, _id, ordinal) => {
    const item = operation.items.find((i) => i.ordinal === ordinal)!;
    paymentStatus = "succeeded";
    operation.state = "done";
    item.status = "succeeded";
    item.appliedAt = now().toISOString();
    calls.push("bank fixture applied");
    loseSnapshotRead = true;
    return { ...item };
  },
});
const statement = createBankStatementPreviewHandler({ authorize: async () => actor, preview });
const pledge: PledgeDetail = {
  id: pledgeId,
  supporterId: "66666666-6666-4666-8666-666666666666",
  supporterName: "D1 synthetic supporter",
  supporterEmail: "fixture@example.invalid",
  supporterPhone: null,
  monthlyTier: "300",
  amountCents: 30000,
  currency: "HKD",
  language: "en",
  status: "pending_payment",
  notes: null,
  createdAt: now().toISOString(),
  updatedAt: now().toISOString(),
  preferences: [],
  assignments: [],
  proofHistory: [],
  currentProof: null,
  periods: [],
  needsAnimal: false,
  recentAuditLog: [],
};
const storageClient = {
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === "reconcile_legacy_sponsorship_payment") {
      assert.equal(args.p_actor, actor);
      assert.equal(args.p_proof, legacyProofId);
      assert.equal(args.p_payment, paymentId);
      assert.equal(args.p_reason, "Verified synthetic bank deposit");
      sources.push({
        proof_id: legacyProofId,
        payment_id: paymentId,
        donation_id: "donation-fixture",
        source: "legacy_reconciled",
      });
      calls.push("existing bank payment linked to legacy proof in fixture");
    }
    return { data: { kind: "linked" }, error: null };
  },
  from: () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: { id: legacyProofId }, error: null }),
    };
    return query;
  },
  storage: {
    from: () => ({
      upload: async (path: string, file: File) => {
        objects.set(path, file.size);
        calls.push("staff object uploaded");
        return { error: null };
      },
      createSignedUrl: async () => ({
        error: null,
        data: { signedUrl: origin + "/fixture-proof.png" },
      }),
    }),
  },
} as unknown as SupabaseClient;
const service = createSponsorshipAdminService({
  client: storageClient,
  sendPledgeStatusUpdateEmail: async () => {
    calls.push("email stub only");
  },
  repo: {
    listPledges: async () => {
      throw Error("Unexpected fixture listPledges");
    },
    cancelPledge: async () => {
      throw Error("Unexpected fixture cancelPledge");
    },
    allocateProof: async () => {
      throw Error("Unexpected fixture allocateProof");
    },
    assignAnimal: async () => {
      throw Error("Unexpected fixture assignAnimal");
    },
    endAssignment: async () => {
      throw Error("Unexpected fixture endAssignment");
    },
    getPledgeDetail: async () => structuredClone(pledge),
    getProofSigningInfo: async () => ({
      storagePath: pledge.currentProof!.storagePath!,
      fileName: "synthetic.png",
    }),
    recordPayment: async (input) => {
      assert.equal(objects.get(input.storagePath!), input.fileSize);
      pledge.status = "provisional";
      pledge.currentProof = {
        id: proofId,
        revision: 1,
        pledgeId,
        storagePath: input.storagePath,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: input.fileSize,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        amountCents: input.amountCents,
        paymentDate: input.paymentDate,
        reviewStatus: "pending",
        source: "staff",
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: now().toISOString(),
      };
      pledge.proofHistory = [pledge.currentProof!];
      calls.push("staff proof persisted in fixture");
      return { id: proofId };
    },
    reviewProof: async (input) => {
      assert.equal(input.proofId, proofId);
      assert.equal(input.expectedRevision, 1);
      pledge.currentProof!.reviewStatus = "approved";
      pledge.status = "active";
      // Seed a separate, historical unlinked proof to exercise the legacy link UI.
      // New proof approval has its own source; bankfeed does not auto-approve pledges.
      sources.push({
        proof_id: proofId,
        payment_id: "new-proof-payment-fixture",
        donation_id: "new-proof-donation-fixture",
        source: "proof_approved",
      });
      pledge.proofHistory.push({
        ...pledge.currentProof!,
        id: legacyProofId,
        reference: "LEGACY-FIXTURE",
        storagePath: null,
        fileName: null,
        fileType: null,
        fileSize: null,
      });
      calls.push("exact sponsorship proof reviewed in fixture");
      return {
        kind: "reviewed",
        proofId,
        revision: 1,
        decision: input.decision,
        allocations: [],
        replayed: false,
      };
    },
  },
});
const pledgeHandlers = createSponsorshipAdminHandlers({
  requireReader: async () => admin,
  requireFinance: async () => admin,
  requireCoordinator: async () => admin,
  service,
});
const finance = createSponsorshipFinanceReadHandler({
  requireReader: async () => admin,
  read: async (_id, canFinance = false) => ({
    sources,
    receipts: [],
    refunds: [],
    deliveries: [],
    candidates:
      canFinance && paymentStatus === "succeeded"
        ? [
            {
              id: paymentId,
              amount_cents: 30000,
              bank_reference: "D1-BANK-001",
              received_at: now().toISOString(),
              donation: [{ supporter_id: pledge.supporterId }],
            },
          ]
        : [],
  }),
});
const publicUpload = createProofUploadUrlHandler({
  rateLimit: async () => ({ ok: true }),
  verify: async () => true,
  createClient: () => storageClient,
  signUploads: async (_client, _bucket, id) => [
    {
      category: "proof",
      path: `${id}/proof/synthetic.png`,
      token: "fixture-upload-token",
      signedUrl: origin + "/fixture-storage",
    },
  ],
  issueIntent: () => "fixture-intent-no-public-authority",
  registerIntent: async () => {
    calls.push("public intent registered in fixture");
  },
  randomUUID: () => pledgeId,
  now,
});

assert.equal(
  await fetch(origin)
    .then(() => true)
    .catch(() => false),
  false,
  "Fixture port is already in use; do not reuse another process",
);
const server = spawn(
  "node",
  ["node_modules/vite/bin/vite.js", "--config", "scripts/fixtures/payment-bankfeed.vite.ts"],
  { stdio: "ignore", env: { ...process.env, VITE_PUBLIC_DONATION_CHECKOUT_ENABLED: "false" } },
);
const browser = await chromium.launch().catch((error: unknown) => {
  server.kill("SIGTERM");
  throw error;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (
      await fetch(origin)
        .then(() => true)
        .catch(() => false)
    ) {
      ready = true;
      break;
    }
    await Bun.sleep(500);
  }
  assert.ok(ready, "Task-owned Vite fixture failed to start");
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  page.setDefaultTimeout(12000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("**/*", async (route) => {
    const incoming = route.request();
    const url = new URL(incoming.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/fixture-proof.png")
      return route.fulfill({ contentType: "image/png", body: png });
    if (url.pathname === "/fixture-storage") {
      objects.set(incoming.headers()["x-fixture-path"], incoming.postDataBuffer()!.length);
      calls.push("public object uploaded");
      return route.fulfill({ json: {} });
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const request = new Request(incoming.url(), {
      method: incoming.method(),
      headers: incoming.headers(),
      ...(incoming.postDataBuffer() ? { body: new Uint8Array(incoming.postDataBuffer()!) } : {}),
    });
    let response: Response;
    const path = url.pathname;
    if (path.endsWith("/proof-upload-url")) response = await publicUpload(request);
    else if (path.endsWith("/bank-statement-preview")) response = await statement(request);
    else if (path.endsWith("/bank-match-operations")) response = await bank(request);
    else if (path.endsWith("/me")) response = Response.json({ admin });
    else if (path === "/api/admin/payments") {
      paymentReads++;
      response = Response.json({
        payments: [
          {
            id: paymentId,
            provider: "fps",
            provider_ref: "HKSCDA-D1-FIXTURE",
            amount_cents: 30000,
            status: paymentStatus,
            received_at: null,
            bank_reference: null,
            created_at: now().toISOString(),
            donation: {
              id: "donation-fixture",
              purpose: "general",
              custom_purpose: null,
              receipt_requested: false,
              status: paymentStatus,
              supporter: {
                id: "fixture",
                name: "D1 donation fixture",
                email: "fixture@example.invalid",
                phone: null,
                language: "en",
              },
            },
          },
        ],
        receipts: [],
        total: 1,
        page: 1,
        pageSize: 25,
        summary: {
          awaitingReconcile: paymentStatus === "pending" ? 1 : 0,
          awaitingReceipt: 0,
          confirmedAmountCents: paymentStatus === "succeeded" ? 30000 : 0,
        },
      });
    } else if (path.endsWith("/activity")) response = Response.json({ activity: [] });
    else if (path.includes("/delivery-jobs"))
      response = Response.json({ jobs: [], total: 0, page: 1, pageSize: 25 });
    else if (path === `/api/admin/sponsorships/pledges/${pledgeId}`)
      response = await pledgeHandlers.getPledge({ request, params: { id: pledgeId } });
    else if (path.endsWith("/proof-url"))
      response = await pledgeHandlers.getProofUrl({ request, params: { id: pledgeId } });
    else if (path.endsWith("/proof"))
      response = await handleRecordPaymentUpload({
        request,
        pledgeId,
        client: storageClient,
        service,
        requireCoordinator: async () => admin,
      });
    else if (path.endsWith("/review"))
      response = await pledgeHandlers.reviewProof({ request, params: { id: pledgeId } });
    else if (path.endsWith("/finance")) {
      response =
        incoming.method() === "GET"
          ? await finance({ request, params: { id: pledgeId } })
          : Response.json(
              await createSponsorshipFinanceRepository(storageClient).command(
                actor,
                pledgeId,
                financeCommandSchema.parse(await request.json()),
              ),
            );
    } else {
      errors.push(`Unexpected fixture API ${incoming.method()} ${path}`);
      response = Response.json({ error: "Unexpected fixture API" }, { status: 500 });
    }
    return route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  await page.goto(origin + "/scripts/fixtures/payment-bankfeed.html", { waitUntil: "networkidle" });
  await page
    .getByLabel("Public proof file")
    .setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
  await page.getByRole("status").filter({ hasText: "Uploaded:" }).waitFor();
  assert.equal(objects.get(`${pledgeId}/proof/synthetic.png`), png.length);
  const csv =
    "bank_reference,received_on,currency,amount_hkd,payment_hint\nD1-BANK-001,2026-10-28,HKD,300.00,HKSCDA-D1-FIXTURE\n";
  await page
    .getByLabel("Choose the standard CSV")
    .setInputFiles({ name: "synthetic.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Create read-only preview", exact: true }).click();
  await page.getByRole("checkbox").check();
  assert.equal(paymentStatus, "pending", "dry run must not credit");
  await page
    .getByRole("button", { name: "Create one-by-one confirmation preview", exact: true })
    .click();
  await page.getByRole("button", { name: "Credit this payment", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Credit this payment", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "Could not confirm or update" }).waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("tr")).some(
      (row) =>
        row.textContent?.includes("D1 donation fixture") && row.textContent.includes("Confirmed"),
    ),
  );
  assert.ok(paymentReads >= 2, "payment list refreshed after failed snapshot read");
  await page.getByRole("button", { name: "Reload confirmation result", exact: true }).click();
  await page.screenshot({ path: output + "/bank-confirmed.png", fullPage: true });
  await page.getByRole("button", { name: "Open synthetic pledge" }).click();
  await page.getByLabel("Amount (HKD)", { exact: true }).fill("300");
  await page.getByLabel("Payment date", { exact: true }).fill("2026-10-28");
  await page
    .getByLabel("Payment proof (optional)")
    .setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Save payment record", exact: true }).click();
  await page.getByRole("button", { name: "Load payment proof", exact: true }).first().click();
  await page.locator("img[src$='/fixture-proof.png']").first().waitFor();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.body.innerText.includes("Confirmed") &&
      !Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent === "Approve",
      ),
  );
  assert.equal(pledge.status, "active");
  assert.equal(pledge.currentProof!.reviewStatus, "approved");
  await page.getByText("Approved", { exact: true }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + "/sponsorship-approved.png", fullPage: true });
  await page.getByLabel("Verified payments").selectOption(legacyProofId);
  await page
    .getByLabel("Reason for the change", { exact: true })
    .fill("Verified synthetic bank deposit");
  await page.getByLabel("Existing payment to reconcile").selectOption(paymentId);
  await page
    .getByRole("button", { name: "Reconcile and link existing payment", exact: true })
    .click();
  await page.getByText("Linked to a single payment entry", { exact: true }).waitFor();
  assert.equal(sources.find((source) => source.proof_id === legacyProofId)?.payment_id, paymentId);
  await page.screenshot({ path: output + "/sponsorship-bank-linked.png", fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    output + "/journey.json",
    JSON.stringify(
      {
        scope:
          "Local browser, actual components and DI HTTP/services; in-memory storage/repositories; no database, live provider, email delivery, terms publication or UAT account",
        publicProofBytes: png.length,
        paymentStatus,
        donationStatus: paymentStatus,
        paymentReads,
        lostSnapshotRecovered: true,
        legacySponsorshipPaymentLinked: true,
        sponsorshipStatus: pledge.status,
        proofStatus: pledge.currentProof!.reviewStatus,
        calls,
        pageErrors: errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`D1 fixture passed; evidence: ${output}`);
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
