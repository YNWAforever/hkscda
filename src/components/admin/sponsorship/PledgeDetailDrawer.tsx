import { AnimalPicker } from "./AnimalPicker";
import { adminIdentityQueryOptions } from "../../../lib/admin/identity";
import { FinancePanel } from "./FinancePanel";
import { ReminderDraftPanel } from "./ReminderDraftPanel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { fetchCoordinatorJson } from "../adoptions/api";
import { useAdminPageCopy } from "../adminPageCopy";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Sheet, SheetContent, SheetTitle } from "../../ui/sheet";
import { StatusPill } from "../StatusBadge";
import { centsToHkd } from "../../../lib/donations/domain";
import type {
  AssignmentEndReason,
  PaymentProofRecord,
  PledgeDetail,
} from "../../../lib/sponsorshipAdmin/types";
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
type FollowupAssigneesResponse = {
  assignees: Array<{ authUserId: string; email: string; role: "staff" | "admin" }>;
};

const PAYMENT_METHOD_VALUES = ["fps", "bank_transfer", "payme", "paypal", "give_asia"] as const;

const ASSIGNMENT_END_REASON_VALUES: readonly AssignmentEndReason[] = [
  "adopted",
  "deceased",
  "ineligible",
  "retired",
  "supporter_request",
  "transferred",
  "other",
];

const PROOF_REVIEW_STATUS_TONE: Record<
  PaymentProofRecord["reviewStatus"],
  "warning" | "success" | "danger"
> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

/**
 * The pledge's monthly commitment — a rate, so it carries /月.
 *
 * `centsToHkd` rather than rounding: section 6.3 requires 123.45 to stay
 * 123.45, and `Math.round(cents / 100)` silently turned HK$123.45 into HK$123.
 */
function monthlyAmountLabel(amountCents: number) {
  return `${centsToHkd(amountCents)}/月`;
}

/**
 * One payment that was received. Deliberately WITHOUT /月: section 6.4 requires
 * that "one-off payments must not show '/month'". A HK$300 payment covering
 * three months is not a HK$300/month sponsorship, and labelling it that way
 * misstates the supporter's commitment.
 */
function paymentAmountLabel(amountCents: number) {
  return centsToHkd(amountCents);
}

