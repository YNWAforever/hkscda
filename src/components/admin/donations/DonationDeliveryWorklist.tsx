import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { DeliveryWorklistResult } from "../../../lib/donations/deliveryWorklist";
import { Button } from "../../ui/button";
import { LoadFailure } from "../LoadFailure";

export function DonationDeliveryWorklistView({
  result,
  retryingId,
  onRetry,
}: {
  result: DeliveryWorklistResult;
  retryingId: string | null;
  onRetry: (jobId: string) => void;
}) {
  return (
    <div className="space-y-3 text-sm text-[var(--color-panel)]">
      <p role="status">需處理工作 {result.total} 項；每頁最多 25 項。</p>
      <div
        role="region"
        aria-label="收條及通知工作表格"
        tabIndex={0}
        className="overflow-auto rounded-md border border-[var(--color-border)]"
      >
        <table className="w-full min-w-[44rem] text-left">
          <caption className="sr-only">收條及通知工作第 {result.page} 頁</caption>
          <thead className="bg-[var(--color-surface)]">
            <tr>
              <th scope="col" className="p-2">
                工作／付款
              </th>
              <th scope="col" className="p-2">
                狀態／嘗試
              </th>
              <th scope="col" className="p-2">
                失敗原因
              </th>
              <th scope="col" className="p-2">
                操作
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
                    <span className="block">工作 {job.id}</span>
                    <span className="block">付款 {job.paymentId}</span>
                    <span className="block text-xs">建立：{job.createdAt}</span>
                  </td>
                  <td className="p-2">
                    <span className="block">
                      {job.status === "attention_required" ? "需人工處理" : "可重試"}
                    </span>
                    <span className="block">已嘗試 {job.attempts} 次</span>
                    {job.nextAttemptAt && <span className="block">下次：{job.nextAttemptAt}</span>}
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
                        重試此工作
                      </Button>
                    ) : (
                      <span>付款狀態已變更，不能重試</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {result.total === 0 && <p>目前沒有失敗工作。</p>}
    </div>
  );
}

export function DonationDeliveryWorklist() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
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
      setNotice(`工作最新狀態：${result.deliveryStatus}。付款記錄不會重複入帳。`);
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
      <h3 className="font-semibold text-[var(--color-panel)]">收條／通知失敗工作</h3>
      <p className="text-sm text-[var(--color-text-muted)]">
        只顯示既有失敗工作。只有付款仍成功入帳才可重試；請先核對付款及收件資料。此清單不會自動補發、重新入帳、退款或作廢收條。
      </p>
      {query.isLoading && <p role="status">正在讀取工作…</p>}
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
              if (!window.confirm("確認重試這一筆既有收條及確認電郵工作？請先核對付款及收件資料。"))
                return;
              setNotice("");
              retry.mutate(jobId);
            }}
          />
          {query.data.total > 25 && (
            <nav aria-label="送達工作分頁" className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                上一頁
              </Button>
              <span>
                第 {page} / {totalPages} 頁
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                下一頁
              </Button>
            </nav>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {retry.error && <p role="alert">未能確認重試結果；請按最新清單核對，勿假定工作未執行。</p>}
    </section>
  );
}
