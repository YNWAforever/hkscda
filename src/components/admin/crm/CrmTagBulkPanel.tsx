import { useEffect, useState } from "react";

import { BulkReview } from "../bulk/BulkReview";
import type { CrmTagBulkOperation } from "../../../routes/api/admin/supporters/tag-bulk";
import { fetchAdminJson } from "./api";

const endpoint = "/api/admin/supporters/tag-bulk";
const savedOperationKey = "crm-tag-bulk-operation";

export function CrmTagBulkPanel({
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
  const [tag, setTag] = useState("");
  const [operation, setOperation] = useState<CrmTagBulkOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(savedOperationKey);
    if (!saved || !/^[0-9a-f-]{36}$/i.test(saved)) return;
    setRecoveryId(saved);
    let active = true;
    fetchAdminJson<CrmTagBulkOperation>(endpoint + "?operationId=" + encodeURIComponent(saved))
      .then((result) => {
        if (active) setOperation(result);
      })
      .catch(() => {
        if (active) setError("未能讀取已保存的操作，請重新讀取結果。");
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
        await fetchAdminJson<CrmTagBulkOperation>(
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
    if (busy || selectionDisabled || selectedIds.length < 1 || selectedIds.length > 1000) return;
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
      const result = await fetchAdminJson<CrmTagBulkOperation>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "preview", ids: selectedIds, tag, filterHash }),
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
      const result = await fetchAdminJson<CrmTagBulkOperation>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "apply", operationId: operation.operationId }),
      });
      setOperation(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法套用；請重新讀取結果");
      try {
        setOperation(
          await fetchAdminJson<CrmTagBulkOperation>(
            endpoint + "?operationId=" + encodeURIComponent(operation.operationId),
          ),
        );
      } catch {
        /* The displayed snapshot stays available for review. */
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="支持者標籤批量操作"
      className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-bold">批量加入支持者標籤</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          先固定選取範圍並預覽逐筆差異。套用時會重新核對權限和每筆版本；不會更改身份、同意紀錄或付款。
        </p>
      </div>
      <label className="block max-w-sm text-sm">
        要加入的標籤
        <input
          aria-label="批量標籤"
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3"
          value={tag}
          maxLength={40}
          onChange={(event) => setTag(event.target.value)}
        />
      </label>
      <p className="text-sm">已選 {selectedIds.length} 筆（上限 1000）</p>
      <button
        type="button"
        className="btn-secondary min-h-11"
        disabled={
          busy ||
          selectionDisabled ||
          selectedIds.length === 0 ||
          selectedIds.length > 1000 ||
          !tag.trim()
        }
        onClick={preview}
      >
        {busy ? "處理中…" : "建立預覽"}
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
          title={"標籤：" + operation.tag + " · " + operation.items.length + " 筆"}
          operationId={operation.operationId}
          expiresAt={operation.expiresAt}
          items={operation.items.map((item) => ({
            entityId: item.entityId,
            status: item.status,
            reasonCode: item.reasonCode,
            before: item.beforeTags.join("、"),
            after: item.afterTags.join("、"),
          }))}
          busy={busy}
          onApply={apply}
        />
      )}
    </section>
  );
}
