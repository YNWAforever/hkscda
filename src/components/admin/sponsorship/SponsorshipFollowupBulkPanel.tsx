import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { BulkReview } from "../bulk/BulkReview";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { FollowupAssignee } from "../../../lib/sponsorshipAdmin/followupAssignment.server";
import type { SponsorshipFollowupBulkOperation } from "../../../routes/api/admin/sponsorships/followup-bulk";

const endpoint = "/api/admin/sponsorships/followup-bulk";
const savedOperationKey = "sponsorship-followup-bulk-operation";
type AssigneesResponse = { assignees: FollowupAssignee[] };

export function SponsorshipFollowupBulkPanel({
  selectedIds,
  filterKey,
  selectionDisabled,
  onApplied,
}: {
  selectedIds: string[];
  filterKey: string;
  selectionDisabled: boolean;
  onApplied: () => void;
}) {
  const assignees = useQuery({
    queryKey: ["sponsorship-followup-assignees"],
    queryFn: () => fetchAdminJson<AssigneesResponse>("/api/admin/sponsorships/followup-assignees"),
  });
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [operation, setOperation] = useState<SponsorshipFollowupBulkOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(savedOperationKey);
    if (!saved || !/^[0-9a-f-]{36}$/i.test(saved)) return;
    let active = true;
    fetchAdminJson<SponsorshipFollowupBulkOperation>(
      endpoint + "?operationId=" + encodeURIComponent(saved),
    )
      .then((result) => {
        if (active) setOperation(result);
      })
      .catch(() => {
        if (active) sessionStorage.removeItem(savedOperationKey);
      });
    return () => {
      active = false;
    };
  }, []);

  async function preview() {
    if (
      busy ||
      selectionDisabled ||
      !assigneeUserId ||
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
      const result = await fetchAdminJson<SponsorshipFollowupBulkOperation>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "preview", ids: selectedIds, assigneeUserId, filterHash }),
      });
      sessionStorage.setItem(savedOperationKey, result.operationId);
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
        await fetchAdminJson<SponsorshipFollowupBulkOperation>(endpoint, {
          method: "POST",
          body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
        }),
      );
      onApplied();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法套用；請重新讀取結果");
      try {
        setOperation(
          await fetchAdminJson<SponsorshipFollowupBulkOperation>(
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

  const assigneeLabel = (id: string | null) =>
    id ? (assignees.data?.assignees.find((user) => user.authUserId === id)?.email ?? id) : "未分派";

  return (
    <section
      aria-label="助養跟進批量分派"
      className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-bold">批量分派助養跟進</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          只改負責職員；不確認付款、不審核憑證、不發送提醒。預覽有效 15
          分鐘；套用時逐筆檢查狀態、版本及職員權限。
        </p>
      </div>
      <label className="block max-w-sm text-sm">
        負責職員
        <select
          aria-label="批量分派負責職員"
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3"
          value={assigneeUserId}
          onChange={(event) => setAssigneeUserId(event.target.value)}
        >
          <option value="">選擇已啟用的職員</option>
          {assignees.data?.assignees.map((user) => (
            <option key={user.authUserId} value={user.authUserId}>
              {user.email}
            </option>
          ))}
        </select>
      </label>
      {assignees.isError && <p role="alert">無法載入職員名單，請重試。</p>}
      <p className="text-sm">已選 {selectedIds.length} 筆（上限 1000）</p>
      <button
        type="button"
        className="btn-secondary min-h-11"
        disabled={
          busy ||
          selectionDisabled ||
          !assigneeUserId ||
          !assignees.data ||
          selectedIds.length === 0 ||
          selectedIds.length > 1000
        }
        onClick={preview}
      >
        {busy ? "處理中…" : "建立分派預覽"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}
      {operation && (
        <BulkReview
          key={operation.operationId}
          title={
            "負責職員：" +
            assigneeLabel(operation.assigneeUserId) +
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
            before: assigneeLabel(item.beforeAssignee),
            after: assigneeLabel(item.afterAssignee),
          }))}
          busy={busy}
          onApply={apply}
        />
      )}
    </section>
  );
}
