import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { SupporterSummary } from "../../../lib/crm/types";
import { Input } from "../../ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
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

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supporter</TableHead>
              <TableHead>Consent</TableHead>
              <TableHead>Lifetime</TableHead>
              <TableHead>Last gift</TableHead>
              <TableHead>Receipts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[var(--color-text-muted)]">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-[var(--color-destructive)]"
                >
                  Could not load supporters
                </TableCell>
              </TableRow>
            )}
            {data?.supporters.length === 0 && !isLoading && !error && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[var(--color-text-muted)]">
                  No supporters found
                </TableCell>
              </TableRow>
            )}
            {data?.supporters.map((supporter) => (
              <TableRow key={supporter.id}>
                <TableCell>
                  <Link
                    to="/admin/supporters/$id"
                    params={{ id: supporter.id }}
                    className="font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    {supporter.name}
                  </Link>
                  <div className="text-xs text-[var(--color-text-muted)]">{supporter.email}</div>
                </TableCell>
                <TableCell className="text-xs">
                  Email {supporter.emailConsent ?? "-"} / WhatsApp{" "}
                  {supporter.whatsappConsent ?? "-"}
                </TableCell>
                <TableCell>{formatHkd(supporter.lifetimeAmountCents)}</TableCell>
                <TableCell>{formatHkd(supporter.lastGiftAmountCents)}</TableCell>
                <TableCell>{supporter.receiptNeeded ? "Needs review" : "Clear"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && (
        <p className="text-xs text-[var(--color-text-muted)]">{data.total} total supporters</p>
      )}
    </div>
  );
}
