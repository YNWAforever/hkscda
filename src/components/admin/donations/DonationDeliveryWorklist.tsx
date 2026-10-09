import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { DeliveryWorklistResult } from "../../../lib/donations/deliveryWorklist";
import { Button } from "../../ui/button";
import { useAdminCopy } from "../i18n/copy";
import { LoadFailure } from "../LoadFailure";
import { deliveryWorklistCopy } from "./copy";
import { donationFormatCopy } from "./formatCopy";

export function DonationDeliveryWorklistView({
  result,
  retryingId,
  onRetry,
}: {
  result: DeliveryWorklistResult;
  retryingId: string | null;
  onRetry: (jobId: string) => void;
}) {
  const copy = useAdminCopy(deliveryWorklistCopy);
  const format = useAdminCopy(donationFormatCopy);
  return (
    <div className="space-y-3 text-sm text-[var(--color-panel)]">
      <p role="status">{copy.summary(result.total)}</p>
      <div
        role="region"
        aria-label={copy.regionLabel}
        tabIndex={0}
        className="overflow-auto rounded-md border border-[var(--color-border)]"
      >
        <table className="w-full min-w-[44rem] text-left">
          <caption className="sr-only">{copy.caption(result.page)}</caption>
          <thead className="bg-[var(--color-surface)]">
            <tr>
              <th scope="col" className="p-2">
                {copy.columns.job}
              </th>
              <th scope="col" className="p-2">
                {copy.columns.status}
              </th>
              <th scope="col" className="p-2">
                {copy.columns.reason}
              </th>
              <th scope="col" className="p-2">
                {copy.columns.actions}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.jobs.map((job) => {
              const retryable =
                job.paymentStatus === "succeeded" && job.donationStatus === "succeeded";
              return (
                <tr key={job.id} className="border-t border-[var(--color-border)] align-top">
                  <td className="p-2 break-all">
                    <span className="block">{copy.job(job.id)}</span>
                    <span className="block">{copy.payment(job.paymentId)}</span>
                    <span className="block text-xs">
                      {copy.created(format.timestamp(job.createdAt))}
                    </span>
                  </td>
                  <td className="p-2">
                    <span className="block">
                      {job.status === "attention_required" ? copy.needsManual : copy.canRetry}
                    </span>
                    <span className="block">{copy.attempts(job.attempts)}</span>
                    {job.nextAttemptAt && (
                      <span className="block">
                        {copy.nextAttempt(format.timestamp(job.nextAttemptAt))}
                      </span>
                    )}
                  </td>
                  <td className="p-2 break-all">{job.errorCode || "—"}</td>
                  <td className="p-2">
                    {retryable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={retryingId !== null}
                        onClick={() => onRetry(job.id)}
                      >
                        {copy.retryJob}
                      </Button>
                    ) : (
                      <span>{copy.paymentChanged}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {result.total === 0 && <p>{copy.noJobs}</p>}
    </div>
  );
}

export function DonationDeliveryWorklist() {
  const copy = useAdminCopy(deliveryWorklistCopy);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  // The status the last retry reported; the notice is written from it when it is shown.
  const [noticeStatus, setNoticeStatus] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["finance-delivery-worklist", page],
    queryFn: () =>
      fetchAdminJson<DeliveryWorklistResult>(`/api/admin/finance/delivery-jobs?page=${page}`),
  });
  const retry = useMutation({
    mutationFn: (jobId: string) =>
      fetchAdminJson<{ deliveryStatus: string }>(`/api/admin/donations/delivery/${jobId}/retry`, {
        method: "POST",
      }),
    onSuccess: (result) => {
      setNoticeStatus(result.deliveryStatus);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance-delivery-worklist"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-task-overview"] }),
      ]),
  });
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 25));
  useEffect(() => {
    if (query.data) setPage((current) => Math.min(current, totalPages));
  }, [query.data, totalPages]);
  return (
    <section
      id="delivery-jobs"
      className="space-y-3 rounded-lg border border-[var(--color-border)] p-4"
    >
      <h3 className="font-semibold text-[var(--color-panel)]">{copy.heading}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      {query.isLoading && <p role="status">{copy.loading}</p>}
      {query.isError && (
        <LoadFailure
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {query.data && (
        <>
          <DonationDeliveryWorklistView
            result={query.data}
            retryingId={
              query.isFetching || query.isError
                ? "refreshing"
                : retry.isPending
                  ? (retry.variables ?? null)
                  : null
            }
            onRetry={(jobId) => {
              if (!window.confirm(copy.confirmRetry)) return;
              setNoticeStatus(null);
              retry.mutate(jobId);
            }}
          />
          {query.data.total > 25 && (
            <nav aria-label={copy.navLabel} className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {copy.previous}
              </Button>
              <span>{copy.pageOf(page, totalPages)}</span>
              <Button
                type="button"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                {copy.next}
              </Button>
            </nav>
          )}
        </>
      )}
      {noticeStatus && <p role="status">{copy.latestStatus(noticeStatus)}</p>}
      {retry.error && <p role="alert">{copy.retryUnconfirmed}</p>}
    </section>
  );
}
