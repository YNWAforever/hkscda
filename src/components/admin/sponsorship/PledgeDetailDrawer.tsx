import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { fetchCoordinatorJson } from "../adoptions/api";
import { useAdminPageCopy } from "../adminPageCopy";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Sheet, SheetContent, SheetTitle } from "../../ui/sheet";
import { StatusPill } from "../StatusBadge";
import type { PaymentProofRecord, PledgeDetail } from "../../../lib/sponsorshipAdmin/types";
import {
  canCancelPledge,
  canRecordPayment,
  canReviewProof,
  formatDate,
  formatFallback,
  isImageFileType,
  pledgeStatusTone,
  proofHasNoFile,
  validateManualProofFile,
} from "./pledgeReviewLogic";

type PledgeDetailResponse = { pledge: PledgeDetail };

const PAYMENT_METHOD_VALUES = ["fps", "bank_transfer", "payme", "paypal", "give_asia"] as const;

const PROOF_REVIEW_STATUS_TONE: Record<
  PaymentProofRecord["reviewStatus"],
  "warning" | "success" | "danger"
> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

function amountLabel(amountCents: number) {
  const dollars = Math.round(amountCents / 100).toLocaleString("en-US");
  return `HK$${dollars}/月`;
}

type ProofUrlResponse = { url: string; fileName: string };

function ProofPreview({ pledgeId, proof }: { pledgeId: string; proof: PaymentProofRecord }) {
  const { pageCopy } = useAdminPageCopy();
  const copy = pageCopy.pledgeReview.proofPreview;
  const {
    data,
    error,
    isPending,
    mutate: fetchProofUrl,
  } = useMutation<ProofUrlResponse, Error, void>({
    mutationFn: () =>
      fetchCoordinatorJson<ProofUrlResponse>(
        `/api/admin/sponsorships/pledges/${encodeURIComponent(pledgeId)}/proof-url`,
      ),
  });

  if (proofHasNoFile(proof.storagePath)) {
    return <p className="text-sm text-[var(--color-text-muted)]">{copy.noFile}</p>;
  }

  return (
    <div className="space-y-2">
      {!data && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fetchProofUrl()}
          disabled={isPending}
        >
          {isPending ? copy.loading : copy.load}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-xs text-[var(--color-error)]">
          {copy.loadError(error.message)}
        </p>
      )}
      {data &&
        (isImageFileType(proof.fileType) ? (
          <a href={data.url} target="_blank" rel="noopener noreferrer">
            <img
              src={data.url}
              alt={data.fileName}
              className="max-h-64 w-full rounded-md border border-[var(--color-border)] object-contain"
            />
          </a>
        ) : (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            {copy.open(data.fileName)}
          </a>
        ))}
    </div>
  );
}

