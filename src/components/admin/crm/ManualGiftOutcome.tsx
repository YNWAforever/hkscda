import { Button } from "../../ui/button";
export type GiftDeliveryStatus =
  | "pending"
  | "processing"
  | "retryable"
  | "attention_required"
  | "complete"
  | "not_required";
export function ManualGiftOutcome({
  language,
  donationId,
  deliveryStatus,
  retrying,
  error,
  onRetry,
  onDone,
}: {
  language: "zh" | "en";
  donationId: string;
  deliveryStatus: GiftDeliveryStatus;
  retrying: boolean;
  error?: string;
  onRetry: () => void;
  onDone: () => void;
}) {
  const zh = language === "zh";
  const finished = deliveryStatus === "complete" || deliveryStatus === "not_required";
  return (
    <div className="grid gap-4" role="status">
      <p className="font-semibold">{zh ? "捐款已儲存" : "Gift recorded"}</p>
      <p className="text-sm">
        {zh ? "參考編號：" : "Reference: "}
        {donationId}
      </p>
      <p className="text-sm">
        {deliveryStatus === "complete"
          ? zh
            ? "收據處理完成，電郵服務已接納確認電郵。"
            : "Receipt processing is complete and the email provider accepted the acknowledgement."
          : deliveryStatus === "not_required"
            ? zh
              ? "付款仍待確認，現階段不會發出收據及確認電郵。"
              : "Payment is pending; receipt and acknowledgement are not due yet."
            : zh
              ? "收據或確認電郵尚待完成。您可重試，不會新增捐款。"
              : "Receipt or acknowledgement is pending. Retrying will not create another gift."}
      </p>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {error}
        </p>
      )}
      {!finished && (
        <Button type="button" disabled={retrying} onClick={onRetry}>
          {zh ? "重試收據及確認電郵" : "Retry receipt and acknowledgement"}
        </Button>
      )}
      <Button type="button" variant="outline" disabled={retrying} onClick={onDone}>
        {zh ? "完成" : "Done"}
      </Button>
    </div>
  );
}
