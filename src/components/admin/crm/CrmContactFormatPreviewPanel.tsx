import { useEffect, useRef, useState } from "react";

import type { ContactFormatPreviewResponse } from "../../../lib/crm/contactFormatPreview";
import { fetchAdminJson } from "./api";

const endpoint = "/api/admin/supporters/format-preview";
const pageSize = 25;

export function CrmContactFormatPreviewPanel({
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
  const selectionKey = JSON.stringify([query, roleFilter, selectedIds]);
  const selectionKeyRef = useRef(selectionKey);
  selectionKeyRef.current = selectionKey;
  const [result, setResult] = useState<{
    selectionKey: string;
    value: ContactFormatPreviewResponse;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setResult(null);
    setError("");
    setBusy(false);
    setPage(1);
  }, [selectionKey]);

  async function preview() {
    if (busy || selectionDisabled || selectedIds.length < 1 || selectedIds.length > 1000) return;
    const scope = selectionKey;
    setBusy(true);
    setError("");
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope));
      const filterHash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const value = await fetchAdminJson<ContactFormatPreviewResponse>(endpoint, {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds, filterHash }),
      });
      if (selectionKeyRef.current !== scope || value.filterHash !== filterHash) return;
      setResult({ selectionKey: scope, value });
      setPage(1);
    } catch (cause) {
      if (selectionKeyRef.current === scope) {
        setError(cause instanceof Error ? cause.message : "無法預覽資料格式");
      }
    } finally {
      if (selectionKeyRef.current === scope) setBusy(false);
    }
  }

  const previewResult = result?.selectionKey === selectionKey ? result.value : null;
  const pageCount = previewResult ? Math.ceil(previewResult.items.length / pageSize) : 0;
  const pageItems = previewResult?.items.slice((page - 1) * pageSize, page * pageSize) ?? [];
  const label = {
    suggested: "建議整理",
    manual_review: "身份需人工核對",
    unchanged: "無需整理",
    skipped: "已移除或找不到",
  } as const;

  return (
    <section
      aria-label="支持者聯絡資料格式預覽"
      className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-bold">聯絡資料格式整理預覽</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          唯讀顯示名稱、電郵及電話的空白／大小寫建議。電郵屬身份資料，必須人工核對；不會修改任何資料、身份或同意紀錄。
        </p>
      </div>
      <p className="text-sm">已選 {selectedIds.length} 筆（上限 1000）</p>
      <button
        type="button"
        className="btn-secondary min-h-11"
        disabled={
          busy || selectionDisabled || selectedIds.length === 0 || selectedIds.length > 1000
        }
        onClick={preview}
      >
        {busy ? "正在檢查…" : "預覽格式建議"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}
      {previewResult && (
        <div className="space-y-3">
          <p role="status" className="text-sm">
            建議整理 {previewResult.counts.suggested} · 身份需人工核對{" "}
            {previewResult.counts.manual_review} · 無需整理 {previewResult.counts.unchanged} ·
            已移除或找不到 {previewResult.counts.skipped}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="px-2 py-2">
                    支持者 ID
                  </th>
                  <th scope="col" className="px-2 py-2">
                    狀態
                  </th>
                  <th scope="col" className="px-2 py-2">
                    目前資料
                  </th>
                  <th scope="col" className="px-2 py-2">
                    格式建議
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr
                    key={item.entityId}
                    className="border-b border-[var(--color-border)] align-top"
                  >
                    <th scope="row" className="break-all px-2 py-2 font-normal">
                      {item.entityId}
                    </th>
                    <td className="px-2 py-2">{label[item.status]}</td>
                    <td className="px-2 py-2">
                      {item.before
                        ? [item.before.name, item.before.email, item.before.phone ?? "-"].join(
                            " / ",
                          )
                        : "-"}
                    </td>
                    <td className="px-2 py-2">
                      {item.after
                        ? [item.after.name, item.after.email, item.after.phone ?? "-"].join(" / ")
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className="btn-secondary min-h-11"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                上一頁
              </button>
              <span>
                第 {page} / {pageCount} 頁
              </span>
              <button
                type="button"
                className="btn-secondary min-h-11"
                disabled={page === pageCount}
                onClick={() => setPage((value) => value + 1)}
              >
                下一頁
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
