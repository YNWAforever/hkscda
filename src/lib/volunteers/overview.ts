import { volunteerServerErrorText } from "./serverErrors";
import type { SessionCoverage } from "./sessionCoverage";
import type { PendingCounts } from "./pending";
import type { VolunteerJobHealth } from "./jobs/health";
export type OverviewCounts = {
  pendingProfiles: number | null;
  pendingRegistrations: number | null;
  pendingBreakdown?: PendingCounts | null;
  todayActivities: number | null;
};
export type OverviewCoverage = {
  centres: string[];
  next14: SessionCoverage;
  next30: SessionCoverage;
};
export type OverviewData = {
  runtimeHealth?: VolunteerJobHealth;
  date: string;
  counts: OverviewCounts;
  coverage?: OverviewCoverage | null;
};
export const overviewStatKeys = [
  "pendingProfiles",
  "pendingRegistrations",
  "todayActivities",
] as const;
export type OverviewStatKey = (typeof overviewStatKeys)[number];
export function failedOverviewStats(counts: OverviewCounts): OverviewStatKey[] {
  return overviewStatKeys.filter((key) => counts[key] === null);
}
/**
 * Keep a partial stat retry on the overview the admin is looking at.
 * A background refetch may replace the cache while the retry is in flight;
 * the selected figures are still applied when that replacement is the same day.
 */
export function applyRetriedOverviewStats(
  current: OverviewData | undefined,
  update: OverviewData,
  selected: readonly OverviewStatKey[],
): OverviewData | undefined {
  if (!current) return current;
  return mergeOverviewStats(current, update, selected);
}
export function mergeOverviewStats(
  previous: OverviewData,
  update: OverviewData,
  selected: readonly OverviewStatKey[],
): OverviewData {
  if (previous.date !== update.date) return previous;
  const counts = { ...previous.counts };
  for (const key of selected) counts[key] = update.counts[key];
  if (selected.includes("pendingRegistrations"))
    counts.pendingBreakdown = update.counts.pendingBreakdown ?? null;
  return { ...previous, counts };
}
export function hongKongDayRange(now: Date) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const next = new Date(date + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    date,
    from: date + "T00:00:00+08:00",
    until: next.toISOString().slice(0, 10) + "T00:00:00+08:00",
  };
}
export function createOverviewHandler(
  deps: {
    authorize: (request: Request) => Promise<unknown>;
    readHealth?: (signal: AbortSignal) => Promise<VolunteerJobHealth>;
    reportFailure?: (part: "coverage" | "health", error: unknown) => void;
    read: (
      range: ReturnType<typeof hongKongDayRange>,
      snapshot: Date,
      selected?: readonly OverviewStatKey[],
    ) => Promise<OverviewCounts>;
    readCoverage?: (query: {
      from: string;
      centre: string;
      now: Date;
      signal?: AbortSignal;
    }) => Promise<OverviewCoverage>;
  },
  now = () => new Date(),
  optionalReadTimeoutMs = 5_000,
) {
  return async (request: Request) => {
    const headers = { "cache-control": "no-store" };
    try {
      await deps.authorize(request);
      const snapshot = now();
      const range = hongKongDayRange(snapshot);
      const parameters = new URL(request.url).searchParams;
      const centre = parameters.get("centre") ?? "all";
      if (centre !== "all" && !/^[a-z][a-z0-9_-]{0,79}$/.test(centre))
        return Response.json(
          { error: volunteerServerErrorText("overview_invalid_centre") },
          { status: 400, headers },
        );
      const selections = parameters.getAll("stats");
      const keys = selections.length ? selections[0].split(",") : undefined;
      if (
        selections.length > 1 ||
        (keys &&
          (new Set(keys).size !== keys.length ||
            keys.some((key) => !overviewStatKeys.includes(key as OverviewStatKey))))
      )
        return Response.json(
          { error: volunteerServerErrorText("overview_invalid_stats") },
          { status: 400, headers },
        );
      const selected = keys as OverviewStatKey[] | undefined;
      const optionalRead = async <T>(
        part: "coverage" | "health",
        read: (signal: AbortSignal) => Promise<T>,
        unavailable: T,
      ): Promise<T> => {
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          return await new Promise<T>((resolve, reject) => {
            timeout = setTimeout(() => {
              const error = Object.assign(new Error("Overview read timed out"), {
                code: "TIMEOUT",
              });
              controller.abort(error);
              reject(error);
            }, optionalReadTimeoutMs);
            Promise.resolve()
              .then(() => read(controller.signal))
              .then(resolve, reject);
          });
        } catch (error) {
          deps.reportFailure?.(part, error);
          return unavailable;
        } finally {
          clearTimeout(timeout);
        }
      };
      const [counts, coverage, runtimeHealth] = await Promise.all([
        deps.read(range, snapshot, selected),
        deps.readCoverage && !selected
          ? optionalRead<OverviewCoverage | null>(
              "coverage",
              (signal) => deps.readCoverage!({ from: range.date, centre, now: snapshot, signal }),
              null,
            )
          : Promise.resolve(undefined),
        deps.readHealth && !selected
          ? optionalRead<VolunteerJobHealth>("health", (signal) => deps.readHealth!(signal), {
              state: "unknown",
              lastSuccessAt: null,
              lastFailureAt: null,
              consecutiveFailures: 0,
            })
          : Promise.resolve(undefined),
      ]);
      return Response.json(
        {
          date: range.date,
          counts,
          ...(deps.readCoverage && !selected ? { coverage } : {}),
          ...(runtimeHealth ? { runtimeHealth } : {}),
        },
        { headers },
      );
    } catch (error) {
      if (error instanceof Response)
        return new Response(error.body, {
          status: error.status,
          headers: { ...Object.fromEntries(error.headers), ...headers },
        });
      return Response.json(
        { error: volunteerServerErrorText("overview_load_failed") },
        { status: 500, headers },
      );
    }
  };
}
