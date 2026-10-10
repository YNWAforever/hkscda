import { adminIdentityQueryOptions } from "../../../lib/admin/identity";
import { FinancePanel } from "./FinancePanel";
import { ReminderDraftPanel } from "./ReminderDraftPanel";
import { sponsorshipReminderFactsKey } from "../../../lib/sponsorshipAdmin/reminderDraft";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { fetchCoordinatorJson } from "../adoptions/api";
import { useAdminPageCopy } from "../adminPageCopy";
import { useAdminCopy } from "../i18n/copy";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Sheet, SheetContent, SheetTitle } from "../../ui/sheet";
import { StatusPill } from "../StatusBadge";
import { adminErrorMessage } from "../../../lib/admin/session";
import type {
  AssignmentEndReason,
  PaymentProofRecord,
  PledgeDetail,
} from "../../../lib/sponsorshipAdmin/types";
import { pledgeDrawerCopy } from "./drawerCopy";
import { sponsorshipFormatCopy } from "./formatCopy";
import {
  actionFailure,
  canCancelPledge,
  canRecordPayment,
  canReviewProof,
  formatFallback,
  isImageFileType,
  pledgeStatusTone,
  proofHasNoFile,
  validateManualProofFile,
  type ActionError,
  type ProofFileProblem,
} from "./pledgeReviewLogic";
import { LoadFailure } from "../LoadFailure";

type PledgeDetailResponse = { pledge: PledgeDetail };
type FollowupAssigneesResponse = {
  assignees: Array<{ authUserId: string; email: string; role: "staff" | "admin" }>;
};

/** The notice shown after an assignment is saved: the key of the page copy's `followup`. */
type FollowupNotice = "saved" | "savedRefreshFailed";

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

type ProofUrlResponse = { url: string; fileName: string };

