import type { BankStatementPreviewRow } from "./bankStatementDryRun";

export type ExactBankMatchItem = {
  ordinal: number;
  paymentId: string;
  bankReference: string;
  amountCents: number;
};

export type BankMatchItemResult = ExactBankMatchItem & {
  status: "pending" | "succeeded" | "skipped" | "conflict" | "failed";
  reasonCode: string | null;
  deliveryJobId: string | null;
  appliedAt: string | null;
};

export type BankMatchApplyResult = {
  ordinal: number;
  paymentId: string;
  status: BankMatchItemResult["status"];
  reasonCode: string | null;
  deliveryJobId: string | null;
};
export type BankMatchOperation = {
  operationId: string;
  fileSha256: string;
  createdAt: string;
  expiresAt: string;
  state: "queued" | "partial" | "done";
  items: BankMatchItemResult[];
};

export class BankMatchSelectionError extends Error {}

export function selectExactBankMatchItems(
  rows: readonly BankStatementPreviewRow[],
  selectedOrdinals: readonly number[],
): ExactBankMatchItem[] {
  if (selectedOrdinals.length < 1 || selectedOrdinals.length > 1000)
    throw new BankMatchSelectionError("Select 1 to 1000 exact bank rows");
  const byOrdinal = new Map(rows.map((row) => [row.ordinal, row]));
  const ordinals = new Set<number>();
  const payments = new Set<string>();
  const references = new Set<string>();
  return selectedOrdinals.map((ordinal) => {
    if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 1000 || ordinals.has(ordinal))
      throw new BankMatchSelectionError("Invalid or repeated bank row");
    ordinals.add(ordinal);
    const row = byOrdinal.get(ordinal);
    if (
      !row ||
      row.status !== "candidate_exact" ||
      row.candidateCount !== 1 ||
      row.candidates.length !== 1 ||
      row.amountCents === null ||
      row.amountCents <= 0
    )
      throw new BankMatchSelectionError("Only one exact candidate may be selected per bank row");
    const payment = row.candidates[0]!;
    const referenceKey = row.bankReference.trim().toLowerCase();
    if (payments.has(payment.id) || references.has(referenceKey))
      throw new BankMatchSelectionError("Bank reference or payment selected twice");
    payments.add(payment.id);
    references.add(referenceKey);
    return {
      ordinal,
      paymentId: payment.id,
      bankReference: row.bankReference,
      amountCents: row.amountCents,
    };
  });
}
