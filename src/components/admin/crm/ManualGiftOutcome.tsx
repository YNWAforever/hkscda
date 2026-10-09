import { adminErrorMessage } from "../../../lib/admin/session";
import { Button } from "../../ui/button";
import type { AdminLanguage } from "../i18n/copy";
import { pickAdminCopy } from "../i18n/copy";
import { manualGiftOutcomeCopy } from "./formCopy";
import { donationDeliveryActionCopy } from "./profileCopy";

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
  language: AdminLanguage;
  donationId: string;
  deliveryStatus: GiftDeliveryStatus;
  retrying: boolean;
  /** The error from the last retry, if any; its text is written in `language` when shown. */
  error?: unknown;
  onRetry: () => void;
  onDone: () => void;
}) {
  const copy = pickAdminCopy(manualGiftOutcomeCopy, language);
  const retryLabel = pickAdminCopy(donationDeliveryActionCopy, language).retry;
  const finished = deliveryStatus === "complete" || deliveryStatus === "not_required";
  const errorText = error ? adminErrorMessage(error, language) : null;
  return (
    <div className="grid gap-4" role="status">
      <p className="font-semibold">{copy.recorded}</p>
      <p className="text-sm">{copy.reference(donationId)}</p>
      <p className="text-sm">
        {deliveryStatus === "complete"
          ? copy.complete
          : deliveryStatus === "not_required"
            ? copy.notRequired
            : copy.pending}
      </p>
      {errorText && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {errorText}
        </p>
      )}
      {!finished && (
        <Button type="button" disabled={retrying} onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
      <Button type="button" variant="outline" disabled={retrying} onClick={onDone}>
        {copy.done}
      </Button>
    </div>
  );
}
