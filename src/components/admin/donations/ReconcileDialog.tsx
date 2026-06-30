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

  const trimmed = bankReference.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 120;

  const mutation = useMutation({
    mutationFn: () =>
      fetchAdminJson(`/api/admin/payments/${paymentId}/reconcile`, {
        method: "POST",
        body: JSON.stringify({ bankReference: trimmed }),
      }),
    onSuccess: () => {
      onReconciled();
      setBankReference("");
      setOpen(false);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          mutation.reset();
          setBankReference("");
        }
      }}
    >
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit || mutation.isPending}>
              {mutation.isPending ? "處理中…" : "確認收款"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