function ProofPreview({ pledgeId, proof }: { pledgeId: string; proof: PaymentProofRecord }) {
  const { language, pageCopy } = useAdminPageCopy();
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

  // The reason the server gave, as it came, or the translated session error.
  const reason = error ? adminErrorMessage(error, language) : null;

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
      {reason !== null && (
        <p role="alert" className="text-xs text-[var(--color-error)]">
          {copy.loadError(reason)}
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
  const { language, pageCopy } = useAdminPageCopy();
  const copy = pageCopy.pledgeReview;
  const drawer = useAdminCopy(pledgeDrawerCopy);
  const format = useAdminCopy(sponsorshipFormatCopy);
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
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [followupAssigneeId, setFollowupAssigneeId] = useState("");
  const [followupNotice, setFollowupNotice] = useState<FollowupNotice | null>(null);
  const identity = useQuery(adminIdentityQueryOptions());
  const canMatch = identity.data?.admin.role === "staff" || identity.data?.admin.role === "admin";
  const canFinance =
    identity.data?.admin.role === "treasurer" || identity.data?.admin.role === "admin";
  const followupRetry = useRef<{
    pledgeId: string;
    assigneeUserId: string;
    expectedVersion: number;
  } | null>(null);
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
  const [proofFileError, setProofFileError] = useState<ProofFileProblem | null>(null);

  const { data, isLoading, error, refetch } = useQuery<PledgeDetailResponse, Error>({
    queryKey: ["sponsorship-pledge", pledgeId],
    queryFn: () =>
      fetchCoordinatorJson<PledgeDetailResponse>(`/api/admin/sponsorships/pledges/${pledgeId}`),
  });

  const pledge = data?.pledge ?? null;
  const {
    data: followupChoices,
    error: followupChoicesError,
    refetch: refetchFollowupChoices,
  } = useQuery<FollowupAssigneesResponse, Error>({
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
    if (
      followupRetry.current?.pledgeId !== pledgeId ||
      followupRetry.current.assigneeUserId !== followupAssigneeId
    )
      followupRetry.current = {
        pledgeId,
        assigneeUserId: followupAssigneeId,
        expectedVersion: pledge.followupVersion,
      };
    const { assigneeUserId, expectedVersion } = followupRetry.current;
    const attempt = { assigneeUserId, expectedVersion };
    setSubmitting(true);
    setActionError(null);
    setFollowupNotice(null);
    let confirmed = false;
    try {
      try {
        await fetchCoordinatorJson(
          `/api/admin/sponsorships/pledges/${pledgeId}/followup-assignment`,
          { method: "POST", body: JSON.stringify(attempt) },
        );
        confirmed = true;
      } catch {
        // A lost response is not proof that the transaction failed. Reconcile
        // only this frozen owner/version; never silently submit a newer version.
      }
      const refreshed = await refetch().catch(() => null);
      const current = refreshed?.error ? null : refreshed?.data?.pledge;
      if (
        !confirmed &&
        current?.id === pledgeId &&
        current.status === "needs_followup" &&
        current.followupAssigneeUserId === attempt.assigneeUserId &&
        current.followupVersion === attempt.expectedVersion + 1
      )
        confirmed = true;
      if (confirmed) {
        followupRetry.current = null;
        setFollowupAssigneeId("");
        setFollowupNotice(current ? "saved" : "savedRefreshFailed");
        onChanged();
        void queryClient.invalidateQueries({ queryKey: ["sponsorship-pledges"] }).catch(() => {});
      } else {
        const conflict = Boolean(
          current &&
          (current.followupVersion !== attempt.expectedVersion ||
            current.status !== "needs_followup"),
        );
        if (conflict) {
          // A fresh assignment requires an explicit selection after the user
          // sees the current owner. Unknown outcomes retain the original attempt.
          followupRetry.current = null;
          setFollowupAssigneeId("");
        }
        setActionError({ code: conflict ? "followupConflict" : "followupUnknown" });
      }
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
    } catch (cause) {
      setActionError(actionFailure(cause, "review"));
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
    } catch (cause) {
      setActionError(actionFailure(cause, "cancel"));
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
    } catch (cause) {
      setActionError(actionFailure(cause, "assignAnimal"));
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
    } catch (cause) {
      setActionError(actionFailure(cause, "endAssignment"));
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
    } catch (cause) {
      setActionError(actionFailure(cause, "recordPayment"));
    } finally {
      setSubmitting(false);
    }
  }

  // A reason the caught error gave is shown as it came; otherwise the message for the code.
  const actionMessage = actionError
    ? (adminErrorMessage(actionError.cause, language) ?? copy.errors[actionError.code])
    : "";
  // The reason the pledge could not be loaded, as the server gave it.
  const loadReason = error ? adminErrorMessage(error, language) : null; // admin-load-failure-ok: only the heading of the LoadFailure below

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

        {followupNotice && (
          <p role="status" className="mt-4 text-sm">
            {copy.followup[followupNotice]}
          </p>
        )}
        {isLoading && (
          <p className="mt-6 text-sm text-[var(--color-text-muted)]">{pageCopy.common.loading}</p>
        )}
        {error ? (
          <LoadFailure
            error={error}
            onRetry={() => void refetch()}
            title={loadReason === null ? undefined : drawer.loadFailed(loadReason)}
            className="mt-6"
          />
        ) : null}

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
                {drawer.withTier(
                  format.monthly(pledge.amountCents),
                  pledge.monthlyTier === "custom"
                    ? copy.customTier
                    : drawer.tierAmount(pledge.monthlyTier),
                )}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {copy.createdOn(format.date(pledge.createdAt))}
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

            {actionMessage && (
              <p role="alert" className="text-sm text-[var(--color-error)]">
                {actionMessage}
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
                {followupChoicesError ? (
                  <LoadFailure
                    error={followupChoicesError}
                    onRetry={() => void refetchFollowupChoices()}
                    title={copy.followup.unavailable}
                  />
                ) : !pledge.followupVersion ? (
                  <p role="alert" className="text-sm text-[var(--color-error)]">
                    {copy.followup.unavailable}
                  </p>
                ) : (
                  <>
                    <Label htmlFor="pledge-followup-assignee">{copy.followup.assigneeLabel}</Label>
                    <Select
                      disabled={submitting}
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

            {canMatch && (
              <ReminderDraftPanel key={sponsorshipReminderFactsKey(pledge)} pledgeId={pledge.id} />
            )}

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
                    {drawer.proofFileErrors[proofFileError]}
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
                      {drawer.paymentMethodName(pledge.currentProof.paymentMethod)} ·{" "}
                      {formatFallback(pledge.currentProof.reference)} ·{" "}
                      {format.money(pledge.currentProof.amountCents)}
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
                      {copy.assignments.started} {format.day(assignment.startedOn)}
                      {assignment.endedOn && (
                        <>
                          {" · "}
                          {copy.assignments.ended} {format.day(assignment.endedOn)}
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
                <h3 className="text-sm font-semibold text-[var(--color-panel)]">
                  {drawer.periodsTitle}
                </h3>
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
                            {format.month(period.periodMonth)}
                          </span>
                          <StatusPill tone={settled ? "success" : "warning"}>
                            {settled ? drawer.paid : drawer.unpaid}
                          </StatusPill>
                        </div>
                        <p className="text-[var(--color-text-muted)]">
                          {drawer.periodLine(
                            format.money(period.committedCents),
                            format.money(period.allocatedCents),
                            settled ? null : format.money(period.outstandingCents),
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
                            {format.date(proof.createdAt)}
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
                          {drawer.paymentMethodName(proof.paymentMethod)} ·{" "}
                          {formatFallback(proof.reference)} · {format.money(proof.amountCents)} ·{" "}
                          {proofSourceLabel[proof.source]}
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
                    {format.date(entry.timestamp)} — {drawer.auditAction(entry.action)}
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
