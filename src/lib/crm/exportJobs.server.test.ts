import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCrmExportWorker } from "./exportJobs.server";

function donation(index: number) {
  return {
    supporterId: String(index),
    supporterName: index === 0 ? "=HYPERLINK" : "Synthetic",
    supporterEmail: "fixture@example.invalid",
    donationId: String(index),
    amountCents: 1000,
    refundedCents: 0,
    purpose: "general",
    customPurpose: null,
    status: "succeeded",
    method: "manual",
    receiptRequested: false,
    receiptNo: null,
    createdAt: "2026-09-27T00:00:00Z",
  };
}

test("worker commits one bounded page at a time and resumes without duplicate CSV headers", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let artifact = "";
  let processed = 0;
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "cleanup_expired_crm_export_jobs") return { data: 0, error: null };
      if (name === "claim_crm_export_job")
        return {
          data: {
            id: "synthetic",
            lease_owner: args.p_owner,
            kind: "donations",
            total: 501,
            processed,
            attempts: 1,
          },
          error: null,
        };
      if (name === "crm_export_job_page") {
        const offset = Number(args.p_offset);
        return {
          data: Array.from({ length: offset === 0 ? 500 : 1 }, (_, i) => donation(offset + i)),
          error: null,
        };
      }
      if (name === "append_crm_export_job_page") {
        artifact += String(args.p_csv_chunk);
        processed += Number(args.p_count);
        return {
          data: { status: processed === 501 ? "ready" : "pending", processed },
          error: null,
        };
      }
      throw new Error("unexpected " + name);
    },
  } as unknown as SupabaseClient;
  const worker = createCrmExportWorker(client);
  expect((await worker.run()).state).toBe("pending");
  expect(processed).toBe(500);
  expect((await worker.run()).state).toBe("ready");
  expect(
    calls.filter((call) => call.name === "crm_export_job_page").map((call) => call.args.p_offset),
  ).toEqual([0, 500]);
  expect(artifact.split("\n")).toHaveLength(502);
  expect(artifact.match(/supporter_id/g)).toHaveLength(1);
  expect(artifact).toContain("'=HYPERLINK");
});

test("incomplete page fails job and never publishes a chunk", async () => {
  const calls: string[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === "cleanup_expired_crm_export_jobs") return { data: 0, error: null };
      if (name === "claim_crm_export_job")
        return {
          data: {
            id: "synthetic",
            lease_owner: args.p_owner,
            kind: "donations",
            total: 2,
            processed: 0,
            attempts: 1,
          },
          error: null,
        };
      if (name === "crm_export_job_page") return { data: [donation(0)], error: null };
      if (name === "fail_crm_export_job") {
        expect(args.p_error).toBe("incomplete_page");
        return { data: true, error: null };
      }
      throw new Error("unexpected " + name);
    },
  } as unknown as SupabaseClient;
  expect((await createCrmExportWorker(client).run()).state).toBe("failed");
  expect(calls).not.toContain("append_crm_export_job_page");
});

test("cancelled or lease-lost append never reports a ready download", async () => {
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "cleanup_expired_crm_export_jobs") return { data: 0, error: null };
      if (name === "claim_crm_export_job")
        return {
          data: {
            id: "synthetic",
            lease_owner: args.p_owner,
            kind: "donations",
            total: 0,
            processed: 0,
            attempts: 1,
          },
          error: null,
        };
      if (name === "append_crm_export_job_page") return { data: null, error: null };
      throw new Error("unexpected " + name);
    },
  } as unknown as SupabaseClient;
  expect((await createCrmExportWorker(client).run()).state).toBe("lost");
});
