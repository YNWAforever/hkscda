import type { SupporterTimelineItem } from "../../../lib/crm/types";
import { formatAdminDateTime, useAdminPageCopy } from "../adminPageCopy";

type SupporterTimelineProps = {
  items: SupporterTimelineItem[];
};

const TIMELINE_COPY = {
  zh: {
    empty: "尚未有時間軸活動。",
    kinds: {
      donation: "捐款",
      payment: "付款",
      receipt: "收據",
      consent: "通訊同意",
      supporter: "捐款人",
    },
    statuses: {
      pending: "待處理",
      succeeded: "成功",
      failed: "失敗",
      issued: "已發出",
      voided: "已作廢",
    },
  },
  en: {
    empty: "No timeline activity yet.",
    kinds: {
      donation: "Donation",
      payment: "Payment",
      receipt: "Receipt",
      consent: "Consent",
      supporter: "Supporter",
    },
    statuses: {
      pending: "Pending",
      succeeded: "Succeeded",
      failed: "Failed",
      issued: "Issued",
      voided: "Voided",
    },
  },
} as const;

function formatHkd(amountCents: number, language: keyof typeof TIMELINE_COPY) {
  return new Intl.NumberFormat(language === "zh" ? "zh-HK" : "en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

function timelineKind(kind: string, language: keyof typeof TIMELINE_COPY) {
  const labels = TIMELINE_COPY[language].kinds as Record<string, string>;
  return labels[kind] ?? kind;
}

function timelineStatus(status: string, language: keyof typeof TIMELINE_COPY) {
  const labels = TIMELINE_COPY[language].statuses as Record<string, string>;
  return labels[status] ?? status;
}

export function SupporterTimeline({ items }: SupporterTimelineProps) {
  const { language } = useAdminPageCopy();
  const copy = TIMELINE_COPY[language];

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]">
        {copy.empty}
      </div>
    );
  }

  return (
    <ol className="divide-y divide-[var(--color-border)] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      {items.map((item) => (
        <li key={item.id} className="grid gap-3 p-4 sm:grid-cols-[10rem_1fr]">
          <time className="text-xs font-medium text-[var(--color-text-muted)]">
            {formatAdminDateTime(item.at, language)}
          </time>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[var(--color-panel)]">{item.title}</p>
              <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs text-[var(--color-panel)]">
                {timelineKind(item.kind, language)}
              </span>
              {item.status && (
                <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                  {timelineStatus(item.status, language)}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{item.description}</p>
            {item.amountCents !== undefined && (
              <p className="mt-1 text-sm font-semibold text-[var(--color-panel)]">
                {formatHkd(item.amountCents, language)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
