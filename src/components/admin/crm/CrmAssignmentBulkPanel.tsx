import { useEffect, useRef, useState } from "react";

import { BulkReview } from "../bulk/BulkReview";
import type { CrmAssignmentBulkOperation } from "../../../routes/api/admin/supporters/assignment-bulk";
import type { CrmAssignmentAssignee } from "../../../routes/api/admin/supporters/assignment-assignees";
import { fetchAdminJson } from "./api";

const endpoint = "/api/admin/supporters/assignment-bulk";
const savedOperationPrefix = "crm-assignment-bulk-operation";

export function CrmAssignmentBulkPanel({
  actorUserId,
  selectedIds,
  query,
  roleFilter,
  selectionDisabled,
}: {
  actorUserId: string;
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
  const [pickerError, setPickerError] = useState("");

  const fetchForActor = <T,>(path: string, init?: RequestInit) =>
    fetchAdminJson<T>(path, init, actorUserId);
  const savedOperationKey = savedOperationPrefix + ":" + actorUserId;
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const mounted = useRef(false);
  const requestGeneration = useRef(0);
  const requestBusy = useRef(false);
  const selectionKey = JSON.stringify([query, roleFilter, selectedIds, assigneeUserId]);
  const selectionScope = useRef({ key: selectionKey, generation: 0 });
  if (selectionScope.current.key !== selectionKey) {
    selectionScope.current = {
      key: selectionKey,
      generation: selectionScope.current.generation + 1,
    };
  }
  const isCurrent = (generation: number) =>
    mounted.current && requestGeneration.current === generation;
  function remember(result: CrmAssignmentBulkOperation) {
    sessionStorage.setItem(savedOperationKey, result.operationId);
    setRecoveryId(result.operationId);
    setOperation(result);
    setReadFailed(false);
    setError("");
  }

  useEffect(() => {
    mounted.current = true;
    const generation = ++requestGeneration.current;
    fetchForActor<{ assignees: CrmAssignmentAssignee[] }>(
      "/api/admin/supporters/assignment-assignees",
    )
      .then((result) => {
        if (mounted.current) setAssignees(result.assignees);
      })
      .catch(() => {
        if (mounted.current) setPickerError("無法載入可指派的職員");
      });
    const saved = sessionStorage.getItem(savedOperationKey);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) {
      requestBusy.current = true;
      setBusy(true);
      setRecoveryId(saved);
      fetchForActor<CrmAssignmentBulkOperation>(
        endpoint + "?operationId=" + encodeURIComponent(saved),
      )
        .then((result) => {
          if (isCurrent(generation)) remember(result);
        })
        .catch(() => {
          if (isCurrent(generation)) {
            setReadFailed(true);
            setError("未能讀取已保存的操作，請重新讀取結果。");
          }
        })
        .finally(() => {
          if (isCurrent(generation)) {
            requestBusy.current = false;
            setBusy(false);
          }
        });
    }
    const active = mounted,
      counter = requestGeneration,
      pending = requestBusy;
    return () => {
      active.current = false;
      counter.current += 1;
      pending.current = false;
    };
    // The parent remounts this panel whenever its verified actor or role changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedOperationKey]);

  async function reloadOperation() {
    if (!recoveryId || requestBusy.current || !mounted.current) return;
    const generation = ++requestGeneration.current;
    requestBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await fetchForActor<CrmAssignmentBulkOperation>(
        endpoint + "?operationId=" + encodeURIComponent(recoveryId),
      );
      if (isCurrent(generation)) remember(result);
    } catch {
      if (isCurrent(generation)) {
        setReadFailed(true);
        setError("未能讀取結果；保留操作參考，請稍後再讀取。");
      }
    } finally {
      if (isCurrent(generation)) {
        requestBusy.current = false;
        setBusy(false);
      }
    }
  }

  async function preview() {
    if (
      requestBusy.current ||
      readFailed ||
      !mounted.current ||
      selectionDisabled ||
      !assigneeUserId ||
      selectedIds.length < 1 ||
      selectedIds.length > 1000
    )
      return;
    const generation = ++requestGeneration.current,
      scope = selectionScope.current.generation;
    const currentPreview = () =>
      isCurrent(generation) && selectionScope.current.generation === scope;
    requestBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify({ query, roleFilter, ids: selectedIds })),
      );
      const filterHash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      if (!currentPreview()) return;
      const result = await fetchForActor<CrmAssignmentBulkOperation>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "preview", ids: selectedIds, assigneeUserId, filterHash }),
      });
      if (currentPreview()) remember(result);
    } catch (cause) {
      if (currentPreview()) setError(cause instanceof Error ? cause.message : "無法建立預覽");
    } finally {
      if (isCurrent(generation)) {
        requestBusy.current = false;
        setBusy(false);
      }
    }
  }

  async function apply() {
    if (!operation || requestBusy.current || readFailed || !mounted.current) return;
    const generation = ++requestGeneration.current;
    requestBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await fetchForActor<CrmAssignmentBulkOperation>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
      });
      if (isCurrent(generation)) remember(result);
    } catch {
      if (!isCurrent(generation)) return;
      setReadFailed(true);
      setError("操作回應未確認；先重新讀取已保存結果。");
      try {
        const result = await fetchForActor<CrmAssignmentBulkOperation>(
          endpoint + "?operationId=" + encodeURIComponent(operation.operationId),
        );
        if (isCurrent(generation)) remember(result);
      } catch {
        if (isCurrent(generation))
          setError("操作結果未確認；保留操作參考，重新讀取成功前暫停套用。");
      }
    } finally {
      if (isCurrent(generation)) {
        requestBusy.current = false;
        setBusy(false);
      }
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
          disabled={busy}
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
          readFailed ||
          selectionDisabled ||
          !assigneeUserId ||
          selectedIds.length === 0 ||
          selectedIds.length > 1000
        }
        onClick={preview}
      >
        {busy ? "處理中…" : "建立預覽"}
      </button>
      {pickerError && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {pickerError}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}
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
          busy={busy || readFailed}
          onApply={apply}
        />
      )}
    </section>
  );
}
