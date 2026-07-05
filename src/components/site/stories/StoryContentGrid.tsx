import { Link } from "@tanstack/react-router";
import { CalendarDays, FileText, ShoppingBag } from "lucide-react";

import type { ContentSummary, ContentType } from "../../../lib/content/types";

type StoryContentGridProps = {
  items: ContentSummary[];
};

const typeMeta: Record<
  Exclude<ContentType, "rescue_story">,
  { label: string; title: string; Icon: typeof CalendarDays }
> = {
  event: { label: "活動", title: "近期活動", Icon: CalendarDays },
  charity_market: { label: "義賣", title: "慈善市集", Icon: ShoppingBag },
  report: { label: "報告", title: "透明度報告", Icon: FileText },
};

export function StoryContentGrid({ items }: StoryContentGridProps) {
  const promotionItems = items.filter((item) => item.type !== "rescue_story");

  return (
    <section className="bg-[var(--color-surface)] px-4 py-10 sm:py-12">
      <div className="container-wide space-y-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)]">
            Promotion Center
          </div>
          <h2 className="mt-2 font-display text-3xl font-bold text-[var(--color-panel)]">
            活動、義賣與報告
          </h2>
        </div>

        {promotionItems.length === 0 ? (
          <div className="card-dashed bg-[var(--color-surface-offset)] p-6 text-sm text-[var(--color-text-muted)]">
            暫時未有公開活動、義賣或報告。
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {promotionItems.map((item) => {
              const meta = typeMeta[item.type as Exclude<ContentType, "rescue_story">];
              const Icon = meta.Icon;
              return (
                <article
                  key={item.id}
                  className="card-dashed flex min-h-[260px] flex-col overflow-hidden bg-[var(--color-surface)]"
                >
                  {item.coverImageUrl ? (
                    <img
                      src={item.coverImageUrl}
                      alt={item.title}
                      className="aspect-[16/9] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[16/9] items-center justify-center bg-[var(--color-primary-highlight)] text-[var(--color-primary)]">
                      <Icon className="h-10 w-10" aria-hidden="true" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="mb-2 text-xs font-bold text-[var(--color-primary)]">
                      {meta.title} · {meta.label}
                    </div>
                    <h3 className="font-display text-xl font-bold text-[var(--color-panel)]">
                      {item.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--color-text-muted)]">
                      {item.summary}
                    </p>
                    {item.ctaUrl ? (
                      <a
                        href={item.ctaUrl}
                        className="mt-auto pt-4 text-sm font-bold text-[var(--color-primary)]"
                      >
                        {item.ctaLabel ?? "了解更多"}
                      </a>
                    ) : (
                      <Link
                        to={`/stories/${item.slug}`}
                        className="mt-auto pt-4 text-sm font-bold text-[var(--color-primary)]"
                      >
                        閱讀詳情
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
