import { useEffect, useRef, useState } from "react";

import { BulkReview } from "../bulk/BulkReview";
import type { CrmAssignmentBulkOperation } from "../../../routes/api/admin/supporters/assignment-bulk";
import type { CrmAssignmentAssignee } from "../../../routes/api/admin/supporters/assignment-assignees";
import { adminErrorMessage } from "../../../lib/admin/session";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { fetchAdminJson } from "./api";
import { supporterAssignmentCopy } from "./bulkCopy";

const endpoint = "/api/admin/supporters/assignment-bulk";
const savedOperationPrefix = "crm-assignment-bulk-operation";

/**
 * Why the panel shows an error. It is kept as a code (the key of `copy.errors`), with the caught
 * error where the server may have given a reason, and written when the panel renders.
 */
type PanelError = {
  code:
    | "restore_failed"
    | "reload_failed"
    | "preview_failed"
    | "apply_unconfirmed"
    | "apply_result_unconfirmed";
  cause?: unknown;
};

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
  const copy = useAdminCopy(supporterAssignmentCopy);
  const { language } = useAdminLanguage();
  const [assignees, setAssignees] = useState<CrmAssignmentAssignee[]>([]);
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [operation, setOperation] = useState<CrmAssignmentBulkOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [pickerFailed, setPickerFailed] = useState(false);

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
    setError(null);
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
        if (mounted.current) setPickerFailed(true);
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
            setError({ code: "restore_failed" });
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
    setError(null);
    try {
      const result = await fetchForActor<CrmAssignmentBulkOperation>(
        endpoint + "?operationId=" + encodeURIComponent(recoveryId),
      );
      if (isCurrent(generation)) remember(result);
    } catch {
      if (isCurrent(generation)) {
        setReadFailed(true);
        setError({ code: "reload_failed" });
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
    setError(null);
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
      if (currentPreview()) setError({ code: "preview_failed", cause });
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
    setError(null);
    try {
      const result = await fetchForActor<CrmAssignmentBulkOperation>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
      });
      if (isCurrent(generation)) remember(result);
    } catch {
      if (!isCurrent(generation)) return;
      setReadFailed(true);
      setError({ code: "apply_unconfirmed" });
      try {
        const result = await fetchForActor<CrmAssignmentBulkOperation>(
          endpoint + "?operationId=" + encodeURIComponent(operation.operationId),
        );
        if (isCurrent(generation)) remember(result);
      } catch {
        if (isCurrent(generation)) setError({ code: "apply_result_unconfirmed" });
      }
    } finally {
      if (isCurrent(generation)) {
        requestBusy.current = false;
        setBusy(false);
      }
    }
  }

  const assigneeLabel = (id: string | null) =>
    id ? (assignees.find((person) => person.authUserId === id)?.email ?? id) : copy.unassigned;
  // A reason the server gave is shown as it came; otherwise the message for the code.
  const errorMessage = error
    ? (adminErrorMessage(error.cause, language) ?? copy.errors[error.code])
    : "";
  return (
    <section
      aria-label={copy.panelLabel}
      className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-bold">{copy.heading}</h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      </div>
      <label className="block max-w-sm text-sm">
        {copy.ownerLabel}
        <select
          aria-label={copy.ownerAria}
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3"
          disabled={busy}
          value={assigneeUserId}
          onChange={(event) => setAssigneeUserId(event.target.value)}
        >
          <option value="">{copy.chooseOwner}</option>
          {assignees.map((person) => (
            <option key={person.authUserId} value={person.authUserId}>
              {copy.ownerOption(person.email, person.role)}
            </option>
          ))}
        </select>
      </label>
      <p aria-live="polite" aria-atomic="true" className="text-sm">
        {copy.selectedCount(selectedIds.length)}
      </p>
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
        {busy ? copy.processing : copy.preview}
      </button>
      {pickerFailed && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {copy.pickerFailed}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {errorMessage}
        </p>
      )}
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
          busy={busy || readFailed}
          onApply={apply}
        />
      )}
    </section>
  );
}
