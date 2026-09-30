import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  parseBankStatementCsv,
  previewBankStatement,
  type BankMatchCatalog,
  type BankStatementDryRunResult,
} from "./bankStatementDryRun";

const catalogSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("too_broad") }).strict(),
  z
    .object({
      kind: z.literal("ok"),
      creditedReferences: z.array(z.string()).max(1000),
      pendingPayments: z
        .array(
          z.object({
            id: z.string().uuid(),
            provider: z.enum(["fps", "payme", "manual"]),
            providerRef: z.string().nullable(),
            amountCents: z.number().int().positive(),
            paymentStatus: z.string(),
            donationStatus: z.string(),
          }),
        )
        .max(1000),
    })
    .strict(),
]);

type LookupResult = ({ kind: "ok" } & BankMatchCatalog) | { kind: "too_broad" };

export class BankPreviewInputError extends Error {}
export class BankPreviewTooBroadError extends Error {}

export type { BankStatementDryRunResult } from "./bankStatementDryRun";

export function createBankStatementDryRunService(deps: {
  lookup: (actor: string, references: string[], amounts: number[]) => Promise<LookupResult>;
  now: () => Date;
}) {
  return async (actor: string, csvText: string): Promise<BankStatementDryRunResult> => {
    let parsed;
    try {
      parsed = parseBankStatementCsv(csvText);
    } catch {
      throw new BankPreviewInputError("Invalid canonical bank statement");
    }
    const eligible = parsed.filter((row) => row.invalidReason === null && row.amountCents !== null);
    const references = [...new Set(eligible.map((row) => row.referenceKey))];
    const amounts = [...new Set(eligible.map((row) => row.amountCents!))];
    const lookup = eligible.length
      ? await deps.lookup(actor, references, amounts)
      : { kind: "ok" as const, creditedReferences: [], pendingPayments: [] };
    if (lookup.kind === "too_broad") throw new BankPreviewTooBroadError("Candidate set too broad");
    const rows = previewBankStatement(parsed, lookup);
    const bytes = new TextEncoder().encode(csvText);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const fileSha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return {
      fileSha256,
      generatedAt: deps.now().toISOString(),
      rows,
      summary: {
        total: rows.length,
        invalid: rows.filter((row) => row.status === "invalid").length,
        duplicate: rows.filter((row) => row.status === "duplicate_file").length,
        credited: rows.filter((row) => row.status === "already_credited").length,
        candidates: rows.filter((row) =>
          ["candidate_exact", "candidate_amount_only", "ambiguous"].includes(row.status),
        ).length,
        unmatched: rows.filter((row) => row.status === "unmatched").length,
      },
    };
  };
}

export function createBankStatementCatalogLookup(client: SupabaseClient) {
  return async (actor: string, references: string[], amounts: number[]): Promise<LookupResult> => {
    const { data, error } = await client.rpc("preview_manual_bank_matches", {
      p_actor: actor,
      p_references: references,
      p_amounts: amounts,
    });
    if (error) throw error;
    return catalogSchema.parse(data);
  };
}
