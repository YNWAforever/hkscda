import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { fetchAdminJson } from "../../lib/admin/http";

type RepairItem = {
  kind: "animal" | "content";
  itemId: string;
  entityId: string;
  status: "pending" | "claimed" | "failed";
  attempts: number;
  nextRetryAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
};
type Backlog = {
  pending: number;
  claimed: number;
  failed: number;
  oldestAgeSeconds: number;
  items: RepairItem[];
};

export function MediaRepairQueue() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [corrected, setCorrected] = useState(false);
  const queue = useQuery({
    queryKey: ["admin-media-repairs"],
    queryFn: () => fetchAdminJson<Backlog>("/api/admin/media-repairs"),
  });
  const retry = useMutation({
    mutationFn: (item: RepairItem) =>
      fetchAdminJson<{ retried: true }>("/api/admin/media-repairs", {
        method: "POST",
        body: JSON.stringify({
          kind: item.kind,
          itemId: item.itemId,
          reason: reason.trim(),
          causeCorrected: corrected,
        }),
      }),
    onSuccess: () => {
      setSelected(null);
      setReason("");
      setCorrected(false);
      void queryClient.invalidateQueries({ queryKey: ["admin-media-repairs"] });
    },
  });
  const backlog = queue.data;
  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-lg font-bold text-[var(--color-panel)]">公開相片修復佇列</h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        顯示貓狗與內容相片的待處理、處理中及失敗數。失敗項須先修復原因，才可寫入稽核理由並重試。
      </p>
      {queue.isLoading ? <p role="status">正在載入佇列…</p> : null}
      {queue.isError ? (
        <div role="alert">
          <p>無法讀取修復佇列。</p>
          <button type="button" onClick={() => void queue.refetch()} className="underline">
            重試讀取
          </button>
        </div>
      ) : null}
      {backlog ? (
        <>
          <p role="status" className="text-sm">
            待處理 {backlog.pending} · 處理中 {backlog.claimed} · 需人工覆核 {backlog.failed} ·
            最早等待 {Math.floor(backlog.oldestAgeSeconds / 60)} 分鐘
          </p>
          {backlog.items.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">目前沒有待修復相片。</p>
          ) : (
            <ul className="space-y-2">
              {backlog.items.map((item) => {
                const key = item.kind + ":" + item.itemId;
                return (
                  <li key={key} className="rounded border border-[var(--color-border)] p-3 text-sm">
                    <div className="break-all font-medium">
                      {item.kind === "animal" ? "動物" : "內容"} · {item.entityId}
                    </div>
                    <div className="text-[var(--color-text-muted)]">
                      {{ pending: "待處理", claimed: "處理中", failed: "需人工覆核" }[item.status]}{" "}
                      · 第 {item.attempts} 次 · 原因碼：
                      {item.lastErrorCode ?? "未記錄"}
                    </div>
                    <div className="text-[var(--color-text-muted)]">
                      建立：
                      {new Date(item.createdAt).toLocaleString("zh-HK", {
                        timeZone: "Asia/Hong_Kong",
                      })}
                      {item.nextRetryAt ? (
                        <>
                          {" "}
                          · 下次處理：
                          {new Date(item.nextRetryAt).toLocaleString("zh-HK", {
                            timeZone: "Asia/Hong_Kong",
                          })}
                        </>
                      ) : null}
                    </div>
                    {item.status === "failed" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(key);
                          setReason("");
                          setCorrected(false);
                        }}
                        className="mt-2 min-h-11 rounded border border-[var(--color-border)] px-3"
                      >
                        覆核並重試
                      </button>
                    ) : null}
                    {selected === key ? (
                      <form
                        className="mt-3 space-y-2"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          try {
                            await retry.mutateAsync(item);
                          } catch {
                            // The visible error below remains available for correction.
                          }
                        }}
                      >
                        <label className="block">
                          已修復原因及重試理由
                          <textarea
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            minLength={10}
                            maxLength={500}
                            required
                            className="mt-1 block w-full rounded border p-2"
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={corrected}
                            onChange={(event) => setCorrected(event.target.checked)}
                            required
                          />
                          我已核對並修復失敗原因
                        </label>
                        {retry.isError ? (
                          <p role="alert">無法重試；請重新載入佇列並核對狀態。</p>
                        ) : null}
                        <button
                          type="submit"
                          disabled={!corrected || reason.trim().length < 10 || retry.isPending}
                          className="min-h-11 rounded bg-[var(--color-primary)] px-3 text-white disabled:opacity-50"
                        >
                          {retry.isPending ? "提交中…" : "記錄理由並重試"}
                        </button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