export function PledgeDetailDrawer({
  pledgeId,
  onClose,
  onChanged,
}: {
  pledgeId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { pageCopy } = useAdminPageCopy();
  const copy = pageCopy.pledgeReview;
  const pledgeStatusLabel: Record<PledgeDetail["status"], string> = copy.statuses;
  const paymentMethodOptions: Array<{
    value: (typeof PAYMENT_METHOD_VALUES)[number];
    label: string;
  }> = PAYMENT_METHOD_VALUES.map((value) => ({ value, label: copy.paymentMethods[value] }));
  const proofReviewStatusLabel: Record<PaymentProofRecord["reviewStatus"], string> =
    copy.proofReviewStatuses;
  const proofSourceLabel: Record<PaymentProofRecord["source"], string> = copy.proofSources;

  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHOD_VALUES)[number]>("fps");
  const [reference, setReference] = useState("");
  const [amountHkd, setAmountHkd] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofFileError, setProofFileError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<PledgeDetailResponse, Error>({
    queryKey: ["sponsorship-pledge", pledgeId],
    queryFn: () =>
      fetchCoordinatorJson<PledgeDetailResponse>(`/api/admin/sponsorships/pledges/${pledgeId}`),
  });

  const pledge = data?.pledge ?? null;

  async function refreshAll() {
    await refetch();
    onChanged();
    queryClient.invalidateQueries({ queryKey: ["sponsorship-pledges"] });
  }

  async function submitReview(decision: "approve" | "reject") {
    setSubmitting(true);
    setActionError(null);
    try {
      await fetchCoordinatorJson(`/api/admin/sponsorships/pledges/${pledgeId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, note: reviewNote || undefined }),
      });
      setReviewNote("");
      await refreshAll();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : copy.errors.review);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCancel() {
    setSubmitting(true);
    setActionError(null);
    try {
      await fetchCoordinatorJson(`/api/admin/sponsorships/pledges/${pledgeId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ note: cancelNote || undefined }),
      });
      setCancelNote("");
      await refreshAll();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : copy.errors.cancel);
    } finally {
      setSubmitting(false);
    }
  }

  function handleProofFileChange(file: File | null) {
    if (!file) {
      setProofFile(null);
      setProofFileError(null);
      return;
    }
    const validationError = validateManualProofFile(file);
    setProofFileError(validationError);
    setProofFile(validationError ? null : file);
  }

  async function submitPayment() {
    setSubmitting(true);
    setActionError(null);
    try {
      const amountCents = Math.round(Number(amountHkd) * 100);
      const formData = new FormData();
      formData.set(
        "payload",
        JSON.stringify({
          paymentMethod,
          reference: reference || undefined,
          amountCents,
          paymentDate,
          note: paymentNote || undefined,
        }),
      );
      if (proofFile) formData.set("file", proofFile);

      await fetchCoordinatorJson(`/api/admin/sponsorships/pledges/${pledgeId}/proof`, {
        method: "POST",
        body: formData,
      });
      setReference("");
      setAmountHkd("");
      setPaymentDate("");
      setPaymentNote("");
      setProofFile(null);
      setProofFileError(null);
      await refreshAll();
    } catch (submitError) {
      setActionError(
        submitError instanceof Error ? submitError.message : copy.errors.recordPayment,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-[var(--color-surface)] p-6 shadow-xl sm:max-w-md"
      >
        <div className="flex items-start justify-between gap-3">
          <SheetTitle className="text-lg font-semibold text-[var(--color-panel)]">
            {copy.detailTitle}
          </SheetTitle>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {copy.close}
          </Button>
        </div>

        {isLoading && (
          <p className="mt-6 text-sm text-[var(--color-text-muted)]">{pageCopy.common.loading}</p>
        )}
        {error && <p className="mt-6 text-sm text-[var(--color-error)]">{error.message}</p>}

        {pledge && (
          <div className="mt-6 space-y-6">
            <section className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-panel)]">
                  {pledge.supporterName}
                </span>
                <StatusPill tone={pledgeStatusTone(pledge.status)}>
                  {pledgeStatusLabel[pledge.status]}
                </StatusPill>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">
                {formatFallback(pledge.supporterEmail)} · {formatFallback(pledge.supporterPhone)}
              </p>
              <p className="text-sm text-[var(--color-panel)]">
                {amountLabel(pledge.amountCents)}（
                {pledge.monthlyTier === "custom" ? copy.customTier : pledge.monthlyTier}）
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {copy.createdOn(formatDate(pledge.createdAt))}
              </p>
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--color-panel)]">
                {copy.preferencesTitle}
              </h3>
              <ul className="space-y-1 text-sm text-[var(--color-text-muted)]">
                {pledge.preferences.map((preference) => (
                  <li key={preference.id}>
                    {preference.rank}. {preference.animalNameSnapshot}
                  </li>
                ))}
              </ul>
            </section>

            {actionError && (
              <p role="alert" className="text-sm text-[var(--color-error)]">
                {actionError}
              </p>
            )}

            {canRecordPayment(pledge.status) && (
              <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
                <h3 className="text-sm font-semibold text-[var(--color-panel)]">
                  {copy.recordPayment.title}
                </h3>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}
                >
                  <SelectTrigger aria-label={copy.recordPayment.methodLabel} className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethodOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor="pledge-reference">{copy.recordPayment.referenceLabel}</Label>
                <Input
                  id="pledge-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
                <Label htmlFor="pledge-amount">{copy.recordPayment.amountLabel}</Label>
                <Input
                  id="pledge-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountHkd}
                  onChange={(event) => setAmountHkd(event.target.value)}
                />
                <Label htmlFor="pledge-payment-date">{copy.recordPayment.dateLabel}</Label>
                <Input
                  id="pledge-payment-date"
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />
                <Label htmlFor="pledge-payment-note">{copy.recordPayment.noteLabel}</Label>
                <Input
                  id="pledge-payment-note"
                  value={paymentNote}
                  onChange={(event) => setPaymentNote(event.target.value)}
                />
                <Label htmlFor="pledge-payment-proof">{copy.recordPayment.proofLabel}</Label>
                <Input
                  id="pledge-payment-proof"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => handleProofFileChange(event.target.files?.[0] ?? null)}
                />
                {proofFileError && (
                  <p role="alert" className="text-xs text-[var(--color-error)]">
                    {proofFileError}
                  </p>
                )}
                <Button
                  type="button"
                  onClick={submitPayment}
                  disabled={submitting || !amountHkd || !paymentDate || !!proofFileError}
                >
                  {copy.recordPayment.save}
                </Button>
              </section>
            )}

            {canReviewProof(pledge.status) && (
              <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
                <h3 className="text-sm font-semibold text-[var(--color-panel)]">
                  {copy.reviewProof.title}
                </h3>
                {pledge.currentProof && (
                  <>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {pledge.currentProof.paymentMethod} ·{" "}
                      {formatFallback(pledge.currentProof.reference)} ·{" "}
                      {amountLabel(pledge.currentProof.amountCents)}
                    </p>
                    <ProofPreview pledgeId={pledgeId} proof={pledge.currentProof} />
                  </>
                )}
                <Label htmlFor="pledge-review-note">{copy.reviewProof.noteLabel}</Label>
                <Input
                  id="pledge-review-note"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => submitReview("approve")}
                    disabled={submitting}
                  >
                    {copy.reviewProof.approve}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => submitReview("reject")}
                    disabled={submitting}
                  >
                    {copy.reviewProof.reject}
                  </Button>
                </div>
              </section>
            )}

            {canCancelPledge(pledge.status) && (
              <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
                <Label htmlFor="pledge-cancel-note">{copy.cancel.noteLabel}</Label>
                <Input
                  id="pledge-cancel-note"
                  value={cancelNote}
                  onChange={(event) => setCancelNote(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={submitCancel}
                  disabled={submitting}
                >
                  {copy.cancel.action}
                </Button>
              </section>
            )}

            {pledge.proofHistory.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-[var(--color-panel)]">
                  {copy.proofHistory.title}
                </h3>
                <ul className="space-y-2">
                  {pledge.proofHistory.map((proof) => {
                    const isCurrent = pledge.currentProof?.id === proof.id;
                    return (
                      <li
                        key={proof.id}
                        className="space-y-1 rounded-lg border border-[var(--color-border)] p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[var(--color-panel)]">
                            {formatDate(proof.createdAt)}
                            {isCurrent && (
                              <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">
                                {copy.proofHistory.current}
                              </span>
                            )}
                          </span>
                          <StatusPill tone={PROOF_REVIEW_STATUS_TONE[proof.reviewStatus]}>
                            {proofReviewStatusLabel[proof.reviewStatus]}
                          </StatusPill>
                        </div>
                        <p className="text-[var(--color-text-muted)]">
                          {proof.paymentMethod} · {formatFallback(proof.reference)} ·{" "}
                          {amountLabel(proof.amountCents)} · {proofSourceLabel[proof.source]}
                        </p>
                        {proof.fileName && (
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {copy.proofHistory.file(proof.fileName)}
                          </p>
                        )}
                        {proof.reviewNote && (
                          <p className="text-xs text-[var(--color-panel)]">
                            {copy.proofHistory.note(proof.reviewNote)}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--color-panel)]">
                {copy.recentActivity}
              </h3>
              <ul className="space-y-1 text-xs text-[var(--color-text-muted)]">
                {pledge.recentAuditLog.map((entry) => (
                  <li key={entry.id}>
                    {formatDate(entry.timestamp)} — {entry.action}
                  </li>
                ))}
              </ul>
              <a
                href={`/admin/supporters/${pledge.supporterId}`}
                className="text-sm text-[var(--color-primary)] hover:underline"
              >
                {copy.viewSupporterTimeline}
              </a>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
