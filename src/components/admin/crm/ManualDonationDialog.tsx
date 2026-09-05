import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { useRef, useState } from "react";
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
import { useAdminPageCopy } from "../adminPageCopy";
import { fetchAdminJson } from "./api";
import { ManualGiftOutcome, type GiftDeliveryStatus } from "./ManualGiftOutcome";

type ManualDonationDialogProps = {
  supporterId: string;
};

function amountToCents(amountHkd: string) {
  return Math.round(Number(amountHkd) * 100);
}

const MANUAL_DONATION_COPY = {
  zh: {
    title: "手動捐款",
    amount: "金額 HKD",
    purpose: "用途",
    purposeAria: "捐款用途",
    method: "方式",
    methodAria: "付款方式",
    paymentStatus: "付款狀態",
    paymentStatusAria: "付款狀態",
    bankReference: "銀行參考編號",
    required: "必填",
    optional: "選填",
    receiptRequested: "需要收據",
    receiptAria: "需要收據",
    save: "儲存手動捐款",
    purposes: {
      general: "一般捐款",
      medical: "醫療",
      sponsor: "助養",
    },
    methods: {
      manual: "手動",
      fps: "轉數快",
      payme: "PayMe",
    },
    statuses: {
      pending: "待處理",
      succeeded: "成功",
    },
  },
  en: {
    title: "Manual gift",
    amount: "Amount HKD",
    purpose: "Purpose",
    purposeAria: "Donation purpose",
    method: "Method",
    methodAria: "Payment method",
    paymentStatus: "Payment status",
    paymentStatusAria: "Payment status",
    bankReference: "Bank reference",
    required: "Required",
    optional: "Optional",
    receiptRequested: "Receipt requested",
    receiptAria: "Receipt requested",
    save: "Save manual gift",
    purposes: {
      general: "General",
      medical: "Medical",
      sponsor: "Sponsor",
    },
    methods: {
      manual: "Manual",
      fps: "FPS",
      payme: "PayMe",
    },
    statuses: {
      pending: "Pending",
      succeeded: "Succeeded",
    },
  },
} as const;

export function ManualDonationDialog({ supporterId }: ManualDonationDialogProps) {
  const { language } = useAdminPageCopy();
  const copy = MANUAL_DONATION_COPY[language];
  const queryClient = useQueryClient();
  const requestId = useRef(crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [recorded, setRecorded] = useState<{
    donationId: string;
    deliveryJobId: string | null;
    deliveryStatus: GiftDeliveryStatus;
  } | null>(null);
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
    requestId.current = crypto.randomUUID();
  }

  const mutation = useMutation({
    mutationFn: () =>
      fetchAdminJson<{
        donationId: string;
        deliveryJobId: string | null;
        deliveryStatus: GiftDeliveryStatus;
      }>("/api/admin/donations/manual", {
        method: "POST",
        body: JSON.stringify({
          requestId: requestId.current,
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
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] });
      setRecorded(result);
    },
  });

  const retry = useMutation({
    mutationFn: () => {
      if (!recorded?.deliveryJobId) throw new Error("No delivery job");
      return fetchAdminJson<{ deliveryStatus: GiftDeliveryStatus }>(
        `/api/admin/donations/delivery/${recorded.deliveryJobId}/retry`,
        { method: "POST" },
      );
    },
    onSuccess: (result) => {
      setRecorded((current) =>
        current ? { ...current, deliveryStatus: result.deliveryStatus } : current,
      );
      queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] });
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
          {copy.title}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        {recorded ? (
          <ManualGiftOutcome
            language={language}
            {...recorded}
            retrying={retry.isPending}
            error={retry.error?.message}
            onRetry={() => retry.mutate()}
            onDone={() => {
              setRecorded(null);
              resetForm();
              mutation.reset();
              retry.reset();
              setOpen(false);
            }}
          />
        ) : (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="manual-donation-amount">{copy.amount}</Label>
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
                <Label htmlFor="manual-donation-purpose">{copy.purpose}</Label>
                <Select
                  value={purpose}
                  onValueChange={(value) => setPurpose(value as DonationPurpose)}
                >
                  <SelectTrigger id="manual-donation-purpose" aria-label={copy.purposeAria}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">{copy.purposes.general}</SelectItem>
                    <SelectItem value="medical">{copy.purposes.medical}</SelectItem>
                    <SelectItem value="sponsor">{copy.purposes.sponsor}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="manual-donation-method">{copy.method}</Label>
                <Select
                  value={method}
                  onValueChange={(value) => setMethod(value as ManualDonationMethod)}
                >
                  <SelectTrigger id="manual-donation-method" aria-label={copy.methodAria}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">{copy.methods.manual}</SelectItem>
                    <SelectItem value="fps">{copy.methods.fps}</SelectItem>
                    <SelectItem value="payme">PayMe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="manual-donation-status">{copy.paymentStatus}</Label>
                <Select
                  value={paymentStatus}
                  onValueChange={(value) => setPaymentStatus(value as ManualPaymentStatus)}
                >
                  <SelectTrigger id="manual-donation-status" aria-label={copy.paymentStatusAria}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{copy.statuses.pending}</SelectItem>
                    <SelectItem value="succeeded">{copy.statuses.succeeded}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="manual-donation-reference">{copy.bankReference}</Label>
                <Input
                  id="manual-donation-reference"
                  value={bankReference}
                  onChange={(event) => setBankReference(event.target.value)}
                  placeholder={needsReference ? copy.required : copy.optional}
                />
              </div>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border)] p-3">
              <span className="text-sm font-medium text-[var(--color-panel)]">
                {copy.receiptRequested}
              </span>
              <Switch
                checked={receiptRequested}
                onCheckedChange={setReceiptRequested}
                aria-label={copy.receiptAria}
              />
            </label>
            {mutation.error && (
              <p className="text-sm text-[var(--color-destructive)]">{mutation.error.message}</p>
            )}
            <Button type="submit" disabled={!canSubmit || mutation.isPending}>
              {copy.save}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
