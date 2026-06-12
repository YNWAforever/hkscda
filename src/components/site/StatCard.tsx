import type { Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";

interface StatCardProps {
  value: string;
  label: string;
  icon?: LucideIcon;
  color?: string;
}

// value stays a display string ("600+", "3.5K", "24"); the numeric head counts
// up once on scroll-into-view, any prefix/suffix renders untouched.
function parseValue(value: string) {
  const m = value.match(/^([^0-9]*)([0-9][0-9,]*(?:\.[0-9]+)?)(.*)$/);
  if (!m) return null;
  const raw = m[2].replace(/,/g, "");
  return {
    prefix: m[1],
    num: parseFloat(raw),
    decimals: raw.split(".")[1]?.length ?? 0,
    grouped: m[2].includes(","),
    suffix: m[3],
  };
}

export function StatCard({ value, label, icon: Icon, color }: StatCardProps) {
  const parsed = parseValue(value);
  const { ref, value: n } = useCountUp(parsed ? parsed.num * 10 ** parsed.decimals : 0);
  const scaled = parsed ? n / 10 ** parsed.decimals : 0;
  const display = parsed
    ? `${parsed.prefix}${
        parsed.grouped
          ? Math.round(scaled).toLocaleString("en-US")
          : scaled.toFixed(parsed.decimals)
      }${parsed.suffix}`
    : value;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 text-center">
      {Icon && (
        <div className="mb-3 flex justify-center">
          <Icon className="h-8 w-8" style={{ color: color ?? "var(--color-primary)" }} />
        </div>
      )}
      <div
        ref={ref as Ref<HTMLDivElement>}
        className="font-display text-3xl lg:text-4xl font-bold"
        style={{ color: color ?? "var(--color-text)" }}
      >
        {display}
      </div>
      <div className="text-xs lg:text-sm text-[var(--color-text-muted)] mt-2">{label}</div>
    </div>
  );
}
