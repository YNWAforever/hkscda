import { deliveryLabel } from "../../../lib/notifications/deliveryLabel";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCoordinatorJson } from "../adoptions/api";
import { adminErrorMessage } from "../../../lib/admin/session";
import type { PledgeDetail } from "../../../lib/sponsorshipAdmin/types";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { LoadFailure } from "../LoadFailure";
import { financeCopy } from "./financeCopy";
import { sponsorshipFormatCopy } from "./formatCopy";
type FinanceData = {
  canRefund: boolean;
  receipts: Array<{ proof_id: string; receipt_no: string; status: string }>;
  canCoordinate: boolean;
  candidates: Array<{
    id: string;
    amount_cents: number;
    bank_reference: string | null;
    received_at: string | null;
  }>;
  sources: Array<{ proof_id: string; payment_id: string; donation_id: string; source: string }>;
  refunds: Array<{ proof_id: string; amount_cents: number; reason: string }>;
  deliveries: Array<{
    id: string;
    event: string;
    status: string;
    attempts: number;
    last_error: string | null;
    delivery_state?: string | null;
  }>;
};

/**
 * Why the panel shows an error. It is kept as a code (the key of `copy.errors`), with the caught
 * error where the server may have given a reason, and written when the panel renders.
 */
type PanelError = { code: "command_failed" | "retry_failed"; cause?: unknown };

