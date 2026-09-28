export const BANK_STATEMENT_MAX_BYTES = 256 * 1024;
export const BANK_STATEMENT_MAX_ROWS = 1000;
export const BANK_STATEMENT_HEADER = "bank_reference,received_on,currency,amount_hkd,payment_hint";

export type BankStatementRow = {
  ordinal: number;
  bankReference: string;
  referenceKey: string;
  receivedOn: string;
  amountCents: number | null;
  paymentHint: string | null;
  invalidReason: "reference" | "date" | "currency" | "amount" | "hint" | null;
};

export type BankPaymentCandidate = {
  id: string;
  provider: "fps" | "payme" | "manual";
  providerRef: string | null;
  amountCents: number;
  paymentStatus: string;
  donationStatus: string;
};

export type BankMatchCatalog = {
  creditedReferences: string[];
  pendingPayments: BankPaymentCandidate[];
};

export type BankStatementPreviewRow = BankStatementRow & {
  status:
    | "invalid"
    | "duplicate_file"
    | "already_credited"
    | "candidate_exact"
    | "candidate_amount_only"
    | "ambiguous"
    | "unmatched";
  candidateCount: number;
  candidates: BankPaymentCandidate[];
};

export type BankStatementDryRunResult = {
  fileSha256: string;
  generatedAt: string;
  rows: BankStatementPreviewRow[];
  summary: {
    total: number;
    invalid: number;
    duplicate: number;
    credited: number;
    candidates: number;
    unmatched: number;
  };
};
function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === ",") {
      record.push(field);
      field = "";
      quoteClosed = false;
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      quoteClosed = false;
      continue;
    }
    if (quoteClosed) throw new Error("Invalid CSV quotation");
    if (char === '"') {
      if (field !== "") throw new Error("Invalid CSV quotation");
      quoted = true;
      continue;
    }
    field += char;
  }
  if (quoted) throw new Error("Unterminated CSV quotation");
  if (field !== "" || record.length > 0 || quoteClosed) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function amountCents(value: string) {
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(value)) return null;
  const [dollars, cents] = value.split(".");
  const result = BigInt(dollars!) * 100n + BigInt(cents!);
  if (result < 1n || result > 2_147_483_647n) return null;
  return Number(result);
}

export function parseBankStatementCsv(input: string): BankStatementRow[] {
  if (new TextEncoder().encode(input).length > BANK_STATEMENT_MAX_BYTES)
    throw new Error("Bank statement too large");
  if (input.includes("\0")) throw new Error("Invalid bank statement character");
  const records = csvRecords(input.replace(/^\uFEFF/, ""));
  if (records[0]?.join(",") !== BANK_STATEMENT_HEADER)
    throw new Error("Bank statement header does not match the canonical template");
  const values = records.slice(1);
  if (values.length < 1 || values.length > BANK_STATEMENT_MAX_ROWS)
    throw new Error("Bank statement row count out of range");
  return values.map((record, index) => {
    if (record.length !== 5) throw new Error(`Bank statement column count at row ${index + 1}`);
    const [rawReference, rawDate, rawCurrency, rawAmount, rawHint] = record;
    const bankReference = rawReference!.trim();
    const receivedOn = rawDate!.trim();
    const paymentHint = rawHint!.trim() || null;
    const parsedAmount = amountCents(rawAmount!.trim());
    const invalidReason = !/^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,119}$/.test(bankReference)
      ? "reference"
      : !validDate(receivedOn)
        ? "date"
        : rawCurrency!.trim() !== "HKD"
          ? "currency"
          : parsedAmount === null
            ? "amount"
            : paymentHint && !/^[\x20-\x7E]{1,120}$/.test(paymentHint)
              ? "hint"
              : null;
    return {
      ordinal: index + 1,
      bankReference,
      referenceKey: bankReference.toLowerCase(),
      receivedOn,
      amountCents: parsedAmount,
      paymentHint,
      invalidReason,
    };
  });
}

export function previewBankStatement(
  rows: readonly BankStatementRow[],
  catalog: BankMatchCatalog,
): BankStatementPreviewRow[] {
  const referenceCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.invalidReason) continue;
    referenceCounts.set(row.referenceKey, (referenceCounts.get(row.referenceKey) ?? 0) + 1);
  }
  const credited = new Set(
    catalog.creditedReferences.map((reference) => reference.trim().toLowerCase()),
  );
  const eligiblePayments = catalog.pendingPayments.filter(
    (payment) =>
      payment.paymentStatus === "pending" &&
      payment.donationStatus === "pending" &&
      ["fps", "payme", "manual"].includes(payment.provider) &&
      Number.isSafeInteger(payment.amountCents) &&
      payment.amountCents > 0,
  );
  return rows.map((row) => {
    const base = { ...row, candidateCount: 0, candidates: [] as BankPaymentCandidate[] };
    if (row.invalidReason) return { ...base, status: "invalid" as const };
    if ((referenceCounts.get(row.referenceKey) ?? 0) > 1)
      return { ...base, status: "duplicate_file" as const };
    if (credited.has(row.referenceKey)) return { ...base, status: "already_credited" as const };
    const byAmount = eligiblePayments.filter((payment) => payment.amountCents === row.amountCents);
    const candidates = row.paymentHint
      ? byAmount.filter(
          (payment) => payment.providerRef?.trim().toLowerCase() === row.paymentHint!.toLowerCase(),
        )
      : byAmount;
    const details = {
      ...base,
      candidateCount: candidates.length,
      candidates: candidates.slice(0, 5),
    };
    if (candidates.length > 1) return { ...details, status: "ambiguous" as const };
    if (candidates.length === 1)
      return {
        ...details,
        status: row.paymentHint ? ("candidate_exact" as const) : ("candidate_amount_only" as const),
      };
    return { ...details, status: "unmatched" as const };
  });
}
