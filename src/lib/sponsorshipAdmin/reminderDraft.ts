import { z } from "zod";

import type { PledgeDetail } from "./types";

type ReminderPeriod = Pick<
  PledgeDetail["periods"][number],
  "id" | "periodMonth" | "outstandingCents"
> & {
  allocations: ReadonlyArray<
    Pick<PledgeDetail["periods"][number]["allocations"][number], "amountCents">
  >;
};

/** Only facts needed for a read-only draft. No payment or notification command lives here. */
export type ReminderPledge = Pick<
  PledgeDetail,
  "id" | "supporterName" | "supporterEmail" | "language" | "status"
> & {
  proofHistory: ReadonlyArray<Pick<PledgeDetail["proofHistory"][number], "reviewStatus">>;
  periods: ReadonlyArray<ReminderPeriod>;
};

export type ReminderDraftResult =
  | {
      kind: "unavailable";
      reason:
        | "status"
        | "recipient"
        | "proof_pending"
        | "invalid_ledger"
        | "no_past_open_period"
        | "adjustment_review";
    }
  | {
      kind: "draft";
      recipient: { name: string; email: string };
      periodMonth: string;
      outstandingCents: number;
      generatedAt: string;
      subject: string;
      body: string;
    };

/** Remount an ephemeral preview whenever any fact used to generate it changes. */
export function sponsorshipReminderFactsKey(pledge: ReminderPledge): string {
  return JSON.stringify([
    pledge.id,
    pledge.supporterName,
    pledge.supporterEmail,
    pledge.language,
    pledge.status,
    pledge.proofHistory.map((proof) => proof.reviewStatus),
    pledge.periods.map((period) => [
      period.id,
      period.periodMonth,
      period.outstandingCents,
      period.allocations.map((allocation) => allocation.amountCents),
    ]),
  ]);
}

const emailSchema = z.string().trim().email();

function isMonthStart(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function hongKongMonth(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Hong Kong calendar month unavailable");
  return `${year}-${month}-01`;
}

export function buildSponsorshipReminderDraft(
  pledge: ReminderPledge,
  now: Date,
): ReminderDraftResult {
  // A running pledge is the only state with an established monthly relationship.
  if (pledge.status !== "active") return { kind: "unavailable", reason: "status" };
  const email = emailSchema.safeParse(pledge.supporterEmail);
  const name = pledge.supporterName.trim();
  if (!email.success || !name) return { kind: "unavailable", reason: "recipient" };
  // A newly uploaded proof may settle a month after review. Staff must resolve it first.
  if (pledge.proofHistory.some((proof) => proof.reviewStatus === "pending"))
    return { kind: "unavailable", reason: "proof_pending" };
  if (
    pledge.periods.some(
      (period) =>
        !isMonthStart(period.periodMonth) ||
        !Number.isSafeInteger(period.outstandingCents) ||
        period.outstandingCents < 0 ||
        period.allocations.some((allocation) => !Number.isSafeInteger(allocation.amountCents)),
    )
  )
    return { kind: "unavailable", reason: "invalid_ledger" };

  // The schema has a month but no due day. Only earlier calendar months qualify.
  const currentMonth = hongKongMonth(now);
  const past = pledge.periods.filter((period) => period.periodMonth < currentMonth);
  if (past.some((period) => period.allocations.some((allocation) => allocation.amountCents < 0)))
    return { kind: "unavailable", reason: "adjustment_review" };
  const candidate = past
    .filter((period) => period.outstandingCents > 0)
    .sort((left, right) => left.periodMonth.localeCompare(right.periodMonth))[0];
  if (!candidate) return { kind: "unavailable", reason: "no_past_open_period" };

  const monthLabel = candidate.periodMonth.slice(0, 7);
  // The draft is outward copy: it goes to the supporter in the supporter's own language
  // (`pledge.language`), not the admin's. The admin language never changes it, so the Chinese
  // below stays in the code and is not moved into an admin copy module. It is not interface
  // text; the admin only labels the draft (`bulkCopy.ts`).
  const english = pledge.language === "en";
  return {
    kind: "draft",
    recipient: { name, email: email.data },
    periodMonth: candidate.periodMonth,
    outstandingCents: candidate.outstandingCents,
    generatedAt: now.toISOString(),
    subject: english
      ? `Sponsorship record follow-up: ${monthLabel}`
      : `助養紀錄跟進：${monthLabel}`,
    body: english
      ? `Dear ${name},\n\nWe are reviewing your sponsorship record for ${monthLabel}. Our record shows that the payment information for this month needs checking. If you have already paid, please reply with the payment reference so our team can review it.\n\nHong Kong Saving Cats and Dogs Association`
      : `${name} 您好：\n\n我們正核對您 ${monthLabel} 的助養紀錄。現有紀錄顯示該月份的付款資料仍待核對。如您已付款，請回覆相關付款參考資料，以便職員跟進。\n\n香港拯救貓狗協會`,
  };
}
