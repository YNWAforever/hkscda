import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { ReceiptText } from "lucide-react";

interface AuditDataItem {
  name: string;
  value: number;
  color: string;
}

interface AuditChartProps {
  title: string;
  data: AuditDataItem[];
  total: number;
  totalLabel: string;
}

export function AuditChart({ title, data, total, totalLabel }: AuditChartProps) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
      <h2 className="font-display text-lg font-bold mb-4">{title}</h2>
      <div className="sr-only">
        {title}分佈數據圖表。各項目以不同顏色標示，總計HK${total.toLocaleString()}。
      </div>
      <div className="grid md:grid-cols-2 gap-6 items-center">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value">
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
                formatter={(value: number) => [`HK$${value.toLocaleString()}`, ""]}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3">
          {data.map(({ name, value, color }) => (
            <div key={name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ background: color }} />
                <span className="text-sm text-[var(--color-text-muted)]">{name}</span>
              </div>
              <span className="font-bold text-sm">HK${value.toLocaleString()}</span>
            </div>
          ))}
          <div className="pt-3 border-t border-[var(--color-divider)] flex justify-between">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-[var(--color-primary)]" />
              <span className="font-bold">{totalLabel}</span>
            </div>
            <span className="font-display text-xl font-bold text-[var(--color-primary)]">
              HK${total.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
