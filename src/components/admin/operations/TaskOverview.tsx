import { useQuery } from "@tanstack/react-query";

import { adminIdentityQueryOptions } from "../../../lib/admin/identity";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { TaskCard } from "../../../lib/operations/taskOverview.server";
import { taskCardTextFor } from "../../../lib/operations/taskCardText";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { LoadFailure } from "../LoadFailure";
import { operationsCopy } from "./copy";

export function TaskOverviewView({ cards }: { cards: TaskCard[] }) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(operationsCopy, language).guidance;
  return (
    <section aria-labelledby="task-guidance-title">
      <h2 id="task-guidance-title" className="text-xl font-semibold text-[var(--color-panel)]">
        {copy.heading}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      <ol className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card, index) => {
          // The server sends zh-HK text; the card key finds the text in the active language, and an
          // unknown key (version skew after a deploy) falls back to the server text.
          const text = taskCardTextFor(card, language);
          return (
            <li key={card.key}>
              <article className="h-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                  {copy.step(index + 1)}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[var(--color-panel)]">
                  {text.label}
                </h3>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">{text.guidance}</p>
                <p className="mt-2 text-2xl font-bold" role="status">
                  {card.metric.state === "ready" ? card.metric.count : copy.unavailable}
                </p>
                {card.metric.state === "ready" && card.metric.oldestAt ? (
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {copy.oldest(card.metric.oldestAt)}
                  </p>
                ) : null}
                <a
                  href={card.href}
                  className="mt-4 inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  {copy.openWorkspace}
                </a>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function TaskOverview() {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(operationsCopy, language).states;
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
  if (identity.isPending) return <p role="status">{copy.checkingIdentity}</p>;
  if (!enabled) return <p role="alert">{copy.identityUnconfirmed}</p>;
  if (query.isLoading) return <p role="status">{copy.loading}</p>;
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

/** The task overview page: heading, introduction and the cards. */
export function TaskOverviewPage() {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(operationsCopy, language).page;
  return (
    <main className="space-y-5 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p className="text-[var(--color-text-muted)]">{copy.description}</p>
      <TaskOverview />
    </main>
  );
}
