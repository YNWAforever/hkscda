/**
 * The finance command refusals the sponsorship RPCs raise, as stable codes. The server sends
 * the code with a fixed English message instead of the raw Postgres text (BUG-47); the admin
 * finance panel writes the message for each code in the admin's language (`financeCopy.ts`).
 */
export const SPONSORSHIP_FINANCE_ERROR_CODES = [
  "payment_already_linked",
  "payment_does_not_match",
  "reconcile_first",
  "ledger_changed",
  "amount_too_large",
  "retry_key_reused",
  "already_reversed",
  "not_found",
  "contact_not_verifiable",
  "not_ongoing",
] as const;

export type SponsorshipFinanceErrorCode = (typeof SPONSORSHIP_FINANCE_ERROR_CODES)[number];

type FinanceRefusal = {
  code: SponsorshipFinanceErrorCode;
  status: 404 | 409;
  message: string;
};

const REFUSALS: Record<SponsorshipFinanceErrorCode, FinanceRefusal> = {
  payment_already_linked: {
    code: "payment_already_linked",
    status: 409,
    message: "This payment is already linked to a payment proof.",
  },
  payment_does_not_match: {
    code: "payment_does_not_match",
    status: 409,
    message: "This payment does not match the approved proof.",
  },
  reconcile_first: {
    code: "reconcile_first",
    status: 409,
    message: "Reconcile the received payment first.",
  },
  ledger_changed: {
    code: "ledger_changed",
    status: 409,
    message: "The payment record changed. Reload and try again.",
  },
  amount_too_large: {
    code: "amount_too_large",
    status: 409,
    message: "The amount is more than the money still available.",
  },
  retry_key_reused: {
    code: "retry_key_reused",
    status: 409,
    message: "This action was already sent with different details. Reload and try again.",
  },
  already_reversed: {
    code: "already_reversed",
    status: 409,
    message: "This allocation has already been reversed.",
  },
  not_found: { code: "not_found", status: 404, message: "The finance record was not found." },
  contact_not_verifiable: {
    code: "contact_not_verifiable",
    status: 409,
    message: "These contact details cannot be verified here.",
  },
  not_ongoing: {
    code: "not_ongoing",
    status: 409,
    message: "Only ongoing commitments have follow-up months.",
  },
};

/** Each RPC exception text, matched exactly or by its stable prefix/suffix, to its code. */
const MESSAGE_RULES: Array<[(message: string) => boolean, SponsorshipFinanceErrorCode]> = [
  [(m) => m === "Legacy payment does not match approved proof", "payment_does_not_match"],
  [
    (m) =>
      m === "Legacy payment must be reconciled before refund" ||
      m === "Reconcile the received payment first",
    "reconcile_first",
  ],
  [
    (m) =>
      m === "Stale or unapproved proof" ||
      m === "Refund total changed; reload the ledger" ||
      m === "Allocation balance changed; reload the ledger" ||
      m === "Refunded money cannot be allocated",
    "ledger_changed",
  ],
  [
    (m) =>
      m === "Refund exceeds retained received money" ||
      m === "Allocation exceeds the remaining received money" ||
      m === "Allocation exceeds money retained after refunds" ||
      m === "Allocation exceeds outstanding month; split prepayments across months",
    "amount_too_large",
  ],
  [
    (m) =>
      m === "Retry key reused for changed allocation" ||
      m === "Refund retry key reused for different facts",
    "retry_key_reused",
  ],
  [
    (m) =>
      m.startsWith("Allocation ") &&
      (m.endsWith(" has already been reversed") || m.endsWith(" is itself a reversal")),
    "already_reversed",
  ],
  [
    (m) =>
      m === "Payment proof not found" ||
      (m.startsWith("Payment proof ") && m.endsWith(" not found")) ||
      (m.startsWith("Allocation ") && m.endsWith(" not found")),
    "not_found",
  ],
  [
    (m) =>
      m === "No submitted contact snapshot; legacy details are unknown" ||
      m === "Email identity changes require separate verified identity handling" ||
      m === "Submitted contact name is missing",
    "contact_not_verifiable",
  ],
  [(m) => m === "Only ongoing commitments have follow-up months", "not_ongoing"],
];

/**
 * The refusal for a finance RPC error, or `null` when it is not a known refusal (the caller logs
 * it and answers 500). A unique violation (23505) is a payment already linked to another proof.
 */
export function sponsorshipFinanceRefusal(error: {
  code?: unknown;
  message?: unknown;
}): FinanceRefusal | null {
  if (error.code === "23505") return REFUSALS.payment_already_linked;
  if (typeof error.message !== "string") return null;
  const message = error.message;
  const rule = MESSAGE_RULES.find(([matches]) => matches(message));
  return rule ? REFUSALS[rule[1]] : null;
}

export function isSponsorshipFinanceErrorCode(code: unknown): code is SponsorshipFinanceErrorCode {
  return (SPONSORSHIP_FINANCE_ERROR_CODES as readonly unknown[]).includes(code);
}
