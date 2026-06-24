import type { SupporterTimelineItem } from "../../../lib/crm/types";

type SupporterTimelineProps = {
  items: SupporterTimelineItem[];
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatHkd(amountCents: number) {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

export function SupporterTimeline({ items }: SupporterTimelineProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]">
        No timeline activity yet.
      </div>
    );
  }

  return (
    <ol className="divide-y divide-[var(--color-border)] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      {items.map((item) => (
        <li key={item.id} className="grid gap-3 p-4 sm:grid-cols-[10rem_1fr]">
          <time className="text-xs font-medium text-[var(--color-text-muted)]">
            {formatDateTime(item.at)}
          </time>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[var(--color-panel)]">{item.title}</p>
              <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs text-[var(--color-panel)]">
                {item.kind}
              </span>
              {item.status && (
                <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                  {item.status}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{item.description}</p>
            {item.amountCents !== undefined && (
              <p className="mt-1 text-sm font-semibold text-[var(--color-panel)]">
                {formatHkd(item.amountCents)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
