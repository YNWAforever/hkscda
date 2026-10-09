import { Link } from "@tanstack/react-router";

import type { AdminLanguage } from "../../../lib/admin/language";
import type { SupporterTimelineItem } from "../../../lib/crm/types";
import { deliveryLabel } from "../../../lib/notifications/deliveryLabel";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { StatusPill } from "../StatusBadge";
import { crmLabelCopy, timelineCopy } from "./copy";
import { crmFormatCopy } from "./formatCopy";

type SupporterTimelineProps = {
  items: SupporterTimelineItem[];
};

/**
 * What to show under a timeline item's title. The server writes a message's delivery state in
 * zh-HK at the end of its description, so English shows the subject and writes the state itself.
 */
function timelineDescription(item: SupporterTimelineItem, language: AdminLanguage) {
  if (language === "zh" || item.kind !== "message" || item.subject === undefined) {
    return item.description;
  }
  return [item.subject, deliveryLabel(item.deliveryState, language)].filter(Boolean).join(" · ");
}

export function SupporterTimeline({ items }: SupporterTimelineProps) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(timelineCopy, language);
  const labels = pickAdminCopy(crmLabelCopy, language);
  const format = pickAdminCopy(crmFormatCopy, language);

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
            {format.dateTime(item.at)}
          </time>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {item.link ? (
                <Link
                  to={item.link.to}
                  params={item.link.params}
                  className="font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {item.title}
                </Link>
              ) : (
                <p className="font-semibold text-[var(--color-panel)]">{item.title}</p>
              )}
              <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs text-[var(--color-panel)]">
                {copy.kind(item.kind)}
              </span>
              {item.status && <StatusPill>{labels.status(item.status)}</StatusPill>}
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {timelineDescription(item, language)}
            </p>
            {item.amountCents !== undefined && (
              <p className="mt-1 text-sm font-semibold text-[var(--color-panel)]">
                {format.money(item.amountCents)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
