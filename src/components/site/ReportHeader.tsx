interface ReportHeaderProps {
  title: string;
  subtitle?: string;
  period?: string;
  periods?: { value: string; label: string }[];
  selectedPeriod?: string;
  onPeriodChange?: (period: string) => void;
}

export function ReportHeader({
  title,
  subtitle,
  period,
  periods,
  selectedPeriod,
  onPeriodChange,
}: ReportHeaderProps) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="font-display text-3xl lg:text-5xl font-bold mb-2">{title}</h1>
          {subtitle && <p className="text-[var(--color-text-muted)]">{subtitle}</p>}
        </div>
        {periods && onPeriodChange && selectedPeriod && (
          <select
            value={selectedPeriod}
            onChange={(e) => onPeriodChange(e.target.value)}
            className="min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium focus:outline-none focus:border-[var(--color-primary)]"
            aria-label="選擇時期"
          >
            {periods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {period && <p className="text-sm text-[var(--color-text-muted)]">報告期間：{period}</p>}
    </div>
  );
}