/** `2026-08-01` is the month of August, not the 1st — render it as the month. */
function monthLabel(periodMonth: string) {
  return periodMonth.slice(0, 7);
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
        `/api/admin/sponsorships/pledges/${encodeURIComponent(pledgeId)}/proof-url?proofId=${encodeURIComponent(proof.id)}&expectedRevision=${proof.revision}`,
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
  const [followupAssigneeId, setFollowupAssigneeId] = useState("");
  const identity = useQuery(adminIdentityQueryOptions());
  const canMatch = identity.data?.admin.role === "staff" || identity.data?.admin.role === "admin";
  const canFinance =
    identity.data?.admin.role === "treasurer" || identity.data?.admin.role === "admin";
  const reviewRetry = useRef<{ fingerprint: string; key: string } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [assignAnimalId, setAssignAnimalId] = useState("");
  const [endReasonByAssignment, setEndReasonByAssignment] = useState<
    Record<string, AssignmentEndReason>
  >({});
  const [endNoteByAssignment, setEndNoteByAssignment] = useState<Record<string, string>>({});
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
  const { data: followupChoices, error: followupChoicesError } = useQuery<
    FollowupAssigneesResponse,
    Error
  >({
    queryKey: ["sponsorship-followup-assignees"],
    queryFn: () =>
      fetchCoordinatorJson<FollowupAssigneesResponse>("/api/admin/sponsorships/followup-assignees"),
    enabled: Boolean(canMatch && pledge?.status === "needs_followup"),
    staleTime: 60_000,
  });

  async function refreshAll() {
    await refetch();
    onChanged();
    queryClient.invalidateQueries({ queryKey: ["sponsorship-pledges"] });
  }

  async function submitFollowupAssignment() {
    if (!pledge?.followupVersion || !followupAssigneeId) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await fetchCoordinatorJson(
        `/api/admin/sponsorships/pledges/${pledgeId}/followup-assignment`,
        {
          method: "POST",
          body: JSON.stringify({
            assigneeUserId: followupAssigneeId,
            expectedVersion: pledge.followupVersion,
          }),
        },
      );
      setFollowupAssigneeId("");
      await refreshAll();
    } catch {
      setActionError(copy.errors.followup);
      await refetch();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReview(decision: "approve" | "reject") {
    if (!pledge?.currentProof) return;
    const command = {
      decision,
      note: reviewNote || undefined,
      proofId: pledge.currentProof.id,
      expectedRevision: pledge.currentProof.revision,
    };
    const fingerprint = JSON.stringify(command);
    if (reviewRetry.current?.fingerprint !== fingerprint)
      reviewRetry.current = { fingerprint, key: crypto.randomUUID() };
    setSubmitting(true);
    setActionError(null);
    try {
      await fetchCoordinatorJson(`/api/admin/sponsorships/pledges/${pledgeId}/review`, {
        method: "POST",
        body: JSON.stringify({ ...command, idempotencyKey: reviewRetry.current.key }),
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

  async function submitAssign() {
    setSubmitting(true);
    setActionError(null);
    try {
      await fetchCoordinatorJson(`/api/admin/sponsorships/pledges/${pledgeId}/assignments`, {
        method: "POST",
        body: JSON.stringify({ animalId: assignAnimalId }),
      });
      setAssignAnimalId("");
      await refreshAll();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : copy.errors.review);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEndAssignment(assignmentId: string) {
    setSubmitting(true);
    setActionError(null);
    try {
      const reason = endReasonByAssignment[assignmentId] ?? "adopted";
      const note = endNoteByAssignment[assignmentId] ?? "";
      await fetchCoordinatorJson(
        `/api/admin/sponsorships/pledges/${pledgeId}/assignments/${assignmentId}/end`,
        {
          method: "POST",
          body: JSON.stringify({ reason, note: note || undefined }),
        },
      );
      setEndNoteByAssignment((previous) => ({ ...previous, [assignmentId]: "" }));
      await refreshAll();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : copy.errors.review);
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

  const paymentRetry = useRef<{ fingerprint: string; key: string } | null>(null);
  async function submitPayment() {
    setSubmitting(true);
    setActionError(null);
    try {
      const amountCents = Math.round(Number(amountHkd) * 100);
      const fingerprint = JSON.stringify({
        paymentMethod,
        reference,
        amountCents,
        paymentDate,
        paymentNote,
        file: proofFile ? [proofFile.name, proofFile.size, proofFile.lastModified] : null,
      });
      if (paymentRetry.current?.fingerprint !== fingerprint)
        paymentRetry.current = { fingerprint, key: crypto.randomUUID() };
      const formData = new FormData();
      formData.set(
        "payload",
        JSON.stringify({
          idempotencyKey: paymentRetry.current.key,
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
                {monthlyAmountLabel(pledge.amountCents)}（
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

            {canMatch && pledge.status === "needs_followup" && (
              <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
                <h3 className="text-sm font-semibold text-[var(--color-panel)]">
                  {copy.followup.title}
                </h3>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {pledge.followupAssigneeUserId
                    ? copy.followup.currentAssignee(
                        followupChoices?.assignees.find(
                          (item) => item.authUserId === pledge.followupAssigneeUserId,
                        )?.email ?? pledge.followupAssigneeUserId,
                      )
                    : copy.followup.unassigned}
                </p>
                {followupChoicesError || !pledge.followupVersion ? (
                  <p role="alert" className="text-sm text-[var(--color-error)]">
                    {copy.followup.unavailable}
                  </p>
                ) : (
                  <>
                    <Label htmlFor="pledge-followup-assignee">{copy.followup.assigneeLabel}</Label>
                    <Select
                      value={followupAssigneeId || pledge.followupAssigneeUserId || undefined}
                      onValueChange={setFollowupAssigneeId}
                    >
                      <SelectTrigger id="pledge-followup-assignee" className="h-9">
                        <SelectValue placeholder={copy.followup.chooseAssignee} />
                      </SelectTrigger>
                      <SelectContent>
                        {(followupChoices?.assignees ?? []).map((item) => (
                          <SelectItem key={item.authUserId} value={item.authUserId}>
                            {item.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      onClick={submitFollowupAssignment}
                      disabled={
                        submitting ||
                        !followupAssigneeId ||
                        followupAssigneeId === pledge.followupAssigneeUserId ||
                        !pledge.followupVersion
                      }
                    >
                      {copy.followup.assign}
                    </Button>
                  </>
                )}
              </section>
            )}

            {canMatch && <ReminderDraftPanel key={pledge.id} pledgeId={pledge.id} />}

            {canMatch && canRecordPayment(pledge.status) && (
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

            {canFinance && canReviewProof(pledge.proofHistory) && (
              <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
                <h3 className="text-sm font-semibold text-[var(--color-panel)]">
                  {copy.reviewProof.title}
                </h3>
                {pledge.currentProof && (
                  <>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {pledge.currentProof.paymentMethod} ·{" "}
                      {formatFallback(pledge.currentProof.reference)} ·{" "}
                      {paymentAmountLabel(pledge.currentProof.amountCents)}
                    </p>
                    <ProofPreview
                      key={`${pledge.currentProof.id}:${pledge.currentProof.revision}`}
                      pledgeId={pledgeId}
                      proof={pledge.currentProof}
                    />
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

            {canMatch && canCancelPledge(pledge.status) && (
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

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--color-panel)]">
                {copy.assignments.title}
              </h3>
              <ul className="space-y-2">
                {pledge.assignments.map((assignment) => (
                  <li
                    key={assignment.id}
                    className={`space-y-1 rounded-lg border border-[var(--color-border)] p-3 text-sm ${
                      assignment.endedOn ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--color-panel)]">
                        {assignment.animalNameSnapshot}
                      </span>
                      {assignment.reviewReason && (
                        <StatusPill tone="danger">
                          {copy.assignments.reasons[assignment.reviewReason]}
                        </StatusPill>
                      )}
                    </div>
                    <p className="text-[var(--color-text-muted)]">
                      {copy.assignments.started} {assignment.startedOn}
                      {assignment.endedOn && (
                        <>
                          {" · "}
                          {copy.assignments.ended} {assignment.endedOn}
                          {assignment.endReason && (
                            <> · {copy.assignments.reasons[assignment.endReason]}</>
                          )}
                          {assignment.endNote && <> · {assignment.endNote}</>}
                        </>
                      )}
                    </p>
                    {canMatch && !assignment.endedOn && (
                      <div className="flex items-center gap-2">
                        <Select
                          value={endReasonByAssignment[assignment.id] ?? "adopted"}
                          onValueChange={(value) =>
                            setEndReasonByAssignment((previous) => ({
                              ...previous,
                              [assignment.id]: value as AssignmentEndReason,
                            }))
                          }
                        >
                          <SelectTrigger
                            aria-label={copy.assignments.reasonLabel}
                            className="h-9 w-auto"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNMENT_END_REASON_VALUES.map((reason) => (
                              <SelectItem key={reason} value={reason}>
                                {copy.assignments.reasons[reason]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          aria-label={copy.assignments.noteLabel}
                          value={endNoteByAssignment[assignment.id] ?? ""}
                          onChange={(event) =>
                            setEndNoteByAssignment((previous) => ({
                              ...previous,
                              [assignment.id]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => submitEndAssignment(assignment.id)}
                          disabled={submitting}
                        >
                          {copy.assignments.end}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {pledge.needsAnimal && (
                <p className="text-[var(--color-text-muted)]">{copy.assignments.needsAnimal}</p>
              )}
              <div className="flex gap-2">
                <Input
                  value={assignAnimalId}
                  placeholder={copy.assignments.addPlaceholder}
                  onChange={(event) => setAssignAnimalId(event.target.value)}
                />
                <Button
                  type="button"
                  onClick={submitAssign}
                  disabled={!canMatch || submitting || !assignAnimalId}
                >
                  {copy.assignments.add}
                </Button>
              </div>
            </section>

            <FinancePanel pledge={pledge} onChanged={refreshAll} />

            {pledge.periods.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-[var(--color-panel)]">助養月份</h3>
                <ul className="space-y-2">
                  {pledge.periods.map((period) => {
                    const settled = period.outstandingCents === 0;
                    return (
                      <li
                        key={period.id}
                        className="space-y-1 rounded-lg border border-[var(--color-border)] p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[var(--color-panel)]">
                            {monthLabel(period.periodMonth)}
                          </span>
                          <StatusPill tone={settled ? "success" : "warning"}>
                            {settled ? "已付" : "待付"}
                          </StatusPill>
                        </div>
                        <p className="text-[var(--color-text-muted)]">
                          每月意向 {paymentAmountLabel(period.committedCents)} · 已分配{" "}
                          {paymentAmountLabel(period.allocatedCents)}
                          {!settled && (
                            <> · 待跟進 {paymentAmountLabel(period.outstandingCents)}（非債務）</>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
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
                          {paymentAmountLabel(proof.amountCents)} · {proofSourceLabel[proof.source]}
                        </p>
                        {proof.fileName && (
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {copy.proofHistory.file(proof.fileName)}
                          </p>
                        )}
                        <ProofPreview
                          key={`${proof.id}:${proof.revision}`}
                          pledgeId={pledgeId}
                          proof={proof}
                        />
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
