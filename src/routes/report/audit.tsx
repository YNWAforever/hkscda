import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, FileText } from "lucide-react";
import { ReportHeader } from "@/components/site/ReportHeader";
import { loadPublishedAnnualReports } from "@/lib/documents/public.server";
import type { AnnualReport } from "@/lib/documents/types";
import { datasetSchema, renderJsonLd } from "@/lib/schema";

const pageTitle = "年度報告 Annual Report";
const pageDescription = "我們每年發表協會年度報告電子書，分享救援成果與資金運用摘要。";

export const Route = createFileRoute("/report/audit")({
  loader: loadPublishedAnnualReports,
  errorComponent: AnnualReportLoadError,
  head: () => ({
    meta: [
      { title: `${pageTitle} · 香港拯救貓狗協會 HKSCDA` },
      { name: "description", content: pageDescription },
      { property: "og:title", content: `${pageTitle} · HKSCDA` },
      { property: "og:description", content: pageDescription },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/report/audit" }],
  }),
  component: AnnualReportRoute,
});

function AnnualReportRoute() {
  return <AnnualReportPage reports={Route.useLoaderData()} />;
}

export function AnnualReportPage({ reports }: { reports: AnnualReport[] }) {
  const availableReports = reports.filter((report) => report.document.fileUrl !== null);
  const schema = datasetSchema("HKSCDA 年度報告", pageDescription);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      {renderJsonLd(schema)}

      <nav className="mb-2 text-sm text-[var(--color-text-muted)]" aria-label="麵包屑導航">
        <Link to="/" className="transition-colors hover:text-[var(--color-primary)]">
          主頁
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--color-text)]">年度報告</span>
      </nav>

      <ReportHeader title={pageTitle} subtitle={pageDescription} />

      {availableReports.length > 0 ? (
        <section aria-label="已發布年度報告" className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {availableReports.map((report) => (
            <article
              key={report.id}
              className="flex min-h-64 flex-col border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            >
              <FileText
                className="h-9 w-9 text-[var(--color-primary)]"
                strokeWidth={1.7}
                aria-hidden="true"
              />
              <p className="mt-6 text-xs font-bold uppercase text-[var(--color-text-muted)]">
                {formatReportYearLabel(report.yearLabel)}
              </p>
              <h2 className="mt-2 text-lg font-bold leading-snug text-[var(--color-text)]">
                {report.title}
              </h2>
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                PDF · {formatFileSize(report.document.byteSize)}
              </p>
              <a
                aria-label={`查看 ${report.title}（在新分頁開啟） / View report in a new tab`}
                href={report.document.fileUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-auto min-h-11 w-full"
              >
                查看報告 / View Report
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </article>
          ))}
        </section>
      ) : (
        <section className="border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-6">
          <h2 className="text-lg font-bold">年度報告暫時未能提供</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
            如需查詢，請電郵至{" "}
            <a
              className="font-medium text-[var(--color-primary)] underline"
              href="mailto:info@hkscda.com"
            >
              info@hkscda.com
            </a>
            。
          </p>
        </section>
      )}
    </main>
  );
}

export function AnnualReportLoadError() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div
        role="alert"
        className="border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-6"
      >
        <h1 className="text-lg font-bold">暫時未能載入年度報告</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          請稍後再試，或電郵至{" "}
          <a className="underline" href="mailto:info@hkscda.com">
            info@hkscda.com
          </a>
          。
        </p>
        <a href="/report/audit" className="btn-secondary mt-5 min-h-11">
          重新載入 / Retry
        </a>
      </div>
    </main>
  );
}

function formatReportYearLabel(yearLabel: string) {
  const match = /^(\d{4})[-/](\d{2}|\d{4})$/.exec(yearLabel.trim());
  if (!match) return yearLabel;

  const [, startYear, endYear] = match;
  const shortEndYear = endYear.length === 4 ? endYear.slice(2) : endYear;
  return `${startYear}–${shortEndYear}`;
}

function formatFileSize(byteSize: number) {
  if (byteSize < 1024 * 1024) {
    return `${Math.max(1, Math.round(byteSize / 1024))} KB`;
  }
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}
