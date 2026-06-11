import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  value: string
  label: string
  icon?: LucideIcon
  color?: string
}

export function StatCard({ value, label, icon: Icon, color }: StatCardProps) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 text-center">
      {Icon && (
        <div className="mb-3 flex justify-center">
          <Icon
            className="h-8 w-8"
            style={{ color: color ?? "var(--color-primary)" }}
          />
        </div>
      )}
      <div
        className="font-display text-3xl lg:text-4xl font-bold"
        style={{ color: color ?? "var(--color-text)" }}
      >
        {value}
      </div>
      <div className="text-xs lg:text-sm text-[var(--color-text-muted)] mt-2">
        {label}
      </div>
    </div>
  )
}
