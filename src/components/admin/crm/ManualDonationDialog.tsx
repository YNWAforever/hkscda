import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import type {
  DonationPurpose,
  ManualDonationMethod,
  ManualPaymentStatus,
} from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { fetchAdminJson } from "./api";

type ManualDonationDialogProps = {
  supporterId: string;
};

function amountToCents(amountHkd: string) {
  return Math.round(Number(amountHkd) * 100);
}

export function ManualDonationDialog({ supporterId }: ManualDonationDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amountHkd, setAmountHkd] = useState("");
  const [purpose, setPurpose] = useState<DonationPurpose>("general");
  const [method, setMethod] = useState<ManualDonationMethod>("manual");
  const [paymentStatus, setPaymentStatus] = useState<ManualPaymentStatus>("pending");
  const [bankReference, setBankReference] = useState("");
  const [receiptRequested, setReceiptRequested] = useState(true);

  const amountCents = amountToCents(amountHkd);
  const isValidAmount = Number.isFinite(amountCents) && amountCents >= 1000;
  const needsReference = paymentStatus === "succeeded";
  const canSubmit = isValidAmount && (!needsReference || bankReference.trim().length > 0);

  function resetForm() {
    setAmountHkd("");
    setPurpose("general");
    setMethod("manual");
    setPaymentStatus("pending");
    setBankReference("");
    setReceiptRequested(true);
  }

  const mutation = useMutation({
    mutationFn: () =>
      fetchAdminJson("/api/admin/donations/manual", {
        method: "POST",
        body: JSON.stringify({
          supporterId,
          amountCents,
          currency: "HKD",
          purpose,
          method,
          paymentStatus,
          bankReference,
          receiptRequested,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] });
      resetForm();
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
        if (!nextOpen) mutation.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <HandCoins className="h-4 w-4" />
          Manual gift
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual gift</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="manual-donation-amount">Amount HKD</Label>
            <Input
              id="manual-donation-amount"
              value={amountHkd}
              onChange={(event) => setAmountHkd(event.target.value)}
              inputMode="decimal"
              placeholder="100.00"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="manual-donation-purpose">Purpose</Label>
              <Select
                value={purpose}
                onValueChange={(value) => setPurpose(value as DonationPurpose)}
              >
                <SelectTrigger id="manual-donation-purpose" aria-label="Donation purpose">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="medical">Medical</SelectItem>
                  <SelectItem value="sponsor">Sponsor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manual-donation-method">Method</Label>
              <Select
                value={method}
                onValueChange={(value) => setMethod(value as ManualDonationMethod)}
              >
                <SelectTrigger id="manual-donation-method" aria-label="Payment method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="fps">FPS</SelectItem>
                  <SelectItem value="payme">PayMe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="manual-donation-status">Payment status</Label>
              <Select
                value={paymentStatus}
                onValueChange={(value) => setPaymentStatus(value as ManualPaymentStatus)}
              >
                <SelectTrigger id="manual-donation-status" aria-label="Payment status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="succeeded">Succeeded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manual-donation-reference">Bank reference</Label>
              <Input
                id="manual-donation-reference"
                value={bankReference}
                onChange={(event) => setBankReference(event.target.value)}
                placeholder={needsReference ? "Required" : "Optional"}
              />
            </div>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border)] p-3">
            <span className="text-sm font-medium text-[var(--color-panel)]">Receipt requested</span>
            <Switch
              checked={receiptRequested}
              onCheckedChange={setReceiptRequested}
              aria-label="Receipt requested"
            />
          </label>
          {mutation.error && (
            <p className="text-sm text-[var(--color-destructive)]">{mutation.error.message}</p>
          )}
          <Button type="submit" disabled={!canSubmit || mutation.isPending}>
            Save manual gift
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
