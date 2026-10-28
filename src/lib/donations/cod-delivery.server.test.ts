import { generateKeyPairSync, sign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "bun:test";

import { createManualGiftDeliveryHandlers } from "../crm/manualGiftDelivery.http.server";
import { handleCodWebhookRequest } from "../../routes/api/webhooks/cod";
import { reconcileCodPayment } from "./cod-reconcile.server";
import { processCodNotification } from "./cod-webhook.server";
import { refreshPendingCodDonation } from "./cod-status.server";
import {
  createDonationDeliveryHandler,
  createDonationDeliveryWorker,
  createSupabaseDeliveryJobRepository,
  deliverDonationPayment,
} from "./deliveryJobs.server";
import { listDonationDeliveryWorklist } from "./deliveryWorklist.server";
import { sendDonationAcknowledgement } from "./notifications.server";
import { issueReceiptForDonation, retrySucceededDonationSideEffects } from "./reconcile.server";
import type { MailInput } from "../notifications/provider.server";

type Row = Record<string, unknown>;
const donationId = "11111111-1111-4111-8111-111111111111";
const paymentId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const actor = "44444444-4444-4444-8444-444444444444";
const now = () => new Date("2040-10-28T00:00:00Z");
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = {
  merchantId: "fixture-merchant",
  segmentId: "fixture-segment",
  notificationPublicKey: keys.publicKey,
};

// In-memory PostgREST/storage transport only. Production notification parsing,
// reconciliation, receipt/acknowledgement logic, worker and HTTP retry all run.
// The success-trigger/atomic-RPC behavior here is fixture evidence, not DB UAT.
function fixture({ amountCents = 20000, requested = true } = {}) {
  const donation: Row = {
    id: donationId,
    supporter_id: "fixture-supporter",
    status: "pending",
    amount_cents: amountCents,
    refunded_cents: 0,
    receipt_requested: requested,
    contact_name: "本地測試",
    contact_email: "fixture@example.invalid",
    contact_language: "zh-HK",
    supporter: { name: "Fixture", email: "fixture@example.invalid", language: "en" },
  };
  const payment: Row = {
    id: paymentId,
    donation_id: donationId,
    provider: "cod",
    provider_ref: "fixture-cod-order",
    provider_order_ref: "fixture-merchant-order",
    status: "pending",
    amount_cents: amountCents,
  };
  const tables: Record<string, Row[]> = {
    payment: [payment],
    donation: [donation],
    donation_delivery_job: [],
    webhook_event: [],
    receipt: [],
    message: [],
    audit_log: [],
  };
  let pdfPatchFailures = 0;
  const uploads: string[] = [];
  const client = createClient("http://fixture.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          const url = new URL(request.url);
          const name = url.pathname.split("/").at(-1)!;
          const respond = (data: unknown, status = 200) => Response.json(data, { status });
          if (url.pathname.startsWith("/storage/v1/object/")) {
            uploads.push(url.pathname);
            return respond({ Key: url.pathname });
          }
          const body = request.method === "GET" ? undefined : ((await request.json()) as Row);
          if (url.pathname.includes("/rpc/")) {
            if (name === "issue_receipt" || name === "issue_receipt_with_audit") {
              expect(donation.status).toBe("succeeded");
              if (!tables.receipt.length)
                tables.receipt.push({
                  id: "fixture-receipt",
                  receipt_id: "fixture-receipt",
                  receipt_no: "FIXTURE-2040-000001",
                  pdf_url: null,
                  tax_year: 2040,
                  issued_at: now().toISOString(),
                });
              if (name === "issue_receipt_with_audit")
                tables.audit_log.push({ action: "receipt.issue", actor_user_id: body?.p_actor });
              return respond(tables.receipt);
            }
            const job = tables.donation_delivery_job[0];
            if (name === "claim_donation_delivery_job") {
              const due =
                job &&
                (job.status === "pending" || job.status === "retryable") &&
                (!job.next_attempt_at ||
                  Date.parse(String(job.next_attempt_at)) <= now().getTime());
              if (!due) return respond([]);
              Object.assign(job, {
                status: "processing",
                lease_owner: body?.p_owner,
                attempts: Number(job.attempts) + 1,
              });
              return respond([{ payment_id: paymentId, attempts: job.attempts }]);
            }
            if (name === "retry_donation_delivery_job_with_audit") {
              expect(body?.p_actor_user_id).toBe(actor);
              if (!job || !["retryable", "attention_required"].includes(String(job.status)))
                return respond(false);
              Object.assign(job, { status: "pending", next_attempt_at: null, error_code: null });
              tables.audit_log.push({ action: "donation.delivery_retry", actor_user_id: actor });
              return respond(true);
            }
            if (name === "list_failed_donation_delivery_jobs") {
              expect(body?.p_actor).toBe(actor);
              const jobs = tables.donation_delivery_job
                .filter((row) => ["retryable", "attention_required"].includes(String(row.status)))
                .map((row) => ({
                  id: row.id,
                  paymentId,
                  status: row.status,
                  attempts: row.attempts,
                  errorCode: row.error_code,
                  createdAt: now().toISOString(),
                  nextAttemptAt: row.next_attempt_at,
                  paymentStatus: payment.status,
                  donationStatus: donation.status,
                }));
              return respond({ jobs, total: jobs.length, page: body?.p_page, pageSize: 25 });
            }
            throw new Error(`Unexpected fixture RPC: ${name}`);
          }
          const rows = tables[name];
          if (!rows) throw new Error(`Unexpected fixture table: ${name}`);
          const matches = (row: Row) =>
            [...url.searchParams].every(([key, filter]) => {
              if (["select", "order", "limit"].includes(key)) return true;
              if (filter.startsWith("eq.")) return String(row[key]) === filter.slice(3);
              if (filter === "is.null") return row[key] == null;
              if (filter.startsWith("in.("))
                return filter.slice(4, -1).split(",").includes(String(row[key]));
              if (filter.startsWith("cs."))
                return Object.entries(JSON.parse(filter.slice(3)) as Row).every(
                  ([field, value]) => (row[key] as Row)?.[field] === value,
                );
              throw new Error(`Unexpected fixture filter: ${filter}`);
            });
          let result = rows.filter(matches);
          if (request.method === "POST") {
            const conflict =
              name === "message"
                ? rows.length > 0
                : name === "webhook_event" &&
                  rows.some((row) => row.provider_event_id === body?.provider_event_id);
            if (conflict) return respond({ code: "23505" }, 409);
            const row = { id: crypto.randomUUID(), updated_at: now().toISOString(), ...body };
            rows.push(row);
            result = [row];
          } else if (request.method === "PATCH") {
            if (name === "receipt" && pdfPatchFailures-- > 0)
              return respond({ code: "fixture_storage_patch_failure" }, 500);
            for (const row of result) Object.assign(row, body);
            if (
              name === "donation" &&
              donation.status === "succeeded" &&
              !tables.donation_delivery_job.length
            ) {
              tables.donation_delivery_job.push({
                id: jobId,
                payment_id: paymentId,
                status: "pending",
                attempts: 0,
                next_attempt_at: null,
                error_code: null,
              });
            }
          }
          if (name === "payment") result = result.map((row) => ({ ...row, donation }));
          const singular = request.headers
            .get("accept")
            ?.includes("application/vnd.pgrst.object+json");
          return respond(singular ? (result[0] ?? null) : result);
        },
        { preconnect() {} },
      ),
    },
  });
  const mails: MailInput[] = [];
  const state = { rejectMail: false, noMailConfig: false, pdfs: 0 };
  const repository = createSupabaseDeliveryJobRepository(client, now);
  const receiptDeps = {
    now,
    generatePdf: async () => {
      state.pdfs++;
      return new Uint8Array([37, 80, 68, 70]);
    },
  };
  const worker = createDonationDeliveryWorker({
    repository,
    now,
    deliver: createDonationDeliveryHandler(client, {
      issue: (database, id, deps) =>
        retrySucceededDonationSideEffects(database, id, { ...deps, ...receiptDeps }),
      send: (database, email) =>
        sendDonationAcknowledgement(database, email, {
          now,
          getEmailConfig: () => ({
            resendApiKey: state.noMailConfig ? undefined : "fixture-key",
            from: "fixture@example.invalid",
            replyTo: "fixture@example.invalid",
            notificationEmail: "fixture@example.invalid",
          }),
          createMailProvider: async () => ({
            send: async (mail) => {
              mails.push(mail);
              return state.rejectMail
                ? { kind: "rejected", code: "validation_error", retryable: false }
                : { kind: "accepted", providerMessageId: "fixture-mail" };
            },
          }),
          logger: { error() {} },
        }),
    }),
  });
  const data = JSON.stringify({
    transaction_id: "fixture-transaction",
    amount: amountCents / 100,
    currency: "HKD",
    merchant_id: config.merchantId,
    segment_id: config.segmentId,
    out_trade_no: payment.provider_ref,
    wallet: "ALIPAYHK",
    type: "payment",
    status: "paid",
  });
  const envelope = {
    data,
    algorithm: "rsa-sha256",
    signature: sign("sha256", Buffer.from(data), keys.privateKey).toString("base64"),
  };
  const notify = () =>
    handleCodWebhookRequest(
      new Request("http://localhost/api/webhooks/cod", {
        method: "POST",
        body: JSON.stringify(envelope),
      }),
      {
        enforce: async () => ({ ok: true, reset: 0 }),
        process: (value) =>
          processCodNotification({
            envelope: value,
            config,
            client,
            reconcile: (args) => reconcileCodPayment(args, worker),
          }),
      },
    );
  const retry = createManualGiftDeliveryHandlers({
    requireTreasurer: async () => ({ authUserId: actor }),
    createGift: async () => {
      throw new Error("No new gift during recovery");
    },
    run: worker.run,
    status: repository.status,
    retryJob: repository.retry,
  });
  return {
    client,
    tables,
    payment,
    donation,
    state,
    mails,
    uploads,
    envelope,
    notify,
    worker,
    retry,
    receiptDeps,
    failPdfPatch: () => {
      pdfPatchFailures = 1;
    },
  };
}

