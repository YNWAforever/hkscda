import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { SupporterSummary } from "../../../lib/crm/types";
import { Input } from "../../ui/input";
import { DataTable, type DataTableColumn } from "../DataTable";
import { fetchAdminJson } from "./api";
import { ExportBar } from "./ExportBar";
import { SupporterFormDialog } from "./SupporterFormDialog";

type SupporterListResponse = {
  supporters: SupporterSummary[];
  total: number;
};

function formatHkd(amountCents: number | null) {
  if (amountCents === null) return "-";
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

export function SupporterList() {
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
      header: "Supporter",
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
      header: "Consent",
      cell: (s) => (
        <span className="text-xs">
          Email {s.emailConsent ?? "-"} / WhatsApp {s.whatsappConsent ?? "-"}
        </span>
      ),
    },
    {
      id: "lifetime",
      header: "Lifetime",
      cell: (s) => formatHkd(s.lifetimeAmountCents),
    },
    {
      id: "lastGift",
      header: "Last gift",
      cell: (s) => formatHkd(s.lastGiftAmountCents),
    },
    {
      id: "receipts",
      header: "Receipts",
      cell: (s) => (s.receiptNeeded ? "Needs review" : "Clear"),
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
            {formatHkd(s.lifetimeAmountCents)}
          </div>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          Last gift: {formatHkd(s.lastGiftAmountCents)} · Email {s.emailConsent ?? "-"} / WhatsApp{" "}
          {s.whatsappConsent ?? "-"}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          Receipts: {s.receiptNeeded ? "Needs review" : "Clear"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">Supporters</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Donor records, receipts, consent, and manual gifts.
          </p>
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
          aria-label="Search supporters"
          className="pl-9"
          placeholder="Search name, email, phone, reference, or receipt"
        />
      </label>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-error)]"
        >
          Could not load supporters
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <DataTable<SupporterSummary>
          columns={supporterColumns}
          rows={data?.supporters ?? []}
          getRowKey={(s) => s.id}
          loading={isLoading}
          skeletonRows={5}
          empty="No supporters found"
          renderMobileCard={renderSupporterCard}
        />
      </div>
      {data && (
        <p className="text-xs text-[var(--color-text-muted)]">{data.total} total supporters</p>
      )}
    </div>
  );
}
