import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exportSearchSchema } from "./schemas";
import { buildDonationCsv, buildSupporterCsv, type DonationExportRow } from "./csv";
import type { SupporterSummary } from "./types";

export type CrmExportKind = "supporters" | "donations";
export type CrmExportJob = {
  id: string;
  kind: CrmExportKind;
  total: number;
  processed: number;
  status: "pending" | "processing" | "ready" | "failed" | "cancelled" | "expired";
  errorCode?: string | null;
  expiresAt: string;
};

async function rpc<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export async function enqueueCrmExportJob(
  client: SupabaseClient,
  actor: string,
  kind: CrmExportKind,
  rawFilters: unknown,
): Promise<CrmExportJob> {
  const filters = exportSearchSchema.parse(rawFilters);
  return rpc(client, "enqueue_crm_export_job", {
    p_actor: actor,
    p_kind: kind,
    p_filters: filters,
  });
}

export function getCrmExportJob(client: SupabaseClient, actor: string, id: string) {
  return rpc<CrmExportJob | null>(client, "crm_export_job_status", { p_job: id, p_actor: actor });
}

export function cancelCrmExportJob(client: SupabaseClient, actor: string, id: string) {
  return rpc<boolean>(client, "cancel_crm_export_job", { p_job: id, p_actor: actor });
}

export function downloadCrmExportJob(client: SupabaseClient, actor: string, id: string) {
  return rpc<string | null>(client, "crm_export_job_download", { p_job: id, p_actor: actor });
}

type ClaimedJob = {
  id: string;
  lease_owner: string;
  kind: CrmExportKind;
  total: number;
  processed: number;
  attempts: number;
};
const PAGE_SIZE = 500;

export function createCrmExportWorker(client: SupabaseClient) {
  return {
    async run(): Promise<{
      state: "idle" | "pending" | "ready" | "lost" | "failed";
      jobId?: string;
      processed?: number;
      expired: number;
    }> {
      const expired = await rpc<number>(client, "cleanup_expired_crm_export_jobs", {});
      const owner = randomUUID();
      const job = await rpc<ClaimedJob | null>(client, "claim_crm_export_job", { p_owner: owner });
      if (!job) return { state: "idle", expired };
      try {
        const offset = job.processed;
        const expected = Math.min(PAGE_SIZE, job.total - offset);
        const page =
          expected === 0
            ? []
            : await rpc<Array<SupporterSummary | DonationExportRow | null>>(
                client,
                "crm_export_job_page",
                { p_job: job.id, p_owner: owner, p_offset: offset, p_limit: PAGE_SIZE },
              );
        if (!Array.isArray(page) || page.length !== expected || page.some((row) => row === null))
          throw new Error("incomplete_page");
        const csv =
          job.kind === "supporters"
            ? buildSupporterCsv(page as SupporterSummary[])
            : buildDonationCsv(page as DonationExportRow[]);
        const headerEnd = csv.indexOf("\n");
        const chunk = offset === 0 ? csv : "\n" + csv.slice(headerEnd + 1);
        const result = await rpc<{ status: "pending" | "ready"; processed: number } | null>(
          client,
          "append_crm_export_job_page",
          { p_job: job.id, p_owner: owner, p_csv_chunk: chunk, p_count: expected },
        );
        return result
          ? { state: result.status, jobId: job.id, processed: result.processed, expired }
          : { state: "lost", jobId: job.id, expired };
      } catch (error) {
        const code =
          error instanceof Error && error.message === "incomplete_page"
            ? "incomplete_page"
            : "worker_error";
        const failed = await rpc<boolean>(client, "fail_crm_export_job", {
          p_job: job.id,
          p_owner: owner,
          p_error: code,
        });
        return { state: failed ? "failed" : "lost", jobId: job.id, expired };
      }
    },
  };
}
