import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../ui/button";
import { fetchAdminJson } from "./api";
import type { GiftDeliveryStatus } from "./ManualGiftOutcome";

export function DonationDeliveryAction({
  supporterId,
  job,
  language,
}: {
  supporterId: string;
  job: { id: string; status: Exclude<GiftDeliveryStatus, "not_required"> };
  language: "zh" | "en";
}) {
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
        {language === "zh"
          ? "電郵服務已接納確認電郵"
          : "Acknowledgement accepted by email provider"}
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
        {language === "zh" ? "重試收據及確認電郵" : "Retry receipt and acknowledgement"}
      </Button>
      {status === "attention_required" && (
        <span className="text-xs">
          {language === "zh"
            ? "請先檢查電郵或服務設定"
            : "Check the email or service configuration first"}
        </span>
      )}
      {retry.error && (
        <span role="alert" className="text-xs text-[var(--color-destructive)]">
          {retry.error.message}
        </span>
      )}
    </div>
  );
}
