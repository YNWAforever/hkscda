import { formatAdminNumber } from "../adminPageCopy";

type SupporterActivitySummaryProps = {
  language: "zh" | "en";
  lifetimeAmountCents: number;
  donationCount: number;
  receiptCount: number;
  pendingPaymentCount: number;
  adoptionCaseCount: number;
  openFollowupCount: number;
  successfulAdoptionCount: number;
};

const ACTIVITY_COPY = {
  zh: {
    lifetime: "累計捐款",
    donations: "捐款",
    receipts: "收據",
    pendingPayments: "待處理付款",
    adoptionCases: "領養個案",
    openFollowups: "未完成跟進",
    successfulAdoptions: "成功領養",
  },
  en: {
    lifetime: "Lifetime",
    donations: "Donations",
    receipts: "Receipts",
    pendingPayments: "Pending payments",
    adoptionCases: "Adoption cases",
    openFollowups: "Open follow-ups",
    successfulAdoptions: "Successful adoptions",
  },
} as const;

function formatHkd(amountCents: number, language: "zh" | "en") {
  return new Intl.NumberFormat(language === "zh" ? "zh-HK" : "en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

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
  const copy = ACTIVITY_COPY[language];
  const stats = [
    { label: copy.lifetime, value: formatHkd(lifetimeAmountCents, language), wide: true },
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
