import { createFileRoute, Link } from "@tanstack/react-router";
import { TrendingUp, TrendingDown, Building } from "lucide-react";
import { ReportHeader } from "@/components/site/ReportHeader";
import { StatCard } from "@/components/site/StatCard";
import { AuditChart } from "@/components/site/AuditChart";
import { datasetSchema, renderJsonLd } from "@/lib/schema";

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
      { name: "醫療及藥物", value: 680000, color: "var(--color-primary)" },
      { name: "糧食及物資", value: 420000, color: "var(--color-secondary)" },
      { name: "營運及租金", value: 320000, color: "var(--color-dog)" },
      { name: "外展及教育", value: 130000, color: "var(--color-success)" },
      { name: "其他支出", value: 70000, color: "var(--color-warning)" },
    ],
  },
  surplus: 230000,
};

export const Route = createFileRoute("/report/audit")({
  head: () => ({
    meta: [
      { title: "核數報告 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "香港拯救貓狗協會年度核數報告，公開透明展示協會收入、支出及善款運用情況。慈善牌照91/14493，IRD §88免稅機構。",
      },
      { property: "og:title", content: "核數報告 · HKSCDA" },
      { property: "og:description", content: "協會年度核數報告，公開透明展示收入及支出" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/report/audit" }],
  }),
  component: AuditReportPage,
});

function AuditReportPage() {
  const schema = datasetSchema("HKSCDA 核數報告", "香港拯救貓狗協會年度財務核數報告");
  const { income, expenditure, surplus } = auditData;

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {renderJsonLd(schema)}

      <nav className="text-sm text-[var(--color-text-muted)] mb-2" aria-label="麵包屑導航">
        <Link to="/" className="hover:text-[var(--color-primary)] transition-colors">
          主頁
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--color-text)]">核數報告</span>
      </nav>

      <ReportHeader
        title="核數報告"
        subtitle="透明度是信任的基石，我們對每一位捐款者負責"
        period={auditData.fiscalYear}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          value={`HK$${(income.total / 10000).toFixed(0)}萬`}
          label="總收入"
          icon={TrendingUp}
          color="var(--color-success)"
        />
        <StatCard
          value={`HK$${(expenditure.total / 10000).toFixed(0)}萬`}
          label="總支出"
          icon={TrendingDown}
          color="var(--color-primary)"
        />
        <StatCard
          value={`HK$${(surplus / 10000).toFixed(0)}萬`}
          label="盈餘"
          icon={Building}
          color="var(--color-dog)"
        />
      </div>

      <AuditChart
        title="收入來源"
        data={income.breakdown}
        total={income.total}
        totalLabel="總收入"
      />
      <AuditChart
        title="支出分佈"
        data={expenditure.breakdown}
        total={expenditure.total}
        totalLabel="總支出"
      />

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 text-center space-y-4">
        <h2 className="font-display text-lg font-bold">完整核數報告</h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-[52ch] mx-auto">
          本會為政府認可慈善機構（91/14493）及稅務局 §88 免稅機構。 完整核數報告 PDF 可電郵
          info@hkscda.com 索取查閱。捐款 HK$100 以上可申請退稅收條。
        </p>
        <Link
          to="/donate"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-primary)] text-white font-bold text-sm hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          申請退稅收條
        </Link>
      </div>

      <div className="bg-[var(--color-surface-offset)] border border-[var(--color-border)] rounded-2xl p-6">
        <h2 className="font-display text-lg font-bold mb-4">鳴謝</h2>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          感謝所有捐款者、企業贊助商及義工對本會的持續支持。
          每一分善款均用於動物醫療、糧食及絕育服務。 如欲查閱詳細核數報告，請電郵至
          info@hkscda.com。
        </p>
      </div>
    </main>
  );
}