test("signed COD paid -> receipt -> acknowledgement -> complete is idempotent", async () => {
  const f = fixture();
  const response = await f.notify();
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("success");
  expect(f.payment.status).toBe("succeeded");
  expect(f.donation.status).toBe("succeeded");
  expect(f.tables.receipt).toHaveLength(1);
  expect(f.tables.receipt[0].pdf_url).toBe("2040/FIXTURE-2040-000001.pdf");
  expect(f.mails[0].html).toContain("FIXTURE-2040-000001");
  expect(f.mails[0].html).toContain("本地測試");
  expect(f.tables.message[0].status).toBe("sent");
  expect(f.tables.donation_delivery_job[0].status).toBe("complete");
  await f.notify();
  // A different verified paid event also reuses the completed job.
  await reconcileCodPayment(
    {
      client: f.client,
      provider: "cod",
      providerRef: "fixture-cod-order",
      providerEventId: "another-paid-event",
      eventType: "payment.paid",
      payload: {},
    },
    f.worker,
  );
  await refreshPendingCodDonation({ donationId, client: f.client });
  expect(f.mails).toHaveLength(1);
  expect(f.state.pdfs).toBe(1);
  expect(f.uploads).toHaveLength(1);
});

test("failed COD receipt acknowledgement is visible and recoverable through existing finance retry", async () => {
  const f = fixture();
  f.state.rejectMail = true;
  expect((await f.notify()).status).toBe(200);
  expect(f.payment.status).toBe("succeeded");
  const listed = await listDonationDeliveryWorklist(f.client, actor, 1);
  expect(listed.jobs[0]).toMatchObject({
    id: jobId,
    paymentId,
    status: "attention_required",
    errorCode: "validation_error",
  });
  // Public refresh and a distinct paid event must respect staff attention.
  await expect(refreshPendingCodDonation({ donationId, client: f.client })).rejects.toThrow(
    "delivery_pending",
  );
  await reconcileCodPayment(
    {
      client: f.client,
      provider: "cod",
      providerRef: "fixture-cod-order",
      providerEventId: "replayed-paid",
      eventType: "payment.paid",
      payload: {},
    },
    f.worker,
  );
  expect(f.mails).toHaveLength(1);
  f.state.rejectMail = false;
  const response = await f.retry.retry(new Request("http://localhost", { method: "POST" }), jobId);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ deliveryStatus: "complete" });
  expect(f.tables.audit_log.filter((row) => row.action === "donation.delivery_retry")).toHaveLength(
    1,
  );
  expect((await listDonationDeliveryWorklist(f.client, actor, 1)).total).toBe(0);
  expect(f.tables.receipt).toHaveLength(1);
  expect(f.state.pdfs).toBe(1);
  expect(f.mails[1].html).toContain("FIXTURE-2040-000001");
  expect(f.mails[1].idempotencyKey).toBe(f.mails[0].idempotencyKey);
  await f.retry.retry(new Request("http://localhost", { method: "POST" }), jobId);
  expect(f.mails).toHaveLength(2);
});

