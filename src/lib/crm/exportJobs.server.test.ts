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
  // Each append uses up the run's time budget, so every run writes exactly one page
  // and the next run resumes. (Before BUG-52 a run always stopped after one page; a
  // run now keeps going while its budget lasts.)
  let clock = 0;
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
        clock += 45_000;
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
  const worker = createCrmExportWorker(client, { now: () => new Date(clock) });
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
  let claims = 0;
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === "cleanup_expired_crm_export_jobs") return { data: 0, error: null };
      // A failed job is never claimed again; since BUG-52 the run asks for the next one.
      if (name === "claim_crm_export_job" && claims++ !== 0) return { data: null, error: null };
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
  let claims = 0;
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "cleanup_expired_crm_export_jobs") return { data: 0, error: null };
      // A cancelled job is never claimed again; since BUG-52 the run asks for the next one.
      if (name === "claim_crm_export_job" && claims++ !== 0) return { data: null, error: null };
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

type FakeJob = { id: string; total: number; processed: number; status: string };

/** A fake export store: claim takes the oldest pending job; append releases the lease. */
function fakeExportStore(jobs: FakeJob[], onRpc: (name: string) => void = () => {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      onRpc(name);
      if (name === "cleanup_expired_crm_export_jobs") return { data: 0, error: null };
      if (name === "claim_crm_export_job") {
        const job = jobs.find((candidate) => candidate.status === "pending");
        if (!job) return { data: null, error: null };
        job.status = "processing";
        return {
          data: {
            id: job.id,
            lease_owner: args.p_owner,
            kind: "donations",
            total: job.total,
            processed: job.processed,
            attempts: 1,
          },
          error: null,
        };
      }
      if (name === "crm_export_job_page") {
        const offset = Number(args.p_offset);
        const job = jobs.find((candidate) => candidate.id === args.p_job)!;
        const length = Math.min(Number(args.p_limit), job.total - offset);
        return { data: Array.from({ length }, (_, i) => donation(offset + i)), error: null };
      }
      if (name === "append_crm_export_job_page") {
        const job = jobs.find((candidate) => candidate.id === args.p_job)!;
        job.processed += Number(args.p_count);
        job.status = job.processed === job.total ? "ready" : "pending";
        return { data: { status: job.status, processed: job.processed }, error: null };
      }
      throw new Error("unexpected " + name);
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test("BUG-52: one run keeps writing pages and moves on to the next job while the time budget lasts", async () => {
  const jobs = [
    { id: "job-a", total: 1200, processed: 0, status: "pending" },
    { id: "job-b", total: 300, processed: 0, status: "pending" },
  ];
  let clock = 0;
  const { client, calls } = fakeExportStore(jobs, () => {
    clock += 1_000;
  });
  const worker = createCrmExportWorker(client, { now: () => new Date(clock) });

  const result = await worker.run();

  expect(jobs.map((job) => job.status)).toEqual(["ready", "ready"]);
  expect(
    calls
      .filter((call) => call.name === "crm_export_job_page")
      .map((call) => [call.args.p_job, call.args.p_offset]),
  ).toEqual([
    ["job-a", 0],
    ["job-a", 500],
    ["job-a", 1000],
    ["job-b", 0],
  ]);
  expect(result).toMatchObject({ state: "ready", jobId: "job-b", pages: 4 });
});

test("BUG-52: a run stops claiming once its time budget is used, leaving no job leased", async () => {
  const jobs = [{ id: "job-a", total: 5000, processed: 0, status: "pending" }];
  let clock = 0;
  const { client, calls } = fakeExportStore(jobs, (name) => {
    if (name === "crm_export_job_page") clock += 20_000;
  });
  const worker = createCrmExportWorker(client, { now: () => new Date(clock) });

  const result = await worker.run();

  // 0s, 20s and 40s are inside the 45s budget; at 60s the run stops.
  expect(calls.filter((call) => call.name === "crm_export_job_page")).toHaveLength(3);
  expect(calls.at(-1)?.name).toBe("append_crm_export_job_page");
  expect(jobs[0]).toMatchObject({ processed: 1500, status: "pending" });
  expect(result).toMatchObject({ state: "pending", processed: 1500, pages: 3 });
});
