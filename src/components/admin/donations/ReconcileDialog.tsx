import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import { adminErrorMessage } from "../../../lib/admin/session";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { reconcileDialogCopy } from "./copy";

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
  const copy = useAdminCopy(reconcileDialogCopy);
  const { language } = useAdminLanguage();
  const [open, setOpen] = useState(false);
  const [bankReference, setBankReference] = useState("");
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
    setDeliveryJobId(null);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : closeDialog())}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <CheckCircle2 className="h-4 w-4" />
          {copy.title}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <p className="text-sm text-[var(--color-text-muted)]">
            {supporterName} · {amountLabel}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="reconcile-bank-reference">{copy.referenceLabel}</Label>
            <Input
              id="reconcile-bank-reference"
              value={bankReference}
              onChange={(event) => setBankReference(event.target.value)}
              placeholder={copy.referencePlaceholder}
              autoFocus
            />
          </div>
          {mutation.error && (
            <p className="text-sm text-[var(--color-error)]">
              {adminErrorMessage(mutation.error, language)}
            </p>
          )}
          {deliveryJobId && (
            <p role="alert" className="text-sm text-[var(--color-error)]">
              {copy.deliveryWarning}
            </p>
          )}
          {retryDelivery.error && (
            <p role="alert" className="text-sm text-[var(--color-error)]">
              {adminErrorMessage(retryDelivery.error, language)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeDialog}>
              {deliveryJobId ? copy.close : copy.cancel}
            </Button>
            {deliveryJobId && (
              <Button
                type="button"
                variant="outline"
                disabled={retryDelivery.isPending}
                onClick={() => retryDelivery.mutate()}
              >
                {retryDelivery.isPending ? copy.processing : copy.retry}
              </Button>
            )}
            <Button
              type="submit"
              disabled={!canSubmit || mutation.isPending || Boolean(deliveryJobId)}
            >
              {mutation.isPending ? copy.processing : copy.confirm}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
