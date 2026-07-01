import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Inbox, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  AdoptionIntakeItem,
  AdoptionIntakeLane,
  AdoptionIntakeUrgency,
} from "../../../lib/adoptions/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { useAdminPageCopy } from "../adminPageCopy";
import { fetchCoordinatorJson } from "./api";
import { formatDate, formatFallback } from "./caseWorkflowLogic";
import { buildIntakeSearchParams, intakeUrgencyLabel } from "./intakeInboxLogic";

type IntakeItemsResponse = {
  items: AdoptionIntakeItem[];
};

type LaneFilter = "all" | AdoptionIntakeLane;

const LANE_FILTERS: LaneFilter[] = [
  "all",
  "new_adoption_application",
  "photos_to_review",
  "visit_followup",
  "needs_followup",
];

const urgencyClasses: Record<AdoptionIntakeUrgency, string> = {
  normal: "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]",
  high: "border-[var(--color-warning)] bg-[var(--color-surface-offset)] text-[var(--color-panel)]",
  overdue:
    "border-[var(--color-error)] bg-[var(--color-primary-highlight)] text-[var(--color-error)]",
};

const EMPTY_ITEMS: AdoptionIntakeItem[] = [];

function laneValue(lane: LaneFilter): AdoptionIntakeLane | undefined {
  return lane === "all" ? undefined : lane;
}

function summaryLine(item: AdoptionIntakeItem, labels: { rankedAnimals: string; photos: string }) {
  const parts: string[] = [];
  const rankedAnimals = item.summary.rankedAnimals ?? [];

  if (rankedAnimals.length > 0) {
    parts.push(
      `${labels.rankedAnimals}: ${rankedAnimals
        .map((animal) => `#${animal.rank} ${animal.animalName}`)
        .join(", ")}`,
    );
  }
  if (typeof item.summary.photoCount === "number") {
    parts.push(`${labels.photos}: ${item.summary.photoCount}`);
  }

  return parts.join(" · ");
}

function visitSummary(visit: Record<string, unknown> | undefined) {
  if (!visit) return "";
  return Object.entries(visit)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" · ");
}

export function IntakeInbox() {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = pageCopy.intakeInbox;
  const [lane, setLane] = useState<LaneFilter>("all");
  const [openOnly, setOpenOnly] = useState(true);

  const searchParams = useMemo(
    () =>
      buildIntakeSearchParams({
        lane: laneValue(lane),
        openOnly,
      }),
    [lane, openOnly],
  );

  const { data, error, isLoading, isFetching, refetch } = useQuery<IntakeItemsResponse, Error>({
    queryKey: ["adoption-intake-items", searchParams.toString()],
    queryFn: () =>
      fetchCoordinatorJson<IntakeItemsResponse>(
        `/api/admin/adoptions/intake/items?${searchParams}`,
      ),
  });

  const items = data?.items ?? EMPTY_ITEMS;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.subtitle}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className="h-4 w-4" />
          {pageCopy.common.refresh}
        </Button>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            {LANE_FILTERS.map((option) => {
              const selected = option === lane;
              return (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  onClick={() => setLane(option)}
                >
                  {option === "all" ? copy.allLanes : copy.lanes[option]}
                </Button>
              );
            })}
          </div>
          <label className="flex h-9 items-center justify-between gap-3 rounded-md border border-[var(--color-border)] px-3 text-sm text-[var(--color-panel)]">
            <span>{copy.openOnly}</span>
            <Switch
              checked={openOnly}
              onCheckedChange={setOpenOnly}
              aria-label={copy.openOnlyLabel}
            />
          </label>
        </div>
      </section>

      {error && (
        <div
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-error)]"
          role="alert"
        >
          {copy.loadError}: {error.message}
        </div>
      )}

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-panel)]">
            <Inbox className="h-4 w-4" />
            <span>{pageCopy.common.totalCount(items.length)}</span>
          </div>
          {isFetching && (
            <span className="text-xs text-[var(--color-text-muted)]">
              {pageCopy.common.loading}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-20 rounded bg-[var(--color-lavender)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-sm text-[var(--color-text-muted)]">{copy.empty}</div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {items.map((item) => {
              const applicantName = item.summary.applicantName ?? item.publicApplicationId;
              const line = summaryLine(item, copy);
              const visit = visitSummary(item.summary.visit);

              return (
                <article key={item.id} className="grid gap-3 px-4 py-4 xl:grid-cols-[1fr_220px]">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
                      >
                        {copy.lanes[item.lane]}
                      </Badge>
                      <Badge variant="outline" className={urgencyClasses[item.urgency]}>
                        {intakeUrgencyLabel(item.urgency, language)}
                      </Badge>
                      {item.resolvedAt && (
                        <Badge
                          variant="outline"
                          className="border-[var(--color-success)] bg-[var(--color-success-highlight)] text-[var(--color-success)]"
                        >
                          {copy.resolved}
                        </Badge>
                      )}
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-[var(--color-panel)]">
                        {applicantName}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                        {line || formatFallback(null)}
                      </p>
                      {visit && (
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          {copy.visit}: {visit}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2 text-sm text-[var(--color-text-muted)] xl:items-end">
                    <div>
                      {copy.due}:{" "}
                      <span className="font-medium text-[var(--color-panel)]">
                        {formatDate(item.dueAt)}
                      </span>
                    </div>
                    <div>
                      {copy.created}: {formatDate(item.createdAt)}
                    </div>
                    {item.adoptionCaseId ? (
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link
                          to="/admin/applications/$id"
                          params={{ id: item.adoptionCaseId }}
                          className="gap-2"
                        >
                          {copy.viewCase}
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">{copy.noCase}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
