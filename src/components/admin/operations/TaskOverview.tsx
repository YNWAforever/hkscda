import { useQuery } from "@tanstack/react-query";

import { adminIdentityQueryOptions } from "../../../lib/admin/identity";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { TaskCard } from "../../../lib/operations/taskOverview.server";
import { LoadFailure } from "../LoadFailure";

export function TaskOverviewView({ cards }: { cards: TaskCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <article
          key={card.key}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
        >
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">{card.label}</h2>
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
      ))}
    </div>
  );
}

export function TaskOverview() {
  const identity = useQuery(adminIdentityQueryOptions());
  const admin = identity.data?.admin;
  const enabled = !identity.isError && admin?.status === "active";
  const query = useQuery({
    queryKey: ["admin-task-overview", admin?.authUserId, admin?.role, admin?.status],
    queryFn: ({ signal }) =>
      fetchAdminJson<{ cards: TaskCard[] }>("/api/admin/task-overview", { signal }),
    enabled,
    staleTime: 30_000,
    gcTime: 0,
  });
  if (identity.isPending) return <p role="status">正在核對職員身份…</p>;
  if (!enabled) return <p role="alert">未能確認有效職員身份，請重新登入。</p>;
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
