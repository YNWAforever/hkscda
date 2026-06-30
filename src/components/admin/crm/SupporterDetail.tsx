import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileCheck, FileX, Mail, Phone } from "lucide-react";

import type {
  DonationHistoryRow,
  SupporterDetail as SupporterDetailData,
} from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { formatAdminNumber, useAdminPageCopy } from "../adminPageCopy";
import { ConsentEditor } from "./ConsentEditor";
import { fetchAdminJson } from "./api";
import { ManualDonationDialog } from "./ManualDonationDialog";
import { SupporterFormDialog } from "./SupporterFormDialog";
import { SupporterTimeline } from "./SupporterTimeline";

type SupporterDetailProps = {
  supporterId: string;
};

const SUPPORTER_DETAIL_COPY = {
  zh: {
    loading: "載入捐款人中...",
    loadError: "無法載入捐款人。",
    back: "捐款人",
    lifetime: "累計捐款",
    donationsCount: "捐款",
    receiptsCount: "收據",
    pendingPayments: "待處理付款",
    donations: "捐款",
    donationsSubtitle: "捐款紀錄及收據操作。",
    noDonations: "尚未有捐款。",
    receiptRequested: "需要收據",
    issueReceipt: "發出收據",
    receipts: "收據",
    receiptsSubtitle: "已發出及已作廢的收據紀錄。",
    noReceipts: "尚未有收據。",
    voidReceipt: "作廢",
    timeline: "時間軸",
    timelineSubtitle: "最新活動排最前。",
    purposes: {
      general: "一般捐款",
      medical: "醫療",
      sponsor: "助養",
    },
    methods: {
      manual: "手動",
      fps: "轉數快",
      payme: "PayMe",
      stripe: "Stripe",
    },
    statuses: {
      pending: "待處理",
      succeeded: "成功",
      failed: "失敗",
      issued: "已發出",
      voided: "已作廢",
    },
    roles: {
      donor: "捐款人",
      supporter: "支持者",
      adopter: "領養人",
      volunteer: "義工",
    },
  },
  en: {
    loading: "Loading supporter...",
    loadError: "Could not load supporter.",
    back: "Supporters",
    lifetime: "Lifetime",
    donationsCount: "Donations",
    receiptsCount: "Receipts",
    pendingPayments: "Pending payments",
    donations: "Donations",
    donationsSubtitle: "Gift history and receipt actions.",
    noDonations: "No donations yet.",
    receiptRequested: "receipt requested",
    issueReceipt: "Issue receipt",
    receipts: "Receipts",
    receiptsSubtitle: "Issued and voided receipt records.",
    noReceipts: "No receipts yet.",
    voidReceipt: "Void",
    timeline: "Timeline",
    timelineSubtitle: "Newest activity first.",
    purposes: {
      general: "General",
      medical: "Medical",
      sponsor: "Sponsor",
    },
    methods: {
      manual: "Manual",
      fps: "FPS",
      payme: "PayMe",
      stripe: "Stripe",
    },
    statuses: {
      pending: "Pending",
      succeeded: "Succeeded",
      failed: "Failed",
      issued: "Issued",
      voided: "Voided",
    },
    roles: {
      donor: "Donor",
      supporter: "Supporter",
      adopter: "Adopter",
      volunteer: "Volunteer",
    },
  },
} as const;

function formatHkd(amountCents: number, language: keyof typeof SUPPORTER_DETAIL_COPY) {
  return new Intl.NumberFormat(language === "zh" ? "zh-HK" : "en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

function formatDate(value: string | null, language: keyof typeof SUPPORTER_DETAIL_COPY) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-HK" : "en-HK", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function labelFromMap(value: string, labels: Record<string, string>) {
  return labels[value] ?? value;
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
  const { language } = useAdminPageCopy();
  const copy = SUPPORTER_DETAIL_COPY[language];
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
    return <div className="p-6 text-sm text-[var(--color-text-muted)]">{copy.loading}</div>;
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-destructive)]">
          {copy.loadError}
        </div>
      </div>
    );
  }

  const pendingPayments = data.payments.filter((payment) => payment.status === "pending").length;
  const summary = [
    [copy.lifetime, formatHkd(data.lifetimeAmountCents, language)],
    [copy.donationsCount, formatAdminNumber(data.donationCount, language)],
    [copy.receiptsCount, formatAdminNumber(data.receipts.length, language)],
    [copy.pendingPayments, formatAdminNumber(pendingPayments, language)],
  ];
  const purposeLabels = copy.purposes as Record<string, string>;
  const methodLabels = copy.methods as Record<string, string>;
  const statusLabels = copy.statuses as Record<string, string>;
  const roleLabels = copy.roles as Record<string, string>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="min-h-[44px] sm:min-h-0">
          <Link to="/admin/supporters">
            <ArrowLeft className="h-4 w-4" />
            {copy.back}
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
                {labelFromMap(role, roleLabels)}
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
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">{copy.donations}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.donationsSubtitle}</p>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {data.donations.length === 0 && (
            <p className="py-5 text-sm text-[var(--color-text-muted)]">{copy.noDonations}</p>
          )}
          {data.donations.map((donation) => (
            <div
              key={donation.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <div className="font-medium text-[var(--color-panel)]">
                  {formatHkd(donation.amountCents, language)} ·{" "}
                  {labelFromMap(donation.purpose, purposeLabels)}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {labelFromMap(donation.method, methodLabels)} ·{" "}
                  {labelFromMap(donation.status, statusLabels)} ·{" "}
                  {formatDate(donation.createdAt, language)}
                  {donation.receiptRequested ? ` · ${copy.receiptRequested}` : ""}
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
                  {copy.issueReceipt}
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
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">{copy.receipts}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.receiptsSubtitle}</p>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {data.receipts.length === 0 && (
            <p className="py-5 text-sm text-[var(--color-text-muted)]">{copy.noReceipts}</p>
          )}
          {data.receipts.map((receipt) => (
            <div
              key={receipt.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <div className="font-medium text-[var(--color-panel)]">{receipt.receiptNo}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {labelFromMap(receipt.status, statusLabels)} ·{" "}
                  {formatHkd(receipt.totalAmountCents, language)} ·{" "}
                  {formatDate(receipt.issuedAt, language)}
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
                  {copy.voidReceipt}
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
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">{copy.timeline}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.timelineSubtitle}</p>
        </div>
        <SupporterTimeline items={data.timeline} />
      </section>
    </div>
  );
}
