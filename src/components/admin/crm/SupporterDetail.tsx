import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileCheck, FileX } from "lucide-react";

import { adminErrorMessage } from "../../../lib/admin/session";
import type {
  DonationHistoryRow,
  SupporterDetail as SupporterDetailData,
} from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { requiredReasonDialog } from "../confirmActionState";
import { useBreadcrumbRecordName } from "../adminBreadcrumbRecord";
import { useAdminPageCopy } from "../adminPageCopy";
import { DestinationHeading } from "../DestinationHeading";
import { useAdminCopy } from "../i18n/copy";
import { LoadFailure } from "../LoadFailure";
import { ConsentEditor } from "./ConsentEditor";
import { fetchAdminJson } from "./api";
import { crmLabelCopy, supporterDetailCopy } from "./copy";
import { crmFormatCopy } from "./formatCopy";
import { ManualDonationDialog } from "./ManualDonationDialog";
import { DonationDeliveryAction } from "./DonationDeliveryAction";
import { SupporterActivitySummary } from "./SupporterActivitySummary";
import { SupporterFormDialog } from "./SupporterFormDialog";
import { SupporterProfileSidebar } from "./SupporterProfileSidebar";
import {
  filterTimelineItems,
  SupporterTimelineFilters,
  type TimelineFilter,
} from "./supporterTimelineFilters";
import { SupporterTimeline } from "./SupporterTimeline";

type SupporterDetailProps = {
  supporterId: string;
};

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
  const { language, pageCopy } = useAdminPageCopy();
  const copy = useAdminCopy(supporterDetailCopy);
  const labels = useAdminCopy(crmLabelCopy);
  const format = useAdminCopy(crmFormatCopy);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [voidTarget, setVoidTarget] = useState<{ id: string; receiptNo: string } | null>(null);
  const queryClient = useQueryClient();
  const { data, error, isLoading, refetch } = useQuery({
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
    mutationFn: ({ receiptId, reason }: { receiptId: string; reason: string }) =>
      fetchAdminJson(`/api/admin/receipts/${receiptId}/void`, {
        method: "POST",
        body: JSON.stringify({ supporterId, reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] });
    },
  });

  useBreadcrumbRecordName(data?.name);

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <DestinationHeading id="supporters" />
        <p className="text-sm text-[var(--color-text-muted)]">{copy.loading}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-3 p-6">
        <DestinationHeading id="supporters" />
        <LoadFailure error={error} onRetry={() => void refetch()} title={copy.loadError} />
      </div>
    );
  }

  const pendingPayments = data.payments.filter((payment) => payment.status === "pending").length;
  const openFollowups = data.adoption.followups.filter((followup) => !followup.completedAt).length;
  const filteredTimeline = filterTimelineItems(data.timeline, timelineFilter);
  const roleLabels = pageCopy.supporters.roleLabels as Record<string, string>;

  return (
    <div className="space-y-6 p-6">
      {/* required-reason: receipt.void */}
      <ConfirmActionDialog
        open={voidTarget !== null}
        onOpenChange={(open) => {
          if (!open) setVoidTarget(null);
        }}
        title={copy.voidReceipt}
        consequence={copy.confirmVoid(voidTarget?.receiptNo ?? "")}
        confirmLabel={copy.voidReceipt}
        destructive
        reason={requiredReasonDialog}
        onConfirm={async (reason) => {
          if (voidTarget)
            await voidReceiptMutation.mutateAsync({
              receiptId: voidTarget.id,
              reason: reason ?? "",
            });
        }}
      />
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

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <SupporterProfileSidebar supporter={data} language={language} roleLabels={roleLabels} />

        <div className="min-w-0 space-y-6">
          <SupporterActivitySummary
            language={language}
            lifetimeAmountCents={data.lifetimeAmountCents}
            donationCount={data.donationCount}
            receiptCount={data.receipts.length}
            pendingPaymentCount={pendingPayments}
            adoptionCaseCount={data.adoption.cases.length}
            openFollowupCount={openFollowups}
            successfulAdoptionCount={data.adoption.successfulAdoptions.length}
          />

          <ConsentEditor
            supporterId={supporterId}
            emailConsent={data.emailConsent}
            whatsappConsent={data.whatsappConsent}
          />

          <section>
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-panel)]">{copy.timeline}</h2>
                <p className="text-sm text-[var(--color-text-muted)]">{copy.timelineSubtitle}</p>
              </div>
              <SupporterTimelineFilters
                language={language}
                value={timelineFilter}
                onChange={setTimelineFilter}
              />
            </div>
            <SupporterTimeline items={filteredTimeline} />
          </section>

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
                      {format.money(donation.amountCents)}
                      {Boolean(donation.refundedCents) && (
                        <span>
                          {" "}
                          · {copy.refunded} {format.money(donation.refundedCents ?? 0)} ·{" "}
                          {copy.retained}{" "}
                          {format.money(donation.amountCents - (donation.refundedCents ?? 0))}
                        </span>
                      )}{" "}
                      · {labels.purpose(donation.purpose)}
                    </div>
                    {donation.customPurpose ? (
                      <div className="text-xs font-medium text-[var(--color-text-muted)]">
                        {copy.customPurposeLine(donation.customPurpose)}
                      </div>
                    ) : null}
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {labels.method(donation.method)} · {labels.status(donation.status)} ·{" "}
                      {format.date(donation.createdAt)}
                      {donation.receiptRequested ? ` · ${copy.receiptRequested}` : ""}
                    </div>
                  </div>
                  {donation.deliveryJob && (
                    <DonationDeliveryAction
                      supporterId={supporterId}
                      language={language}
                      job={donation.deliveryJob}
                    />
                  )}
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
              <p role="alert" className="mt-3 text-sm text-[var(--color-destructive)]">
                {adminErrorMessage(issueReceiptMutation.error, language)}
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
                      {labels.status(receipt.status)} · {format.money(receipt.totalAmountCents)} ·{" "}
                      {format.date(receipt.issuedAt)}
                    </div>
                  </div>
                  {receipt.status === "issued" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] sm:min-h-0"
                      onClick={() =>
                        setVoidTarget({ id: receipt.id, receiptNo: receipt.receiptNo })
                      }
                      disabled={voidReceiptMutation.isPending}
                    >
                      <FileX className="h-4 w-4" />
                      {copy.voidReceipt}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
