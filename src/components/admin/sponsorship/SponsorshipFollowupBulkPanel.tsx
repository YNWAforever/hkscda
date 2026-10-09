import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { BulkReview } from "../bulk/BulkReview";
import { fetchAdminJson } from "../../../lib/admin/http";
import { adminErrorMessage } from "../../../lib/admin/session";
import type { FollowupAssignee } from "../../../lib/sponsorshipAdmin/followupAssignment.server";
import type { SponsorshipFollowupBulkOperation } from "../../../routes/api/admin/sponsorships/followup-bulk";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { followupBulkCopy } from "./bulkCopy";

const endpoint = "/api/admin/sponsorships/followup-bulk";
const savedOperationKey = "sponsorship-followup-bulk-operation";
type AssigneesResponse = { assignees: FollowupAssignee[] };

/**
 * Why the panel shows an error. It is kept as a code (the key of `copy.errors`), with the caught
 * error where the server may have given a reason, and written when the panel renders.
 */
type PanelError = {
  code: "restore_failed" | "reload_failed" | "preview_failed" | "apply_failed";
  cause?: unknown;
};

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
  const copy = useAdminCopy(followupBulkCopy);
  const { language } = useAdminLanguage();
  const assignees = useQuery({
    queryKey: ["sponsorship-followup-assignees"],
    queryFn: () => fetchAdminJson<AssigneesResponse>("/api/admin/sponsorships/followup-assignees"),
  });
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [operation, setOperation] = useState<SponsorshipFollowupBulkOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(savedOperationKey);
    if (!saved || !/^[0-9a-f-]{36}$/i.test(saved)) return;
    setRecoveryId(saved);
    setBusy(true);
    let active = true;
    fetchAdminJson<SponsorshipFollowupBulkOperation>(
      endpoint + "?operationId=" + encodeURIComponent(saved),
    )
      .then((result) => {
        if (active) setOperation(result);
      })
      .catch(() => {
        if (active) setError({ code: "restore_failed" });
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
    setError(null);
    try {
      const result = await fetchAdminJson<SponsorshipFollowupBulkOperation>(
        endpoint + "?operationId=" + encodeURIComponent(recoveryId),
      );
      if (mounted.current) setOperation(result);
    } catch {
      if (mounted.current) setError({ code: "reload_failed" });
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

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
    setError(null);
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
      if (!mounted.current) return;
      sessionStorage.setItem(savedOperationKey, result.operationId);
      setRecoveryId(result.operationId);
      setOperation(result);
    } catch (cause) {
      setError({ code: "preview_failed", cause });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!operation || busy) return;
    setBusy(true);
    setError(null);
    try {
      setOperation(
        await fetchAdminJson<SponsorshipFollowupBulkOperation>(endpoint, {
          method: "POST",
          body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
        }),
      );
      onApplied();
    } catch (cause) {
      setError({ code: "apply_failed", cause });
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
    id
      ? (assignees.data?.assignees.find((user) => user.authUserId === id)?.email ?? id)
      : copy.unassigned;
  // A reason the server gave is shown as it came; otherwise the message for the code.
  const errorMessage = error
    ? (adminErrorMessage(error.cause, language) ?? copy.errors[error.code])
    : "";

  return (
    <section
      aria-label={copy.panelLabel}
      className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-bold">{copy.heading}</h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      </div>
      <label className="block max-w-sm text-sm">
        {copy.ownerLabel}
        <select
          disabled={busy}
          aria-label={copy.ownerAria}
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3"
          value={assigneeUserId}
          onChange={(event) => setAssigneeUserId(event.target.value)}
        >
          <option value="">{copy.chooseOwner}</option>
          {assignees.data?.assignees.map((user) => (
            <option key={user.authUserId} value={user.authUserId}>
              {user.email}
            </option>
          ))}
        </select>
      </label>
      {assignees.isError && <p role="alert">{copy.pickerFailed}</p>}
      <p className="text-sm">{copy.selectedCount(selectedIds.length)}</p>
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
        {busy ? copy.processing : copy.preview}
      </button>
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
          busy={busy}
          onApply={apply}
        />
      )}
    </section>
  );
}
