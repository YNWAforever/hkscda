import type { SessionCoverage } from "./sessionCoverage";
export type OverviewCounts = {
  pendingProfiles: number | null;
  pendingRegistrations: number | null;
  todayActivities: number | null;
};
export type OverviewCoverage = {
  centres: string[];
  next14: SessionCoverage;
  next30: SessionCoverage;
};
export type OverviewData = {
  date: string;
  counts: OverviewCounts;
  coverage?: OverviewCoverage | null;
};
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
    read: (range: ReturnType<typeof hongKongDayRange>) => Promise<OverviewCounts>;
    readCoverage?: (query: {
      from: string;
      centre: string;
      now: Date;
    }) => Promise<OverviewCoverage>;
  },
  now = () => new Date(),
) {
  return async (request: Request) => {
    const headers = { "cache-control": "no-store" };
    try {
      await deps.authorize(request);
      const snapshot = now();
      const range = hongKongDayRange(snapshot);
      const centre = new URL(request.url).searchParams.get("centre") ?? "all";
      if (centre !== "all" && !/^[a-z][a-z0-9_-]{0,79}$/.test(centre))
        return Response.json({ error: "服務地點無效" }, { status: 400, headers });
      const [counts, coverage] = await Promise.all([
        deps.read(range),
        deps.readCoverage
          ? deps.readCoverage({ from: range.date, centre, now: snapshot }).catch(() => null)
          : Promise.resolve(undefined),
      ]);
      return Response.json(
        { date: range.date, counts, ...(deps.readCoverage ? { coverage } : {}) },
        { headers },
      );
    } catch (error) {
      if (error instanceof Response)
        return new Response(error.body, {
          status: error.status,
          headers: { ...Object.fromEntries(error.headers), ...headers },
        });
      return Response.json({ error: "未能載入營運總覽，請重試。" }, { status: 500, headers });
    }
  };
}
