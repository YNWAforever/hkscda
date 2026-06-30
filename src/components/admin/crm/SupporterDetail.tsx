import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileCheck, FileX, Mail, Phone } from "lucide-react";

import type {
  DonationHistoryRow,
  SupporterDetail as SupporterDetailData,
} from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { ConsentEditor } from "./ConsentEditor";
import { fetchAdminJson } from "./api";
import { ManualDonationDialog } from "./ManualDonationDialog";
import { SupporterFormDialog } from "./SupporterFormDialog";
import { SupporterTimeline } from "./SupporterTimeline";

type SupporterDetailProps = {
  supporterId: string;
};

function formatHkd(amountCents: number) {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium" }).format(new Date(value));
}

function receiptForDonation(data: SupporterDetailData, donationId: string) {
  return data.receipts.find(
    (receipt) => receipt.status === "issued" && receipt.donationIds.includes(donationId),
  );
}

function canIssueReceipt(data: SupporterDetailData, donation: DonationHistoryRow) {
  return (
    donation.status === "succeeded" &&
    donation.receiptRequested &&
    !receiptForDonation(data, donation.id)
  );
}

export function SupporterDetail({ supporterId }: SupporterDetailProps) {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery({
    queryKey: ["crm-supporter", supporterId],
    queryFn: async () => {
      const response = await fetchAdminJson<{ supporter: SupporterDetailData }>(
        `/api/admin/supporters/${supporterId}`,
      );
      return response.supporter;
    },
  });

  const issueReceiptMutation = useMutation({
    mutationFn: (donationId: string) =>
      fetchAdminJson("/api/admin/receipts", {
        method: "POST",
        body: JSON.stringify({ donationId, supporterId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] });
    },
  });

  const voidReceiptMutation = useMutation({
    mutationFn: (receiptId: string) =>
      fetchAdminJson(`/api/admin/receipts/${receiptId}/void`, {
        method: "POST",
        body: JSON.stringify({ supporterId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] });
    },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-[var(--color-text-muted)]">Loading supporter...</div>;
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-destructive)]">
          Could not load supporter.
        </div>
      </div>
    );
  }

  const pendingPayments = data.payments.filter((payment) => payment.status === "pending").length;
  const summary = [
    ["Lifetime", formatHkd(data.lifetimeAmountCents)],
    ["Donations", String(data.donationCount)],
    ["Receipts", String(data.receipts.length)],
    ["Pending payments", String(pendingPayments)],
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="min-h-[44px] sm:min-h-0">
          <Link to="/admin/supporters">
            <ArrowLeft className="h-4 w-4" />
            Supporters
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <SupporterFormDialog mode="edit" supporter={data} />
          <ManualDonationDialog supporterId={supporterId} />
        </div>
      </div>

      <header className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-panel)]">{data.name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--color-text-muted)]">
              <span className="inline-flex items-center gap-1">
                <Mail className="h-4 w-4" />
                {data.email}
              </span>
              {data.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {data.phone}
                </span>
              )}
              <span>{data.language}</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
            {data.roles.map((role) => (
              <span
                key={role}
                className="rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--color-panel)]"
              >
                {role}
              </span>
            ))}
            {data.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {label}
            </p>
            <p className="mt-2 text-xl font-bold text-[var(--color-panel)]">{value}</p>
          </div>
        ))}
      </section>

      <ConsentEditor
        supporterId={supporterId}
        emailConsent={data.emailConsent}
        whatsappConsent={data.whatsappConsent}
      />

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">Donations</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Gift history and receipt actions.
          </p>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {data.donations.length === 0 && (
            <p className="py-5 text-sm text-[var(--color-text-muted)]">No donations yet.</p>
          )}
          {data.donations.map((donation) => (
            <div
              key={donation.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <div className="font-medium text-[var(--color-panel)]">
                  {formatHkd(donation.amountCents)} · {donation.purpose}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {donation.method} · {donation.status} · {formatDate(donation.createdAt)}
                  {donation.receiptRequested ? " · receipt requested" : ""}
                </div>
              </div>
              {canIssueReceipt(data, donation) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] sm:min-h-0"
                  onClick={() => issueReceiptMutation.mutate(donation.id)}
                  disabled={issueReceiptMutation.isPending}
                >
                  <FileCheck className="h-4 w-4" />
                  Issue receipt
                </Button>
              )}
            </div>
          ))}
        </div>
        {issueReceiptMutation.error && (
          <p className="mt-3 text-sm text-[var(--color-destructive)]">
            {issueReceiptMutation.error.message}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">Receipts</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Issued and voided receipt records.
          </p>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {data.receipts.length === 0 && (
            <p className="py-5 text-sm text-[var(--color-text-muted)]">No receipts yet.</p>
          )}
          {data.receipts.map((receipt) => (
            <div
              key={receipt.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <div className="font-medium text-[var(--color-panel)]">{receipt.receiptNo}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {receipt.status} · {formatHkd(receipt.totalAmountCents)} ·{" "}
                  {formatDate(receipt.issuedAt)}
                </div>
              </div>
              {receipt.status === "issued" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] sm:min-h-0"
                  onClick={() => voidReceiptMutation.mutate(receipt.id)}
                  disabled={voidReceiptMutation.isPending}
                >
                  <FileX className="h-4 w-4" />
                  Void
                </Button>
              )}
            </div>
          ))}
        </div>
        {voidReceiptMutation.error && (
          <p className="mt-3 text-sm text-[var(--color-destructive)]">
            {voidReceiptMutation.error.message}
          </p>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">Timeline</h2>
          <p className="text-sm text-[var(--color-text-muted)]">Newest activity first.</p>
        </div>
        <SupporterTimeline items={data.timeline} />
      </section>
    </div>
  );
}
