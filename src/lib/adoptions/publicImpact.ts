export type SpeciesTotals = { cat: number; dog: number };

export type TrailingMonth = {
  month: string; // "YYYY-MM"
  start: string; // "YYYY-MM-DD", inclusive
  end: string; // "YYYY-MM-DD", exclusive
  label: string; // zh-HK, e.g. "2026年8月"
};

export type AdoptionImpactReport = {
  total: number;
  monthly: Array<{ month: string; label: string; count: number }>;
  asOf: string; // ISO
};

export function trailingMonths(now: Date, count = 12): TrailingMonth[] {
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  const months: TrailingMonth[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(nowYear, nowMonth - i, 1));
    const end = new Date(Date.UTC(nowYear, nowMonth - i + 1, 1));
    const month = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("zh-HK", {
      year: "numeric",
      month: "long",
      timeZone: "Asia/Hong_Kong",
    }).format(start);

    months.push({
      month,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      label,
    });
  }

  return months;
}

export function buildAdoptionImpactReport(input: {
  total: number;
  monthlyCounts: Record<string, number>;
  now: Date;
}): AdoptionImpactReport {
  const months = trailingMonths(input.now);
  return {
    total: input.total,
    monthly: months.map((m) => ({
      month: m.month,
      label: m.label,
      count: input.monthlyCounts[m.month] ?? 0,
    })),
    asOf: input.now.toISOString(),
  };
}
