import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminErrorMessage } from "../../../lib/admin/session";
import { Button } from "../../ui/button";
import type { AdminLanguage } from "../i18n/copy";
import { pickAdminCopy } from "../i18n/copy";
import { fetchAdminJson } from "./api";
import type { GiftDeliveryStatus } from "./ManualGiftOutcome";
import { donationDeliveryActionCopy } from "./profileCopy";

export function DonationDeliveryAction({
  supporterId,
  job,
  language,
}: {
  supporterId: string;
  job: { id: string; status: Exclude<GiftDeliveryStatus, "not_required"> };
  language: AdminLanguage;
}) {
  const copy = pickAdminCopy(donationDeliveryActionCopy, language);
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () =>
      fetchAdminJson<{ deliveryStatus: GiftDeliveryStatus }>(
        `/api/admin/donations/delivery/${job.id}/retry`,
        { method: "POST" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] });
    },
  });
  const status =
    job.status === "complete" ? "complete" : (retry.data?.deliveryStatus ?? job.status);
  if (status === "complete")
    return (
      <span className="text-xs" role="status">
        {copy.complete}
      </span>
    );
  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={retry.isPending}
        onClick={() => retry.mutate()}
      >
        {copy.retry}
      </Button>
      {status === "attention_required" && <span className="text-xs">{copy.checkFirst}</span>}
      {retry.error && (
        <span role="alert" className="text-xs text-[var(--color-destructive)]">
          {adminErrorMessage(retry.error, language)}
        </span>
      )}
    </div>
  );
}
