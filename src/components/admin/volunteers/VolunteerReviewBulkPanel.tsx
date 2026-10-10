import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { BulkReview } from "../bulk/BulkReview";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { VolunteerReviewBulkOperation } from "../../../routes/api/admin/volunteers/reviewer-bulk";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { reviewPanelProblemMessage, type PanelProblem } from "./directoryProblems";
import { volunteerDirectoryCopy } from "./volunteerDirectoryCopy";
import { LoadFailure } from "../LoadFailure";

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
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerDirectoryCopy, language).reviewPanel;
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
  const [problem, setProblem] = useState<PanelProblem | null>(null);

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
        if (active) setProblem({ code: "load_saved" });
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
    setProblem(null);
    try {
      setOperation(
        await fetchAdminJson<VolunteerReviewBulkOperation>(
          endpoint + "?operationId=" + encodeURIComponent(recoveryId),
        ),
      );
    } catch {
      setProblem({ code: "reload_saved" });
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
    setProblem(null);
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
      setProblem({ code: "preview_failed", cause });
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!operation || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      setOperation(
        await fetchAdminJson<VolunteerReviewBulkOperation>(endpoint, {
          method: "POST",
          body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
        }),
      );
    } catch (cause) {
      setProblem({ code: "apply_failed", cause });
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
    id ? (users.data?.users.find((user) => user.authUserId === id)?.email ?? id) : copy.unassigned;
  const problemMessage = reviewPanelProblemMessage(problem, language);
  return (
    <section
      aria-label={copy.label}
      className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-bold">{copy.title}</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">{copy.hint}</p>
      </div>
      <label className="block max-w-sm text-sm">
        {copy.reviewer}
        <select
          aria-label={copy.reviewer}
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3"
          disabled={busy}
          value={reviewerUserId}
          onChange={(event) => setReviewerUserId(event.target.value)}
        >
          <option value="">{copy.chooseReviewer}</option>
          {reviewers.map((user) => (
            <option key={user.authUserId} value={user.authUserId}>
              {user.email}
            </option>
          ))}
        </select>
      </label>
      {users.isError && (
        <LoadFailure
          error={users.error}
          onRetry={() => void users.refetch()}
          title={copy.listFailed}
        />
      )}
      <p aria-live="polite" aria-atomic="true" className="text-sm">
        {copy.selected(selectedIds.length)}
      </p>
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
        {busy ? copy.busy : copy.preview}
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
      {problemMessage && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {problemMessage}
        </p>
      )}
      {operation && (
        <BulkReview
          key={operation.operationId}
          title={copy.reviewTitle(reviewerLabel(operation.reviewerUserId), operation.items.length)}
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