test("COD PDF persistence failure is repaired by admin issue and delivery retry with the same receipt", async () => {
  const f = fixture();
  f.failPdfPatch();
  expect((await f.notify()).status).toBe(200);
  expect(f.mails).toHaveLength(0);
  expect((await listDonationDeliveryWorklist(f.client, actor, 1)).jobs[0].status).toBe("retryable");
  expect(await issueReceiptForDonation(f.client, donationId, actor, {}, f.receiptDeps)).toEqual({
    receiptNo: "FIXTURE-2040-000001",
  });
  const response = await f.retry.retry(new Request("http://localhost", { method: "POST" }), jobId);
  expect(await response.json()).toEqual({ deliveryStatus: "complete" });
  expect(f.tables.receipt).toHaveLength(1);
  expect(f.state.pdfs).toBe(2);
  expect(f.mails).toHaveLength(1);
  expect(f.mails[0].html).toContain("FIXTURE-2040-000001");
});

test.each([
  { amountCents: 9999, requested: true },
  { amountCents: 20000, requested: false },
])("ineligible COD gift %j gets acknowledgement without receipt", async (input) => {
  const f = fixture(input);
  expect((await f.notify()).status).toBe(200);
  expect(f.tables.receipt).toHaveLength(0);
  expect(f.mails).toHaveLength(1);
  expect(f.mails[0].html).not.toContain("FIXTURE-2040-000001");
});

