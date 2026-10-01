import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

type ReconcileDialogProps = {
  paymentId: string;
  supporterName: string;
  amountLabel: string;
  onReconciled: () => void;
};

export function ReconcileDialog({
  paymentId,
  supporterName,
  amountLabel,
  onReconciled,
}: ReconcileDialogProps) {
  const [open, setOpen] = useState(false);
  const [bankReference, setBankReference] = useState("");
  const [deliveryWarning, setDeliveryWarning] = useState("");
  const [deliveryJobId, setDeliveryJobId] = useState<string | null>(null);

  const trimmed = bankReference.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 120;

  const mutation = useMutation({
    mutationFn: () =>
      fetchAdminJson<{ kind: string; deliveryJobId: string; deliveryStatus: string }>(
        `/api/admin/payments/${paymentId}/reconcile`,
        {
          method: "POST",
          body: JSON.stringify({ bankReference: trimmed }),
        },
      ),
    onSuccess: (result) => {
      setBankReference("");
      if (result.deliveryStatus === "complete") {
        setOpen(false);
        onReconciled();
      } else {
        setDeliveryJobId(result.deliveryJobId);
        setDeliveryWarning(
          "收款及稽核已記錄；收條或電郵工作尚未完成。可重試或到待處理工作檢查，不要再次入帳。",
        );
      }
    },
  });
  const retryDelivery = useMutation({
    mutationFn: () =>
      fetchAdminJson<{ deliveryStatus: string }>(
        `/api/admin/donations/delivery/${deliveryJobId}/retry`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      if (result.deliveryStatus === "complete") {
        setOpen(false);
        onReconciled();
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || mutation.isPending || deliveryJobId) return;
    mutation.mutate();
  }

  function closeDialog() {
    if (deliveryJobId) onReconciled();
    setOpen(false);
    mutation.reset();
    retryDelivery.reset();
    setBankReference("");
    setDeliveryWarning("");
    setDeliveryJobId(null);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : closeDialog())}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <CheckCircle2 className="h-4 w-4" />
          標記已收款
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>標記已收款</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <p className="text-sm text-[var(--color-text-muted)]">
            {supporterName} · {amountLabel}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="reconcile-bank-reference">銀行 / PayMe / FPS 參考編號</Label>
            <Input
              id="reconcile-bank-reference"
              value={bankReference}
              onChange={(event) => setBankReference(event.target.value)}
              placeholder="例如 FPS-20260630-001"
              autoFocus
            />
          </div>
          {mutation.error && (
            <p className="text-sm text-[var(--color-error)]">{mutation.error.message}</p>
          )}
          {deliveryWarning && (
            <p role="alert" className="text-sm text-[var(--color-error)]">
              {deliveryWarning}
            </p>
          )}
          {retryDelivery.error && (
            <p role="alert" className="text-sm text-[var(--color-error)]">
              {retryDelivery.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeDialog}>
              {deliveryJobId ? "關閉" : "取消"}
            </Button>
            {deliveryJobId && (
              <Button
                type="button"
                variant="outline"
                disabled={retryDelivery.isPending}
                onClick={() => retryDelivery.mutate()}
              >
                {retryDelivery.isPending ? "處理中…" : "重試收條及電郵"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={!canSubmit || mutation.isPending || Boolean(deliveryJobId)}
            >
              {mutation.isPending ? "處理中…" : "確認收款"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
