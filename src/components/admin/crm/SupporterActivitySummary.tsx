import { formatAdminNumber } from "../adminPageCopy";
import type { AdminLanguage } from "../i18n/copy";
import { pickAdminCopy } from "../i18n/copy";
import { activitySummaryCopy } from "./copy";
import { crmFormatCopy } from "./formatCopy";

type SupporterActivitySummaryProps = {
  language: AdminLanguage;
  lifetimeAmountCents: number;
  donationCount: number;
  receiptCount: number;
  pendingPaymentCount: number;
  adoptionCaseCount: number;
  openFollowupCount: number;
  successfulAdoptionCount: number;
};

export function SupporterActivitySummary({
  language,
  lifetimeAmountCents,
  donationCount,
  receiptCount,
  pendingPaymentCount,
  adoptionCaseCount,
  openFollowupCount,
  successfulAdoptionCount,
}: SupporterActivitySummaryProps) {
  const copy = pickAdminCopy(activitySummaryCopy, language);
  const format = pickAdminCopy(crmFormatCopy, language);
  const stats = [
    { label: copy.lifetime, value: format.money(lifetimeAmountCents), wide: true },
    { label: copy.donations, value: formatAdminNumber(donationCount, language) },
    { label: copy.receipts, value: formatAdminNumber(receiptCount, language) },
    { label: copy.pendingPayments, value: formatAdminNumber(pendingPaymentCount, language) },
    { label: copy.adoptionCases, value: formatAdminNumber(adoptionCaseCount, language) },
    { label: copy.openFollowups, value: formatAdminNumber(openFollowupCount, language) },
    {
      label: copy.successfulAdoptions,
      value: formatAdminNumber(successfulAdoptionCount, language),
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={[
            "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4",
            stat.wide ? "sm:col-span-2 2xl:col-span-1" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <p className="text-xs font-medium uppercase text-[var(--color-text-muted)]">
            {stat.label}
          </p>
          <p className="mt-2 text-xl font-bold text-[var(--color-panel)]">{stat.value}</p>
        </div>
      ))}
    </section>
  );
}