test("unconfigured mail remains retryable; public polling respects backoff", async () => {
  const f = fixture();
  f.state.noMailConfig = true;
  await f.notify();
  expect(f.tables.message[0].status).toBe("queued");
  expect(f.tables.donation_delivery_job[0]).toMatchObject({
    status: "retryable",
    attempts: 1,
    error_code: "acknowledgement_pending",
  });
  await expect(deliverDonationPayment(f.client, paymentId, f.worker)).rejects.toThrow(
    "delivery_pending",
  );
  expect(f.tables.donation_delivery_job[0].attempts).toBe(1);
  expect(f.mails).toHaveLength(0);
});

test("default COD notification wiring records queued mail as retryable immediately", async () => {
  const previous = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "";
  try {
    const f = fixture({ requested: false });
    await processCodNotification({ envelope: f.envelope, config, client: f.client });
    expect(f.payment.status).toBe("succeeded");
    expect(f.tables.donation_delivery_job[0]).toMatchObject({
      status: "retryable",
      error_code: "acknowledgement_pending",
      attempts: 1,
    });
    expect(f.tables.message[0].status).toBe("queued");
  } finally {
    if (previous === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
  }
});

test("verified COD order refresh issues a requested HK$100 receipt through the same job", async () => {
  const f = fixture({ amountCents: 10000 });
  const result = await refreshPendingCodDonation({
    donationId,
    client: f.client,
    config,
    createClient: () => ({
      refreshTransactionStatus: async () => ({ status: "paid" }),
      getOrderDetails: async () => ({
        merchantId: config.merchantId,
        segmentId: config.segmentId,
        currency: "HKD",
        wallet: "ALIPAYHK",
        type: "payment",
        status: "paid",
        outTradeNo: "fixture-cod-order",
        orderRef: "fixture-merchant-order",
        amount: 100,
        transactionId: "fixture-refresh-transaction",
        subject: "Fixture",
      }),
    }),
    reconcile: (args) => reconcileCodPayment(args, f.worker),
  });
  expect(result.kind).toBe("reconciled");
  expect(f.tables.receipt).toHaveLength(1);
  expect(f.tables.donation_delivery_job[0].status).toBe("complete");
  expect(f.mails[0].html).toContain("FIXTURE-2040-000001");
  await f.notify();
  expect(f.state.pdfs).toBe(1);
  expect(f.mails).toHaveLength(1);
});

test("missing delivery job never bypasses the worker", async () => {
  const f = fixture();
  await expect(deliverDonationPayment(f.client, paymentId, f.worker)).rejects.toThrow(
    "job missing",
  );
  expect(f.tables.receipt).toHaveLength(0);
  expect(f.mails).toHaveLength(0);
});

test("a competing worker's completed job is accepted without a second send", async () => {
  const f = fixture();
  f.tables.donation_delivery_job.push({ id: jobId, payment_id: paymentId, status: "processing" });
  await deliverDonationPayment(f.client, paymentId, {
    run: async () => {
      f.tables.donation_delivery_job[0].status = "complete";
      return { kind: "busy" };
    },
  });
  expect(f.mails).toHaveLength(0);
});

test("default succeeded COD polling cannot bypass a job requiring staff attention", async () => {
  const f = fixture({ requested: false });
  f.payment.status = f.donation.status = "succeeded";
  f.tables.donation_delivery_job.push({
    id: jobId,
    payment_id: paymentId,
    status: "attention_required",
    attempts: 8,
  });
  await expect(refreshPendingCodDonation({ donationId, client: f.client })).rejects.toThrow(
    "delivery_pending",
  );
  expect(f.tables.message).toHaveLength(0);
  expect(f.tables.donation_delivery_job[0].attempts).toBe(8);
});
