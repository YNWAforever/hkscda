import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Cat, Dog, PawPrint, TrendingUp } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { ReportHeader } from "@/components/site/ReportHeader"
import { StatCard } from "@/components/site/StatCard"
import { AdoptionChart } from "@/components/site/AdoptionChart"
import { datasetSchema, renderJsonLd } from "@/lib/schema"

export const Route = createFileRoute("/report/adoption")({
  head: () => ({
    meta: [
      { title: "每月領養報告 — 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "查看香港拯救貓狗協會每月貓狗領養數據、領養趨勢圖表及成功領養記錄。透明度報告定期更新。",
      },
      { property: "og:title", content: "每月領養報告 — HKSCDA" },
      { property: "og:description", content: "每月貓狗領養數據及趨勢圖表" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/report/adoption" }],
  }),
  component: AdoptionReportPage,
})

function AdoptionReportPage() {
  const [selectedMonth, setSelectedMonth] = useState("all")

  const { data, isLoading } = useQuery({
    queryKey: ["adoption-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("animals")
        .select("*")
        .eq("status", "adopted")
        .order("updated_at", { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const animals = data ?? []
  const totalCats = animals.filter((a) => a.type === "cat").length
  const totalDogs = animals.filter((a) => a.type === "dog").length
  const totalAdopted = animals.length

  const months = Array.from(
    new Set(
      animals.map((a) => {
        const d = new Date(a.updated_at ?? a.created_at ?? "")
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      })
    )
  ).sort((a, b) => b.localeCompare(a))

  const periodOptions = [
    { value: "all", label: "全部時期" },
    ...months.map((m) => ({
      value: m,
      label: m.replace("-", "年") + "月",
    })),
  ]

  const schema = datasetSchema("HKSCDA 每月領養報告", "香港拯救貓狗協會每月貓狗領養數據統計")

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {renderJsonLd(schema)}

      <ReportHeader
        title="每月領養報告"
        subtitle="支持領養等於拯救生命 — 每隻成功領養的動物都是我們的驕傲"
        periods={periodOptions}
        selectedPeriod={selectedMonth}
        onPeriodChange={setSelectedMonth}
      />

      {isLoading ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">載入中…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard value={String(totalAdopted)} label="成功領養" icon={PawPrint} color="var(--color-primary)" />
            <StatCard value={String(totalCats)} label="貓咪獲領養" icon={Cat} color="var(--color-cat)" />
            <StatCard value={String(totalDogs)} label="狗狗獲領養" icon={Dog} color="var(--color-dog)" />
            <StatCard value={String(months.length)} label="有記錄月份" icon={TrendingUp} color="var(--color-success)" />
          </div>

          <AdoptionChart animals={animals} />

          {animals.length > 0 && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
              <h2 className="font-display text-lg font-bold mb-4">最近獲領養動物</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-divider)]">
                      <th className="text-left p-3 font-medium text-[var(--color-text-muted)]">名稱</th>
                      <th className="text-left p-3 font-medium text-[var(--color-text-muted)]">種類</th>
                      <th className="text-left p-3 font-medium text-[var(--color-text-muted)]">性別</th>
                      <th className="text-left p-3 font-medium text-[var(--color-text-muted)]">年齡</th>
                      <th className="text-left p-3 font-medium text-[var(--color-text-muted)]">領養日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animals.slice(0, 20).map((a) => (
                      <tr key={a.id} className="border-b border-[var(--color-divider)]">
                        <td className="p-3 font-medium">{a.name}</td>
                        <td className="p-3 text-[var(--color-text-muted)]">{a.type === "cat" ? "貓" : "狗"}</td>
                        <td className="p-3 text-[var(--color-text-muted)]">{a.gender === "male" ? "公" : "母"}</td>
                        <td className="p-3 text-[var(--color-text-muted)]">{a.age}</td>
                        <td className="p-3 text-[var(--color-text-muted)]">
                          {a.updated_at ? new Date(a.updated_at).toLocaleDateString("zh-HK") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
