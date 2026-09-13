import { deliveryLabel } from "../../../lib/notifications/deliveryLabel";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCoordinatorJson } from "../adoptions/api";
import type { PledgeDetail } from "../../../lib/sponsorshipAdmin/types";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { centsToHkd } from "../../../lib/donations/domain";
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
export function FinancePanel({
  pledge,
  onChanged,
}: {
  pledge: PledgeDetail;
  onChanged: () => Promise<void>;
}) {
  const [proofId, setProofId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const refundRetry = useRef<{ fingerprint: string; key: string } | null>(null);
  const [month, setMonth] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const allocationRetry = useRef<{ fingerprint: string; key: string } | null>(null);
  const [allocationId, setAllocationId] = useState("");
  const [error, setError] = useState<string | null>(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能完成操作");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">收款、月份及通知</h3>
      <p className="text-sm">月份分配只分攤已核實的收款，不另計收入。未付款月份只供服務跟進。</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <a className="underline" href={`/admin/supporters/${pledge.supporterId}`}>
          聯絡人收款及收據紀錄
        </a>
        <a className="underline" href="/admin">
          財務核對及收據
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
        建立截至本月的跟進月份
      </Button>
      {(query.isError || error) && <p role="alert">{error ?? "未能載入財務資料"}</p>}
      {pledge.contactSubmission && (
        <div className="space-y-2 rounded border p-3">
          <h4 className="font-medium">提交時的聯絡資料（保留原始版本）</h4>
          <p>
            {pledge.contactSubmission.supporterName} · {pledge.contactSubmission.email} ·{" "}
            {pledge.contactSubmission.phone}
          </p>
          <p className="text-xs">來源：公開助養申請。提交資料不會自行覆寫聯絡人主檔。</p>
          {query.data?.canRefund && (
            <>
              <label>
                核實方法及原因
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <Button
                disabled={busy || reason.trim().length < 5}
                onClick={() => command({ action: "verify_contact", reason })}
              >
                已核實，更新聯絡人主檔
              </Button>
            </>
          )}
        </div>
      )}
      <label className="block">
        已核實付款
        <select
          className="block w-full rounded border p-2"
          value={proofId}
          onChange={(e) => setProofId(e.target.value)}
        >
          <option value="">選擇付款</option>
          {pledge.proofHistory
            .filter((p) => p.reviewStatus === "approved")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.paymentDate} · {centsToHkd(p.amountCents)} ·{" "}
                {p.reference || p.fileName || "人手記錄"}
              </option>
            ))}
        </select>
      </label>
      {selected && (
        <>
          <p className="text-sm">
            {query.data?.sources.some((s) => s.proof_id === proofId)
              ? "已連結單一收款帳項"
              : "歷史收款尚待財務核對，未重入帳"}
            {totalRefunded > 0
              ? ` · 已退款 ${centsToHkd(totalRefunded)} · 實收 ${centsToHkd(refundable)}`
              : ""}
          </p>
          <p className="text-sm">
            收據：
            {query.data?.receipts
              .filter((r) => r.proof_id === proofId)
              .map((r) => `${r.receipt_no}（${r.status === "issued" ? "已簽發" : "已作廢"}）`)
              .join("、") || "未簽發"}
          </p>
          <label className="block">
            調整原因
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="block">
            原月份分配
            <select
              className="block w-full rounded border p-2"
              value={allocationId}
              onChange={(e) => setAllocationId(e.target.value)}
            >
              <option value="">選擇原分配</option>
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
                      {p.periodMonth} · {centsToHkd(a.amountCents)}
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
            新增分配撤銷記錄
          </Button>
          <label className="block">
            重新分配月份
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <label className="block">
            重新分配金額（港元；尚餘 {centsToHkd(remaining)}）
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
            將此金額分配至指定月份
          </Button>
          {query.data?.canRefund && !query.data.sources.some((x) => x.proof_id === proofId) && (
            <div className="space-y-2">
              <label>
                待核對的既有收款
                <select
                  className="block w-full rounded border p-2"
                  value={paymentId}
                  onChange={(e) => setPaymentId(e.target.value)}
                >
                  <option value="">選擇同一聯絡人的既有收款</option>
                  {query.data.candidates
                    .filter((c) => c.amount_cents === selected.amountCents)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.received_at?.slice(0, 10)} · {centsToHkd(c.amount_cents)} ·{" "}
                        {c.bank_reference || "無銀行參考編號"}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                disabled={busy || !paymentId || reason.trim().length < 5}
                onClick={() => command({ action: "reconcile", proofId, paymentId, reason })}
              >
                核對並連結既有收款
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
                記錄助養人已要求收據
              </Button>
            )}
          {query.data?.canRefund && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm">
                記錄已完成的退款（部分或全額）。保留原收款及退款歷史，只撤銷超出剩餘收款的分配，並作廢原收據。
              </p>
              <label className="block">
                已完成退款的銀行參考編號
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
              <label>
                退款金額（港元；可退 {centsToHkd(refundable)}）
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
                記錄已完成退款
              </Button>
            </div>
          )}
        </>
      )}
      <div className="space-y-1 border-t pt-3">
        <h4 className="font-medium">通知跟進</h4>
        {query.data?.deliveries.map((d) => (
          <p className="text-xs" key={d.id}>
            {{
              proof_recorded: "收到付款資料",
              active: "付款已核實",
              refund_recorded: "退款已記錄",
              needs_followup: "付款需跟進",
              cancelled: "承諾已取消",
            }[d.event] ?? "通知"}{" "}
            ·{" "}
            {{
              queued: "等候傳送",
              processing: "處理中",
              sent: "服務商已接收",
              failed: "傳送失敗，可重試",
            }[d.status] ?? "未確認"}{" "}
            · {deliveryLabel(d.delivery_state) ?? "尚無送達證據"} · 嘗試 {d.attempts} 次
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
            } catch (e) {
              setError(e instanceof Error ? e.message : "通知重試失敗");
            } finally {
              setBusy(false);
            }
          }}
        >
          重試待傳送通知
        </Button>
      </div>
    </section>
  );
}
