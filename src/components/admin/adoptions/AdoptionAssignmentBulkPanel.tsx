import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useAdminLanguage } from "../adminI18n";
import { BulkReview } from "../bulk/BulkReview";
import { useAdminCopy } from "../i18n/copy";
import { fetchAdminJson } from "../../../lib/admin/http";
import { adminErrorMessage } from "../../../lib/admin/session";
import type { AdoptionAssignmentBulkOperation } from "../../../routes/api/admin/adoptions/assignment-bulk";
import { assignmentBulkCopy } from "./copy";

const endpoint = "/api/admin/adoptions/assignment-bulk";
const savedOperationKey = "adoption-assignment-bulk-operation";
type Assignee = { authUserId: string; email: string; role: string; status: string };
type UsersResponse = { users: Assignee[] };

export function AdoptionAssignmentBulkPanel({
  selectedIds,
  filterKey,
  selectionDisabled,
  statusId,
  statusEligible,
  minAgeDays,
  onMinAgeDaysChange,
}: {
  selectedIds: string[];
  filterKey: string;
  selectionDisabled: boolean;
  statusId: string;
  statusEligible: boolean;
  minAgeDays: number;
  onMinAgeDaysChange: (value: number) => void;
}) {
  const copy = useAdminCopy(assignmentBulkCopy);
  const { language } = useAdminLanguage();
  const users = useQuery({
    queryKey: ["admin-access-users"],
    queryFn: () => fetchAdminJson<UsersResponse>("/api/admin/access/users"),
  });
  const assignees =
    users.data?.users.filter(
      (user) => user.status === "active" && (user.role === "staff" || user.role === "admin"),
    ) ?? [];
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [operation, setOperation] = useState<AdoptionAssignmentBulkOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Read when the saved operation is restored on mount, which a language change must not repeat.
  const savedOperationFailed = useRef(copy.savedOperationFailed);
  savedOperationFailed.current = copy.savedOperationFailed;

  useEffect(() => {
    const saved = sessionStorage.getItem(savedOperationKey);
    if (!saved || !/^[0-9a-f-]{36}$/i.test(saved)) return;
    setRecoveryId(saved);
    setBusy(true);
    let active = true;
    fetchAdminJson<AdoptionAssignmentBulkOperation>(
      endpoint + "?operationId=" + encodeURIComponent(saved),
    )
      .then((result) => {
        if (active) setOperation(result);
      })
      .catch(() => {
        if (active) setError(savedOperationFailed.current);
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
        await fetchAdminJson<AdoptionAssignmentBulkOperation>(
          endpoint + "?operationId=" + encodeURIComponent(recoveryId),
        ),
      );
    } catch {
      setError(copy.reloadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (
      busy ||
      selectionDisabled ||
      !assigneeUserId ||
      !statusEligible ||
      !Number.isInteger(minAgeDays) ||
      minAgeDays < 0 ||
      minAgeDays > 3650 ||
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
      const result = await fetchAdminJson<AdoptionAssignmentBulkOperation>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          action: "preview",
          ids: selectedIds,
          assigneeUserId,
          statusId,
          minAgeDays,
          filterHash,
        }),
      });
      sessionStorage.setItem(savedOperationKey, result.operationId);
      setRecoveryId(result.operationId);
      setOperation(result);
    } catch (cause) {
      setError(adminErrorMessage(cause, language) ?? copy.previewFailed);
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
        await fetchAdminJson<AdoptionAssignmentBulkOperation>(endpoint, {
          method: "POST",
          body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
        }),
      );
    } catch (cause) {
      setError(adminErrorMessage(cause, language) ?? copy.applyFailed);
      try {
        setOperation(
          await fetchAdminJson<AdoptionAssignmentBulkOperation>(
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
    id ? (users.data?.users.find((user) => user.authUserId === id)?.email ?? id) : copy.unassigned;
  return (
    <section
      aria-label={copy.panelLabel}
      className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-bold">{copy.heading}</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">{copy.intro}</p>
      </div>
      <label className="block max-w-sm text-sm">
        {copy.assignee}
        <select
          aria-label={copy.assignee}
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3"
          disabled={busy}
          value={assigneeUserId}
          onChange={(event) => setAssigneeUserId(event.target.value)}
        >
          <option value="">{copy.chooseAssignee}</option>
          {assignees.map((user) => (
            <option key={user.authUserId} value={user.authUserId}>
              {user.email}
            </option>
          ))}
        </select>
      </label>
      {users.isError && <p role="alert">{copy.usersLoadFailed}</p>}
      <label className="block max-w-sm text-sm">
        {copy.minAgeDays}
        <input
          type="number"
          min={0}
          max={3650}
          step={1}
          aria-label={copy.minAgeDays}
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3"
          disabled={busy}
          value={minAgeDays}
          onChange={(event) => onMinAgeDaysChange(Number(event.target.value))}
        />
      </label>
      {!statusEligible && <p role="status">{copy.needStage}</p>}
      <p className="text-sm">{copy.selectedCount(selectedIds.length)}</p>
      <button
        type="button"
        className="btn-secondary min-h-11"
        disabled={
          busy ||
          selectionDisabled ||
          !assigneeUserId ||
          !statusEligible ||
          !Number.isInteger(minAgeDays) ||
          minAgeDays < 0 ||
          minAgeDays > 3650 ||
          !users.data ||
          selectedIds.length === 0 ||
          selectedIds.length > 1000
        }
        onClick={preview}
      >
        {busy ? copy.processing : copy.preview}
      </button>
      {recoveryId && (
        <button
          type="button"
          className="btn-secondary min-h-11"
          disabled={busy}
          onClick={reloadOperation}
        >
          {copy.reload}
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
          title={copy.reviewTitle(assigneeLabel(operation.assigneeUserId), operation.items.length)}
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
