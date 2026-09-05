import { expect, test } from "bun:test";
import { createDonationDeliveryWorker, type DeliveryJobRepository } from "./deliveryJobs.server";
function repository(overrides: Partial<DeliveryJobRepository> = {}): DeliveryJobRepository {
  return {
    status: async () => "pending",
    claim: async () => ({ paymentId: "payment-1", attempts: 1 }),
    complete: async () => true,
    fail: async () => true,
    retry: async () => true,
    ...overrides,
  };
}
test("busy claims never deliver", async () => {
  let delivered = false;
  const worker = createDonationDeliveryWorker({
    repository: repository({ claim: async () => null }),
    deliver: async () => {
      delivered = true;
    },
  });
  expect(await worker.run("job-1")).toEqual({ kind: "busy" });
  expect(delivered).toBe(false);
});
test("retryable failures retain a scheduled job and owned lease", async () => {
  let failure: unknown;
  const worker = createDonationDeliveryWorker({
    repository: repository({
      fail: async (id, owner, input) => {
        failure = { id, owner, ...input };
        return true;
      },
    }),
    deliver: async () => {
      throw new Error("storage");
    },
    now: () => new Date("2026-09-05T00:00:00Z"),
    owner: () => "owner-1",
  });
  expect(await worker.run("job-1")).toEqual({ kind: "retryable", code: "delivery_failed" });
  expect(failure).toEqual({
    id: "job-1",
    owner: "owner-1",
    code: "delivery_failed",
    retryable: true,
    retryAt: "2026-09-05T00:02:00.000Z",
  });
});
test("permanent failures require staff attention", async () => {
  const worker = createDonationDeliveryWorker({
    repository: repository(),
    deliver: async () => {
      throw new Error("invalid");
    },
    classify: () => ({ code: "invalid_recipient", retryable: false }),
  });
  expect(await worker.run("job-1")).toEqual({
    kind: "attention_required",
    code: "invalid_recipient",
  });
});
test("completion persistence failure stays recoverable", async () => {
  const worker = createDonationDeliveryWorker({
    repository: repository({
      complete: async () => {
        throw new Error("database");
      },
    }),
    deliver: async () => {},
  });
  expect(await worker.run("job-1")).toEqual({ kind: "retryable", code: "delivery_failed" });
});
test("lost lease cannot report completion or overwrite newer worker", async () => {
  const worker = createDonationDeliveryWorker({
    repository: repository({ complete: async () => false }),
    deliver: async () => {},
  });
  expect(await worker.run("job-1")).toEqual({ kind: "busy" });
  const failed = createDonationDeliveryWorker({
    repository: repository({ fail: async () => false }),
    deliver: async () => {
      throw new Error("failure");
    },
  });
  expect(await failed.run("job-1")).toEqual({ kind: "busy" });
});
test("claim and failure persistence errors are surfaced", async () => {
  const worker = createDonationDeliveryWorker({
    repository: repository({
      claim: async () => {
        throw new Error("claim unavailable");
      },
    }),
    deliver: async () => {},
  });
  await expect(worker.run("job-1")).rejects.toThrow("claim unavailable");
  const failed = createDonationDeliveryWorker({
    repository: repository({
      fail: async () => {
        throw new Error("persist unavailable");
      },
    }),
    deliver: async () => {
      throw new Error("delivery");
    },
  });
  await expect(failed.run("job-1")).rejects.toThrow("persist unavailable");
});
test("lease uses injected clock and distinct owner", async () => {
  let lease: unknown;
  const worker = createDonationDeliveryWorker({
    repository: repository({
      claim: async (...args) => {
        lease = args;
        return null;
      },
    }),
    deliver: async () => {},
    now: () => new Date("2026-09-05T00:00:00Z"),
    owner: () => "owner-1",
  });
  await worker.run("job-1");
  expect(lease).toEqual(["job-1", "owner-1", "2026-09-05T00:05:00.000Z"]);
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { createDonationDeliveryHandler, DonationDeliveryError } from "./deliveryJobs.server";
const acknowledgementInput = {
  supporterId: "supporter-1",
  donationId: "donation-1",
  to: "fixture@example.invalid",
  donorName: "Fixture",
  amountCents: 1000,
  language: "en" as const,
};
test.each(["queued"] as const)(
  "%s acknowledgement must retain recovery instead of completing",
  async (result) => {
    const handler = createDonationDeliveryHandler({} as SupabaseClient, {
      send: async () => result,
      issue: async (client, _id, deps) => {
        await deps?.sendAcknowledgement?.(client, acknowledgementInput);
        return undefined;
      },
    });
    await expect(handler("payment-1")).rejects.toThrow("acknowledgement_pending");
  },
);
test.each(["sent", "skipped"] as const)(
  "%s acknowledgement completes the reused receipt path",
  async (result) => {
    let receiptAttempts = 0;
    const handler = createDonationDeliveryHandler({} as SupabaseClient, {
      send: async () => result,
      issue: async (client, _id, deps) => {
        receiptAttempts++;
        await deps?.sendAcknowledgement?.(client, acknowledgementInput);
        return undefined;
      },
    });
    await handler("payment-1");
    expect(receiptAttempts).toBe(1);
  },
);
test("typed permanent provider errors survive the default classifier", async () => {
  const worker = createDonationDeliveryWorker({
    repository: repository(),
    deliver: async () => {
      throw new DonationDeliveryError("validation_error", false);
    },
  });
  expect(await worker.run("job-1")).toEqual({
    kind: "attention_required",
    code: "validation_error",
  });
});
test("provider failure payload determines attention without storing arbitrary text", async () => {
  const query = {
    select: () => query,
    eq: () => query,
    contains: () => query,
    maybeSingle: async () => ({
      data: {
        status: "failed",
        payload: { providerErrorCode: "validation_error", retryable: false },
      },
      error: null,
    }),
  };
  const handler = createDonationDeliveryHandler(
    { from: () => query } as unknown as SupabaseClient,
    {
      send: async () => "failed",
      issue: async (client, _id, deps) => {
        await deps?.sendAcknowledgement?.(client, acknowledgementInput);
        return undefined;
      },
    },
  );
  const worker = createDonationDeliveryWorker({ repository: repository(), deliver: handler });
  expect(await worker.run("job-1")).toEqual({
    kind: "attention_required",
    code: "validation_error",
  });
});

test("refunded payment retry stops before receipt allocation or provider send", async () => {
  let sent = false;
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({
      data: { status: "refunded", donation: { status: "refunded" } },
      error: null,
    }),
  };
  const client = {
    from: () => query,
    rpc: () => {
      throw new Error("Receipt allocation must not run");
    },
  } as unknown as SupabaseClient;
  const handler = createDonationDeliveryHandler(client, {
    send: async () => {
      sent = true;
      return "sent";
    },
  });
  const worker = createDonationDeliveryWorker({ repository: repository(), deliver: handler });
  expect(await worker.run("job-1")).toEqual({
    kind: "attention_required",
    code: "payment_not_succeeded",
  });
  expect(sent).toBe(false);
});

import { retrySucceededDonationSideEffects } from "./reconcile.server";
test("crash after PDF upload retries the same receipt path before one acknowledgement", async () => {
  let pdfPath: string | null = null,
    patches = 0,
    sends = 0;
  const uploads: string[] = [];
  const payment = {
    status: "succeeded",
    donation: {
      id: "donation-1",
      supporter_id: "supporter-1",
      status: "succeeded",
      amount_cents: 20000,
      receipt_requested: true,
      supporter: { name: "Fixture", email: "fixture@example.invalid", language: "en" },
    },
  };
  const paymentQuery = {
    select: () => paymentQuery,
    eq: () => paymentQuery,
    single: async () => ({ data: payment, error: null }),
  };
  const client = {
    from: (table: string) => {
      if (table === "payment") return paymentQuery;
      if (table === "receipt")
        return {
          update: (input: { pdf_url: string }) => ({
            eq: async () => {
              patches++;
              if (patches === 1) return { error: new Error("crash after upload") };
              pdfPath = input.pdf_url;
              return { error: null };
            },
          }),
        };
      throw new Error("Unexpected table");
    },
    rpc: async () => ({
      data: {
        receipt_no: "LOCAL-0001",
        receipt_id: "receipt-1",
        pdf_url: pdfPath,
        tax_year: 2026,
        issued_at: "2026-09-05T00:00:00Z",
      },
      error: null,
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const handler = createDonationDeliveryHandler(client, {
    issue: (database, paymentId, deps) =>
      retrySucceededDonationSideEffects(database, paymentId, {
        ...deps,
        generatePdf: async () => new Uint8Array([1]),
      }),
    send: async () => {
      sends++;
      return "sent";
    },
  });
  const worker = createDonationDeliveryWorker({ repository: repository(), deliver: handler });
  expect(await worker.run("job-1")).toEqual({ kind: "retryable", code: "delivery_failed" });
  expect(sends).toBe(0);
  expect(await worker.run("job-1")).toEqual({ kind: "complete" });
  expect(sends).toBe(1);
  expect(uploads).toEqual(["2026/LOCAL-0001.pdf", "2026/LOCAL-0001.pdf"]);
  expect<string | null>(pdfPath).toBe("2026/LOCAL-0001.pdf");
});
