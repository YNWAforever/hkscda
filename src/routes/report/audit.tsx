import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { TrendingUp, TrendingDown, Building, FileText } from "lucide-react"
import { ReportHeader } from "@/components/site/ReportHeader"
import { StatCard } from "@/components/site/StatCard"
import { AuditChart } from "@/components/site/AuditChart"
import { datasetSchema, renderJsonLd } from "@/lib/schema"

const auditData = {
  fiscalYear: "2025-2026",
  income: {
    total: 1850000,
    breakdown: [
      { name: "公眾捐款", value: 1200000, color: "var(--color-primary)" },
      { name: "助養計劃", value: 350000, color: "var(--color-secondary)" },
      { name: "企業贊助", value: 200000, color: "var(--color-cat)" },
      { name: "其他收入", value: 100000, color: "var(--color-dog)" },
    ],
  },
  expenditure: {
    total: 1620000,
    breakdown: [
      { name: "醫療及藥物", value: 680000, color: "#c04a2a" },
      { name: "糧食及物資", value: 420000, color: "#e87a3a" },
      { name: "營運及租金", value: 320000, color: "#2a6ab0" },
      { name: "外展及教育", value: 130000, color: "#3a7a45" },
      { name: "其他支出", value: 70000, color: "#c07820" },
    ],
  },
  surplus: 230000,
}

const yearOptions = [
  { value: "2025-2026", label: "2025-2026年度" },
]

export const Route = createFileRoute("/report/audit")({
  head: () => ({
    meta: [
      { title: "核數報告 — 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "香港拯救貓狗協會年度核數報告，公開透明展示協會收入、支出及善款運用情況。慈善牌照91/14493，IRD §88免稅機構。",
      },
      { property: "og:title", content: "核數報告 — HKSCDA" },
      { property: "og:description", content: "協會年度核數報告，公開透明展示收入及支出" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/report/audit" }],
  }),
  component: AuditReportPage,
})

function AuditReportPage() {
  const [selectedYear, setSelectedYear] = useState("2025-2026")

  const schema = datasetSchema("HKSCDA 核數報告", "香港拯救貓狗協會年度財務核數報告")
  const { income, expenditure, surplus } = auditData

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {renderJsonLd(schema)}

      <ReportHeader
        title="核數報告"
        subtitle="透明度是信任的基石 — 我們對每一位捐款者負責"
        period={auditData.fiscalYear}
        periods={yearOptions}
        selectedPeriod={selectedYear}
        onPeriodChange={setSelectedYear}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard value={`HK$${(income.total / 10000).toFixed(0)}萬`} label="總收入" icon={TrendingUp} color="var(--color-success)" />
        <StatCard value={`HK$${(expenditure.total / 10000).toFixed(0)}萬`} label="總支出" icon={TrendingDown} color="var(--color-primary)" />
        <StatCard value={`HK$${(surplus / 10000).toFixed(0)}萬`} label="盈餘" icon={Building} color="var(--color-dog)" />
        <StatCard value="—" label="下載完整報告" icon={FileText} color="var(--color-text-muted)" />
      </div>

      <AuditChart title="收入來源" data={income.breakdown} total={income.total} totalLabel="總收入" />
      <AuditChart title="支出分佈" data={expenditure.breakdown} total={expenditure.total} totalLabel="總支出" />

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 text-center space-y-4">
        <h2 className="font-display text-lg font-bold">完整核數報告</h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-[52ch] mx-auto">
          本會為政府認可慈善機構（91/14493）及稅務局 §88 免稅機構。
          完整核數報告 PDF 可供下載查閱。捐款 HK$100 以上可申請退稅收條。
        </p>
        <a
          href="/#donate"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-primary)] text-white font-bold text-sm hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          申請退稅收條
        </a>
      </div>

      <div className="bg-[var(--color-surface-offset)] border border-[var(--color-border)] rounded-2xl p-6">
        <h2 className="font-display text-lg font-bold mb-4">鳴謝</h2>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          感謝所有捐款者、企業贊助商及義工對本會的持續支持。
          每一分善款均用於動物醫療、糧食及絕育服務。
          如欲查閱詳細核數報告，請電郵至 info@hkscda.com。
        </p>
      </div>
    </main>
  )
}
