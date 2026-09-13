export type OverviewCounts = {
  pendingProfiles: number | null;
  pendingRegistrations: number | null;
  todayActivities: number | null;
};
export type OverviewData = { date: string; counts: OverviewCounts };
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
  },
  now = () => new Date(),
) {
  return async (request: Request) => {
    const headers = { "cache-control": "no-store" };
    try {
      await deps.authorize(request);
      const range = hongKongDayRange(now());
      return Response.json({ date: range.date, counts: await deps.read(range) }, { headers });
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
