import { useQuery } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { TaskCard } from "../../../lib/operations/taskOverview.server";
import { LoadFailure } from "../LoadFailure";

export function TaskOverviewView({ cards }: { cards: TaskCard[] }) {
  return (
    <section aria-labelledby="task-guidance-title">
      <h2 id="task-guidance-title" className="text-xl font-semibold text-[var(--color-panel)]">
        工作起步建議
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        依目前職員權限列出常用步驟；按個案情況核對資料後再處理。
      </p>
      <ol className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card, index) => (
          <li key={card.key}>
            <article className="h-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                步驟 {index + 1}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-[var(--color-panel)]">{card.label}</h3>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">{card.guidance}</p>
              <p className="mt-2 text-2xl font-bold" role="status">
                {card.metric.state === "ready" ? card.metric.count : "未能讀取"}
              </p>
              {card.metric.state === "ready" && card.metric.oldestAt ? (
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  最早：
                  {new Date(card.metric.oldestAt).toLocaleString("zh-HK", {
                    timeZone: "Asia/Hong_Kong",
                  })}
                </p>
              ) : null}
              <a
                href={card.href}
                className="mt-4 inline-flex min-h-11 items-center underline underline-offset-4"
              >
                開啟工作區
              </a>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TaskOverview() {
  const query = useQuery({
    queryKey: ["admin-task-overview"],
    queryFn: () => fetchAdminJson<{ cards: TaskCard[] }>("/api/admin/task-overview"),
    staleTime: 30_000,
  });
  if (query.isLoading) return <p role="status">正在載入待辦…</p>;
  if (query.isError) {
    return (
      <LoadFailure
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  return <TaskOverviewView cards={query.data?.cards ?? []} />;
}