export function FinancePanel({
  pledge,
  onChanged,
  initialProofId = "",
}: {
  pledge: PledgeDetail;
  onChanged: () => Promise<void>;
  /** The payment that starts selected. The drawer leaves it empty; a test sets it. */
  initialProofId?: string;
}) {
  const copy = useAdminCopy(financeCopy);
  const format = useAdminCopy(sponsorshipFormatCopy);
  const { language } = useAdminLanguage();
  const [proofId, setProofId] = useState(initialProofId);
  const [paymentId, setPaymentId] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const refundRetry = useRef<{ fingerprint: string; key: string } | null>(null);
  const [month, setMonth] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const allocationRetry = useRef<{ fingerprint: string; key: string } | null>(null);
  const [allocationId, setAllocationId] = useState("");
  const [error, setError] = useState<PanelError | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/admin/sponsorships/pledges/${pledge.id}/finance`;
  const query = useQuery({
    queryKey: ["sponsorship-finance", pledge.id, pledge.updatedAt],
    queryFn: () => fetchCoordinatorJson<FinanceData>(endpoint),
  });
  const selected = pledge.proofHistory.find((p) => p.id === proofId);
  const net = pledge.periods
    .flatMap((p) => p.allocations)
    .filter((a) => a.proofId === proofId)
    .reduce((sum, a) => sum + a.amountCents, 0);
  const totalRefunded =
    query.data?.refunds
      .filter((r) => r.proof_id === proofId)
      .reduce((sum, r) => sum + r.amount_cents, 0) ?? 0;
  const remaining = (selected?.amountCents ?? 0) - totalRefunded - net;
  const refundable = (selected?.amountCents ?? 0) - totalRefunded;
  const refunded = refundable <= 0;
  async function command(input: unknown) {
    setBusy(true);
    setError(null);
    try {
      await fetchCoordinatorJson(endpoint, { method: "POST", body: JSON.stringify(input) });
      await query.refetch();
      await onChanged();
    } catch (cause) {
      setError({ code: "command_failed", cause });
    } finally {
      setBusy(false);
    }
  }
  // A reason the caught error gave is shown as it came; otherwise the message for the code.
  const errorMessage = error
    ? (adminErrorMessage(error.cause, language) ?? copy.errors[error.code])
    : null;
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">{copy.heading}</h3>
      <p className="text-sm">{copy.intro}</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <a className="underline" href={`/admin/supporters/${pledge.supporterId}`}>
          {copy.supporterRecords}
        </a>
        <a className="underline" href="/admin">
          {copy.reconcileLink}
        </a>
      </div>
      <Button
        disabled={
          !query.data?.canCoordinate ||
          busy ||
          !["active", "needs_followup"].includes(pledge.status)
        }
        onClick={() => command({ action: "open_months" })}
      >
        {copy.openMonths}
      </Button>
      {query.isError && (
        <LoadFailure
          error={query.error}
          onRetry={() => void query.refetch()}
          title={copy.loadFailed}
        />
      )}
      {error && <p role="alert">{errorMessage ?? copy.loadFailed}</p>}
      {pledge.contactSubmission && (
        <div className="space-y-2 rounded border p-3">
          <h4 className="font-medium">{copy.submitted.heading}</h4>
          <p>
            {pledge.contactSubmission.supporterName} · {pledge.contactSubmission.email} ·{" "}
            {pledge.contactSubmission.phone}
          </p>
          <p className="text-xs">{copy.submitted.note}</p>
          {query.data?.canRefund && (
            <>
              <label>
                {copy.submitted.reasonLabel}
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <Button
                disabled={busy || reason.trim().length < 5}
                onClick={() => command({ action: "verify_contact", reason })}
              >
                {copy.submitted.verify}
              </Button>
            </>
          )}
        </div>
      )}
      <label className="block">
        {copy.verifiedPayments}
        <select
          className="block w-full rounded border p-2"
          value={proofId}
          onChange={(e) => setProofId(e.target.value)}
        >
          <option value="">{copy.choosePayment}</option>
          {pledge.proofHistory
            .filter((p) => p.reviewStatus === "approved")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {format.day(p.paymentDate)} · {format.money(p.amountCents)} ·{" "}
                {p.reference || p.fileName || copy.manualRecord}
              </option>
            ))}
        </select>
      </label>
      {selected && (
        <>
          <p className="text-sm">
            {query.data?.sources.some((s) => s.proof_id === proofId) ? copy.linked : copy.notLinked}
            {totalRefunded > 0
              ? copy.refundedLine(format.money(totalRefunded), format.money(refundable))
              : ""}
          </p>
          <p className="text-sm">
            {copy.receiptsLine(
              (query.data?.receipts ?? [])
                .filter((r) => r.proof_id === proofId)
                .map((r) => ({ number: r.receipt_no, issued: r.status === "issued" })),
            )}
          </p>
          <label className="block">
            {copy.adjustmentReason}
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="block">
            {copy.originalAllocation}
            <select
              className="block w-full rounded border p-2"
              value={allocationId}
              onChange={(e) => setAllocationId(e.target.value)}
            >
              <option value="">{copy.chooseAllocation}</option>
              {pledge.periods.flatMap((p) =>
                p.allocations
                  .filter(
                    (a) =>
                      a.proofId === proofId &&
                      a.amountCents > 0 &&
                      !p.allocations.some((r) => r.reversesAllocationId === a.id),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {format.periodStart(p.periodMonth)} · {format.money(a.amountCents)}
                    </option>
                  )),
              )}
            </select>
          </label>
          <Button
            disabled={
              !query.data?.canRefund ||
              busy ||
              !allocationId ||
              reason.trim().length < 5 ||
              refunded
            }
            onClick={() => command({ action: "reverse", allocationId, reason })}
          >
            {copy.reverse}
          </Button>
          <label className="block">
            {copy.reallocateMonth}
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <label className="block">
            {copy.reallocateAmount(format.money(remaining))}
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={allocationAmount}
              onChange={(e) => setAllocationAmount(e.target.value)}
            />
          </label>
          <Button
            disabled={
              !query.data?.canRefund ||
              busy ||
              !month ||
              remaining <= 0 ||
              reason.trim().length < 5 ||
              Number(allocationAmount) <= 0
            }
            onClick={() => {
              const input = {
                action: "allocate",
                proofId,
                periodMonth: month + "-01",
                amountCents: Math.round(Number(allocationAmount) * 100),
                expectedNet: net,
                reason,
              };
              const fingerprint = JSON.stringify(input);
              if (allocationRetry.current?.fingerprint !== fingerprint)
                allocationRetry.current = { fingerprint, key: crypto.randomUUID() };
              return command({ ...input, idempotencyKey: allocationRetry.current.key });
            }}
          >
            {copy.reallocate}
          </Button>
          {query.data?.canRefund && !query.data.sources.some((x) => x.proof_id === proofId) && (
            <div className="space-y-2">
              <label>
                {copy.existingPayment}
                <select
                  className="block w-full rounded border p-2"
                  value={paymentId}
                  onChange={(e) => setPaymentId(e.target.value)}
                >
                  <option value="">{copy.chooseExistingPayment}</option>
                  {query.data.candidates
                    .filter((c) => c.amount_cents === selected.amountCents)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {format.isoDay(c.received_at)} · {format.money(c.amount_cents)} ·{" "}
                        {c.bank_reference || copy.noBankReference}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                disabled={busy || !paymentId || reason.trim().length < 5}
                onClick={() => command({ action: "reconcile", proofId, paymentId, reason })}
              >
                {copy.reconcile}
              </Button>
            </div>
          )}
          {query.data?.canRefund &&
            query.data.sources.some((x) => x.proof_id === proofId) &&
            !refunded && (
              <Button
                disabled={busy}
                onClick={() => command({ action: "receipt_requested", proofId, requested: true })}
              >
                {copy.receiptRequested}
              </Button>
            )}
          {query.data?.canRefund && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm">{copy.refundNote}</p>
              <label className="block">
                {copy.refundReference}
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
              <label>
                {copy.refundAmount(format.money(refundable))}
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
              </label>
              <Button
                disabled={
                  busy ||
                  refunded ||
                  reason.trim().length < 5 ||
                  reference.trim().length < 3 ||
                  Number(refundAmount) <= 0 ||
                  Math.round(Number(refundAmount) * 100) > refundable ||
                  !query.data.sources.some((s) => s.proof_id === proofId)
                }
                onClick={() => {
                  const input = {
                    action: "refund",
                    proofId,
                    expectedRevision: selected.revision,
                    reference,
                    reason,
                    amountCents: Math.round(Number(refundAmount) * 100),
                    expectedRefundedCents: totalRefunded,
                  };
                  const fingerprint = JSON.stringify(input);
                  if (refundRetry.current?.fingerprint !== fingerprint)
                    refundRetry.current = { fingerprint, key: crypto.randomUUID() };
                  return command({ ...input, idempotencyKey: refundRetry.current.key });
                }}
              >
                {copy.recordRefund}
              </Button>
            </div>
          )}
        </>
      )}
      <div className="space-y-1 border-t pt-3">
        <h4 className="font-medium">{copy.notifications}</h4>
        {query.data?.deliveries.map((d) => (
          <p className="text-xs" key={d.id}>
            {copy.deliveryLine(
              copy.deliveryEvent(d.event),
              copy.deliveryStatus(d.status),
              deliveryLabel(d.delivery_state, language) ?? copy.noDeliveryEvidence,
              d.attempts,
            )}
            {d.last_error ? ` · ${d.last_error}` : ""}
          </p>
        ))}
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await fetchCoordinatorJson("/api/admin/sponsorships/deliveries", { method: "POST" });
              await query.refetch();
            } catch (cause) {
              setError({ code: "retry_failed", cause });
            } finally {
              setBusy(false);
            }
          }}
        >
          {copy.retryNotifications}
        </Button>
      </div>
    </section>
  );
}
