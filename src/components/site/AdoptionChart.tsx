import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import { Cat, Dog } from "lucide-react"
import type { Animal } from "@/types/animal"

interface MonthData {
  month: string
  cats: number
  dogs: number
  total: number
}

function groupByMonth(animals: Animal[]): MonthData[] {
  const map = new Map<string, { cats: number; dogs: number }>()

  for (const a of animals) {
    const d = new Date(a.updated_at ?? a.created_at ?? "")
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const entry = map.get(key) ?? { cats: 0, dogs: 0 }
    if (a.type === "cat") entry.cats++
    else entry.dogs++
    map.set(key, entry)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, v]) => ({
      month: month.replace("-", "年") + "月",
      cats: v.cats,
      dogs: v.dogs,
      total: v.cats + v.dogs,
    }))
}

interface AdoptionChartProps {
  animals: Animal[]
}

const CAT_COLOR = "var(--color-cat)"
const DOG_COLOR = "var(--color-dog)"

export function AdoptionChart({ animals }: AdoptionChartProps) {
  const data = groupByMonth(animals)
  const totalCats = animals.filter((a) => a.type === "cat").length
  const totalDogs = animals.filter((a) => a.type === "dog").length
  const pieData = [
    { name: "貓", value: totalCats, color: CAT_COLOR, icon: Cat },
    { name: "狗", value: totalDogs, color: DOG_COLOR, icon: Dog },
  ]

  if (data.length === 0) {
    return (
      <p className="text-center py-16 text-[var(--color-text-muted)]">
        暫無領養數據。數據將在動物成功獲領養後自動更新。
      </p>
    )
  }

  return (
    <div className="space-y-10">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
        <h2 className="font-display text-lg font-bold mb-4">
          每月領養趨勢（近12個月）
        </h2>
        <div className="sr-only">
          過去12個月每月貓狗領養數據趨勢圖，貓以啡紅色標示，狗以藍色標示。
        </div>
        <div className="h-72 lg:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              <Legend />
              <Bar dataKey="cats" name="貓" fill={CAT_COLOR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="dogs" name="狗" fill={DOG_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
          <h2 className="font-display text-lg font-bold mb-4">貓狗領養比例</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col justify-center">
          <div className="space-y-4">
            {pieData.map(({ name, value, color, icon: Icon }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center"
                    style={{ background: `${color}15` }}
                  >
                    <Icon className="h-5 w-5" style={{ color }} />
                  </div>
                  <span className="font-bold">{name}總領養</span>
                </div>
                <span className="font-display text-2xl font-bold" style={{ color }}>
                  {value}
                </span>
              </div>
            ))}
            <div className="pt-3 border-t border-[var(--color-divider)] flex justify-between">
              <span className="font-bold">總計</span>
              <span className="font-display text-2xl font-bold text-[var(--color-primary)]">
                {totalCats + totalDogs}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
