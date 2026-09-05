import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportSearch, SupporterSearch } from "./schemas";
import type { SupporterSummary } from "./types";
import type { DonationExportRow } from "./csv";
export interface CrmReadModel {
  list(input: SupporterSearch): Promise<{ supporters: SupporterSummary[]; total: number }>;
  exportSupporters(input: ExportSearch): Promise<SupporterSummary[]>;
  exportDonations(input: ExportSearch): Promise<DonationExportRow[]>;
  summary(supporterId: string): Promise<SupporterSummary | null>;
}
function rejectOverflow(total: number, overflow: boolean) {
  if (overflow || total > 5000)
    throw Response.json(
      {
        error: `Export matches ${total} rows, exceeding the 5000-row limit. Narrow your filters and try again.`,
        total,
        limit: 5000,
      },
      { status: 413 },
    );
}
export function createCrmReadModel(client: SupabaseClient): CrmReadModel {
  async function supporters(
    input: SupporterSearch | ExportSearch,
    offset: number,
    limit: number,
    exporting: boolean,
  ) {
    const { data, error } = await client.rpc("crm_read_supporters", {
      p_filters: input,
      p_offset: offset,
      p_limit: limit,
      p_export: exporting,
    });
    if (error) throw error;
    const result = data as { supporters: SupporterSummary[]; total: number; overflow: boolean };
    if (exporting) {
      rejectOverflow(result.total, result.overflow);
      if (result.supporters.length !== result.total) throw new Error("Incomplete CRM export");
    }
    return { supporters: result.supporters, total: result.total };
  }
  return {
    list(input) {
      return supporters(input, (input.page - 1) * input.pageSize, input.pageSize, false);
    },
    async exportSupporters(input) {
      return (await supporters(input, 0, 5000, true)).supporters;
    },
    async exportDonations(input) {
      const { data, error } = await client.rpc("crm_export_donations", { p_filters: input });
      if (error) throw error;
      const result = data as { donations: DonationExportRow[]; total: number; overflow: boolean };
      rejectOverflow(result.total, result.overflow);
      if (result.donations.length !== result.total) throw new Error("Incomplete CRM export");
      return result.donations;
    },
    async summary(supporterId) {
      const { data, error } = await client.rpc("crm_supporter_summary", {
        p_supporter_id: supporterId,
      });
      if (error) throw error;
      return data as SupporterSummary | null;
    },
  };
}
