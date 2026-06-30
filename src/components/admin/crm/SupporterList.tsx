import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { SupporterSummary } from "../../../lib/crm/types";
import { Input } from "../../ui/input";
import { useAdminPageCopy } from "../adminPageCopy";
import { DataTable, type DataTableColumn } from "../DataTable";
import { fetchAdminJson } from "./api";
import { ExportBar } from "./ExportBar";
import { SupporterFormDialog } from "./SupporterFormDialog";

type SupporterListResponse = {
  supporters: SupporterSummary[];
  total: number;
};

function formatHkd(
  amountCents: number | null,
  language: ReturnType<typeof useAdminPageCopy>["language"],
) {
  if (amountCents === null) return "-";
  return new Intl.NumberFormat(language === "zh" ? "zh-HK" : "en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

export function SupporterList() {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = pageCopy.supporters;
  const [query, setQuery] = useState("");
  const search = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    params.set("role", "donor");
    return params;
  }, [query]);

  const { data, error, isLoading } = useQuery({
    queryKey: ["crm-supporters", search.toString()],
    queryFn: () => fetchAdminJson<SupporterListResponse>(`/api/admin/supporters?${search}`),
  });

  const supporterColumns: DataTableColumn<SupporterSummary>[] = [
    {
      id: "supporter",
      header: copy.columns.supporter,
      cell: (s) => (
        <div>
          <Link
            to="/admin/supporters/$id"
            params={{ id: s.id }}
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            {s.name}
          </Link>
          <div className="text-xs text-[var(--color-text-muted)]">{s.email}</div>
        </div>
      ),
    },
    {
      id: "consent",
      header: copy.columns.consent,
      cell: (s) => (
        <span className="text-xs">
          {copy.email} {s.emailConsent ?? "-"} / {copy.whatsapp} {s.whatsappConsent ?? "-"}
        </span>
      ),
    },
    {
      id: "lifetime",
      header: copy.columns.lifetime,
      cell: (s) => formatHkd(s.lifetimeAmountCents, language),
    },
    {
      id: "lastGift",
      header: copy.columns.lastGift,
      cell: (s) => formatHkd(s.lastGiftAmountCents, language),
    },
    {
      id: "receipts",
      header: copy.columns.receipts,
      cell: (s) => (s.receiptNeeded ? copy.needsReview : copy.clear),
    },
  ];

  function renderSupporterCard(s: SupporterSummary) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              to="/admin/supporters/$id"
              params={{ id: s.id }}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              {s.name}
            </Link>
            <div className="text-xs text-[var(--color-text-muted)]">{s.email}</div>
          </div>
          <div className="text-right text-sm font-medium text-[var(--color-panel)]">
            {formatHkd(s.lifetimeAmountCents, language)}
          </div>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {copy.lastGift}: {formatHkd(s.lastGiftAmountCents, language)} · {copy.email}{" "}
          {s.emailConsent ?? "-"} / {copy.whatsapp} {s.whatsappConsent ?? "-"}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {copy.receipts}: {s.receiptNeeded ? copy.needsReview : copy.clear}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportBar search={search} />
          <SupporterFormDialog mode="create" />
        </div>
      </div>

      <label className="relative block max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={copy.searchLabel}
          className="pl-9"
          placeholder={copy.searchPlaceholder}
        />
      </label>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-error)]"
        >
          {copy.loadError}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <DataTable<SupporterSummary>
          columns={supporterColumns}
          rows={data?.supporters ?? []}
          getRowKey={(s) => s.id}
          loading={isLoading}
          skeletonRows={5}
          empty={copy.empty}
          renderMobileCard={renderSupporterCard}
        />
      </div>
      {data && (
        <p className="text-xs text-[var(--color-text-muted)]">
          {pageCopy.common.totalSupporters(data.total)}
        </p>
      )}
    </div>
  );
}
