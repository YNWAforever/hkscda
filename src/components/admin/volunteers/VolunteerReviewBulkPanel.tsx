import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { BulkReview } from "../bulk/BulkReview";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { VolunteerReviewBulkOperation } from "../../../routes/api/admin/volunteers/reviewer-bulk";

const endpoint = "/api/admin/volunteers/reviewer-bulk";
const savedOperationKey = "volunteer-review-bulk-operation";
type Reviewer = { authUserId: string; email: string; role: string; status: string };
type UsersResponse = { users: Reviewer[] };

export function VolunteerReviewBulkPanel({
  selectedIds,
  filterKey,
  selectionDisabled,
}: {
  selectedIds: string[];
  filterKey: string;
  selectionDisabled: boolean;
}) {
  const users = useQuery({
    queryKey: ["admin-access-users"],
    queryFn: () => fetchAdminJson<UsersResponse>("/api/admin/access/users"),
  });
  const reviewers =
    users.data?.users.filter(
      (user) => user.status === "active" && (user.role === "staff" || user.role === "admin"),
    ) ?? [];
  const [reviewerUserId, setReviewerUserId] = useState("");
  const [operation, setOperation] = useState<VolunteerReviewBulkOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(savedOperationKey);
    if (!saved || !/^[0-9a-f-]{36}$/i.test(saved)) return;
    setRecoveryId(saved);
    setBusy(true);
    let active = true;
    fetchAdminJson<VolunteerReviewBulkOperation>(
      endpoint + "?operationId=" + encodeURIComponent(saved),
    )
      .then((result) => {
        if (active) setOperation(result);
      })
      .catch(() => {
        if (active) setError("未能讀取已保存的操作，請重新讀取結果。");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function reloadOperation() {
    if (!recoveryId || busy) return;
    setBusy(true);
    setError("");
    try {
      setOperation(
        await fetchAdminJson<VolunteerReviewBulkOperation>(
          endpoint + "?operationId=" + encodeURIComponent(recoveryId),
        ),
      );
    } catch {
      setError("未能讀取已保存的操作，請稍後重新讀取結果。");
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (
      busy ||
      selectionDisabled ||
      !reviewerUserId ||
      selectedIds.length < 1 ||
      selectedIds.length > 1000
    )
      return;
    setBusy(true);
    setError("");
    try {
      const bytes = new TextEncoder().encode(JSON.stringify({ filterKey, ids: selectedIds }));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const filterHash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const result = await fetchAdminJson<VolunteerReviewBulkOperation>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "preview", ids: selectedIds, reviewerUserId, filterHash }),
      });
      sessionStorage.setItem(savedOperationKey, result.operationId);
      setRecoveryId(result.operationId);
      setOperation(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法建立預覽");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!operation || busy) return;
    setBusy(true);
    setError("");
    try {
      setOperation(
        await fetchAdminJson<VolunteerReviewBulkOperation>(endpoint, {
          method: "POST",
          body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法套用；請重新讀取結果");
      try {
        setOperation(
          await fetchAdminJson<VolunteerReviewBulkOperation>(
            endpoint + "?operationId=" + encodeURIComponent(operation.operationId),
          ),
        );
      } catch {
        /* The server snapshot remains available after retry. */
      }
    } finally {
      setBusy(false);
    }
  }
  const reviewerLabel = (id: string | null) =>
    id ? (users.data?.users.find((user) => user.authUserId === id)?.email ?? id) : "未分派";
  return (
    <section
      aria-label="義工審核者批量分派"
      className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-bold">批量分派義工身份審核者</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          只分派審核工作，不會核實身份、升級資格、發送通知或改變義工狀態。預覽有效 15
          分鐘，套用時逐筆重新核對身份版本及職員權限。
        </p>
      </div>
      <label className="block max-w-sm text-sm">
        審核者
        <select
          aria-label="審核者"
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3"
          disabled={busy}
          value={reviewerUserId}
          onChange={(event) => setReviewerUserId(event.target.value)}
        >
          <option value="">選擇已啟用的職員</option>
          {reviewers.map((user) => (
            <option key={user.authUserId} value={user.authUserId}>
              {user.email}
            </option>
          ))}
        </select>
      </label>
      {users.isError && <p role="alert">無法載入審核者名單，請重試。</p>}
      <p className="text-sm">已選 {selectedIds.length} 筆（上限 1000）</p>
      <button
        type="button"
        className="btn-secondary min-h-11"
        disabled={
          busy ||
          selectionDisabled ||
          !reviewerUserId ||
          !users.data ||
          selectedIds.length === 0 ||
          selectedIds.length > 1000
        }
        onClick={preview}
      >
        {busy ? "處理中…" : "建立分派預覽"}
      </button>
      {recoveryId && (
        <button
          type="button"
          className="btn-secondary min-h-11"
          disabled={busy}
          onClick={reloadOperation}
        >
          重新讀取結果
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}
      {operation && (
        <BulkReview
          key={operation.operationId}
          title={
            "審核者：" +
            reviewerLabel(operation.reviewerUserId) +
            " · " +
            operation.items.length +
            " 筆"
          }
          operationId={operation.operationId}
          expiresAt={operation.expiresAt}
          items={operation.items.map((item) => ({
            entityId: item.entityId,
            status: item.status,
            reasonCode: item.reasonCode,
            before: reviewerLabel(item.beforeReviewer),
            after: reviewerLabel(item.afterReviewer),
          }))}
          busy={busy}
          onApply={apply}
        />
      )}
    </section>
  );
}
