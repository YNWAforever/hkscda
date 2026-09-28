import { useEffect, useState } from "react";

import { BulkReview } from "../bulk/BulkReview";
import type { CrmAssignmentBulkOperation } from "../../../routes/api/admin/supporters/assignment-bulk";
import type { CrmAssignmentAssignee } from "../../../routes/api/admin/supporters/assignment-assignees";
import { fetchAdminJson } from "./api";

const endpoint = "/api/admin/supporters/assignment-bulk";
const savedOperationKey = "crm-assignment-bulk-operation";

export function CrmAssignmentBulkPanel({
  selectedIds,
  query,
  roleFilter,
  selectionDisabled,
}: {
  selectedIds: string[];
  query: string;
  roleFilter: string;
  selectionDisabled: boolean;
}) {
  const [assignees, setAssignees] = useState<CrmAssignmentAssignee[]>([]);
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [operation, setOperation] = useState<CrmAssignmentBulkOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchAdminJson<{ assignees: CrmAssignmentAssignee[] }>(
      "/api/admin/supporters/assignment-assignees",
    )
      .then((result) => {
        if (active) setAssignees(result.assignees);
      })
      .catch(() => {
        if (active) setError("無法載入可指派的職員");
      });
    const saved = sessionStorage.getItem(savedOperationKey);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) {
      fetchAdminJson<CrmAssignmentBulkOperation>(
        endpoint + "?operationId=" + encodeURIComponent(saved),
      )
        .then((result) => {
          if (active) setOperation(result);
        })
        .catch(() => {
          if (active) sessionStorage.removeItem(savedOperationKey);
        });
    }
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
      const bytes = new TextEncoder().encode(
        JSON.stringify({ query, roleFilter, ids: selectedIds }),
      );
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const filterHash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const result = await fetchAdminJson<CrmAssignmentBulkOperation>(endpoint, {
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
        await fetchAdminJson<CrmAssignmentBulkOperation>(endpoint, {
          method: "POST",
          body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法套用；請重新讀取結果");
      try {
        setOperation(
          await fetchAdminJson<CrmAssignmentBulkOperation>(
            endpoint + "?operationId=" + encodeURIComponent(operation.operationId),
          ),
        );
      } catch {
        /* Keep the last snapshot visible. */
      }
    } finally {
      setBusy(false);
    }
  }

  const assigneeLabel = (id: string | null) =>
    id ? (assignees.find((person) => person.authUserId === id)?.email ?? id) : "未指派";
  return (
    <section
      aria-label="支持者跟進負責人批量操作"
      className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-bold">批量指派跟進負責人</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          只更新 CRM
          跟進負責人。先固定範圍並逐筆預覽，套用時重新核對職員權限及支持者版本；不會發送通知。
        </p>
      </div>
      <label className="block max-w-sm text-sm">
        跟進負責人
        <select
          aria-label="批量跟進負責人"
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3"
          value={assigneeUserId}
          onChange={(event) => setAssigneeUserId(event.target.value)}
        >
          <option value="">選擇職員</option>
          {assignees.map((person) => (
            <option key={person.authUserId} value={person.authUserId}>
              {person.email}（{person.role}）
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm">已選 {selectedIds.length} 筆（上限 1000）</p>
      <button
        type="button"
        className="btn-secondary min-h-11"
        disabled={
          busy ||
          selectionDisabled ||
          !assigneeUserId ||
          selectedIds.length === 0 ||
          selectedIds.length > 1000
        }
        onClick={preview}
      >
        {busy ? "處理中…" : "建立預覽"}
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
            "指派給：" +
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
