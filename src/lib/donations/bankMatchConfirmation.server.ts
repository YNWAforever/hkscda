import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { BankStatementDryRunResult } from "./bankStatementDryRun";
import {
  selectExactBankMatchItems,
  type BankMatchOperation,
  type ExactBankMatchItem,
} from "./bankMatchConfirmation";

const itemStatus = z.enum(["pending", "succeeded", "skipped", "conflict", "failed"]);
const operationSchema = z
  .object({
    operationId: z.string().uuid(),
    fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: z.string(),
    expiresAt: z.string(),
    state: z.enum(["queued", "partial", "done"]),
    items: z
      .array(
        z
          .object({
            ordinal: z.number().int().min(1).max(1000),
            paymentId: z.string().uuid(),
            bankReference: z.string().min(1).max(120),
            paymentHint: z.string().min(1).max(120),
            amountCents: z.number().int().positive(),
            status: itemStatus,
            reasonCode: z.string().nullable(),
            deliveryJobId: z.string().uuid().nullable(),
            appliedAt: z.string().nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();
const applySchema = z
  .object({
    ordinal: z.number().int().min(1).max(1000),
    paymentId: z.string().uuid(),
    status: itemStatus,
    reasonCode: z.string().nullable(),
    deliveryJobId: z.string().uuid().nullable(),
  })
  .strict();

export function createBankMatchPreviewService(deps: {
  preview: (actor: string, csvText: string) => Promise<BankStatementDryRunResult>;
  persist: (
    actor: string,
    fileSha256: string,
    items: ExactBankMatchItem[],
  ) => Promise<BankMatchOperation>;
}) {
  return async (actor: string, csvText: string, selectedOrdinals: number[]) => {
    const latest = await deps.preview(actor, csvText);
    const selected = selectExactBankMatchItems(latest.rows, selectedOrdinals);
    return deps.persist(actor, latest.fileSha256, selected);
  };
}

export function createSupabaseBankMatchRepository(client: SupabaseClient) {
  return {
    async create(actor: string, fileSha256: string, items: ExactBankMatchItem[]) {
      const { data, error } = await client.rpc("create_finance_bank_match_preview", {
        p_actor: actor,
        p_file_sha: fileSha256,
        p_items: items,
      });
      if (error) throw error;
      return operationSchema.parse(data);
    },
    async get(actor: string, operationId: string) {
      const { data, error } = await client.rpc("get_finance_bank_match_operation", {
        p_actor: actor,
        p_operation: operationId,
      });
      if (error) throw error;
      return operationSchema.parse(data);
    },
    async apply(actor: string, operationId: string, ordinal: number) {
      const { data, error } = await client.rpc("apply_finance_bank_match_item", {
        p_actor: actor,
        p_operation: operationId,
        p_ordinal: ordinal,
      });
      if (error) throw error;
      return applySchema.parse(data);
    },
  };
}
