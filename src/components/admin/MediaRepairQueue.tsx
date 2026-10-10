import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { fetchAdminJson } from "../../lib/admin/http";
import { animalListCopy } from "./animalListCopy";
import { useAdminCopy } from "./i18n/copy";
import { LoadFailure } from "./LoadFailure";

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
  const copy = useAdminCopy(animalListCopy).mediaRepair;
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
      <h2 className="text-lg font-bold text-[var(--color-panel)]">{copy.heading}</h2>
      <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      {queue.isLoading ? <p role="status">{copy.loading}</p> : null}
      {queue.isError ? (
        <LoadFailure
          error={queue.error}
          onRetry={() => void queue.refetch()}
          title={copy.loadFailed}
          retryLabel={copy.retryLoad}
        />
      ) : null}
      {backlog ? (
        <>
          <p role="status" className="text-sm">
            {copy.summary(
              backlog.pending,
              backlog.claimed,
              backlog.failed,
              Math.floor(backlog.oldestAgeSeconds / 60),
            )}
          </p>
          {backlog.items.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{copy.none}</p>
          ) : (
            <ul className="space-y-2">
              {backlog.items.map((item) => {
                const key = item.kind + ":" + item.itemId;
                return (
                  <li key={key} className="rounded border border-[var(--color-border)] p-3 text-sm">
                    <div className="break-all font-medium">
                      {copy.kind[item.kind]} · {item.entityId}
                    </div>
                    <div className="text-[var(--color-text-muted)]">
                      {copy.status[item.status]} {copy.attempt(item.attempts, item.lastErrorCode)}
                    </div>
                    <div className="text-[var(--color-text-muted)]">
                      {copy.created(item.createdAt)}
                      {item.nextRetryAt ? <> {copy.nextRetry(item.nextRetryAt)}</> : null}
                    </div>
                    {item.status === "failed" ? (
                      <button
                        type="button"
                        disabled={retry.isPending}
                        onClick={() => {
                          retry.reset();
                          setSelected(key);
                          setReason("");
                          setCorrected(false);
                        }}
                        className="mt-2 min-h-11 rounded border border-[var(--color-border)] px-3"
                      >
                        {copy.review}
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
                          {copy.reasonLabel}
                          <textarea
                            disabled={retry.isPending}
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
                            disabled={retry.isPending}
                            checked={corrected}
                            onChange={(event) => setCorrected(event.target.checked)}
                            required
                          />
                          {copy.confirmFixed}
                        </label>
                        {retry.isError ? <p role="alert">{copy.retryFailed}</p> : null}
                        <button
                          type="submit"
                          disabled={!corrected || reason.trim().length < 10 || retry.isPending}
                          className="min-h-11 rounded bg-[var(--color-primary)] px-3 text-white disabled:opacity-50"
                        >
                          {retry.isPending ? copy.submitting : copy.submit}
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
