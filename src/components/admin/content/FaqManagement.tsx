import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import { FAQ_CTA_OPTIONS } from "../../../lib/faq/schemas";
import type { FaqCategory, FaqEntry, FaqEntryInput } from "../../../lib/faq/types";

export const ADMIN_FAQ_QUERY_KEY = ["admin-faq"] as const;

const CATEGORY_LABELS: Record<FaqCategory, string> = {
  sponsorship: "助養",
  adoption: "領養",
  tax_receipt: "報稅收據",
  donation: "捐款",
  contact: "聯絡職員",
};

type FaqDraft = {
  id?: string;
  category: FaqCategory;
  questionZh: string;
  questionEn: string;
  answerZh: string;
  answerEn: string;
  keywordsZh: string;
  keywordsEn: string;
  ctaKey: string;
  sensitive: boolean;
  sortOrder: number;
  isActive: boolean;
};

function draftFromEntry(entry?: FaqEntry): FaqDraft {
  return {
    id: entry?.id,
    category: entry?.category ?? "sponsorship",
    questionZh: entry?.question["zh-HK"] ?? "",
    questionEn: entry?.question.en ?? "",
    answerZh: entry?.answer["zh-HK"] ?? "",
    answerEn: entry?.answer.en ?? "",
    keywordsZh: entry?.keywords["zh-HK"].join(", ") ?? "",
    keywordsEn: entry?.keywords.en.join(", ") ?? "",
    ctaKey: entry?.ctaKey ?? "",
    sensitive: entry?.sensitive ?? false,
    sortOrder: entry?.sortOrder ?? 0,
    isActive: entry?.isActive ?? true,
  };
}

export function toInput(draft: FaqDraft): FaqEntryInput {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    category: draft.category,
    questionZh: draft.questionZh,
    questionEn: draft.questionEn,
    answerZh: draft.answerZh,
    answerEn: draft.answerEn,
    keywordsZh: draft.keywordsZh
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    keywordsEn: draft.keywordsEn
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    ctaKey: draft.ctaKey || null,
    sensitive: draft.sensitive,
    sortOrder: draft.sortOrder,
    isActive: draft.isActive,
  };
}

export function invalidateFaqQueries(client: {
  invalidateQueries(input: { queryKey: readonly string[] }): Promise<unknown>;
}) {
  return client.invalidateQueries({ queryKey: ADMIN_FAQ_QUERY_KEY });
}

export function FaqManagement() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<FaqDraft | null>(null);

  const entriesQuery = useQuery({
    queryKey: ADMIN_FAQ_QUERY_KEY,
    queryFn: () => fetchAdminJson<FaqEntry[]>("/api/admin/faq"),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: FaqEntryInput) =>
      fetchAdminJson<{ entry: FaqEntry }>("/api/admin/faq", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setDraft(null);
      return invalidateFaqQueries(queryClient);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      fetchAdminJson<{ ok: true }>("/api/admin/faq", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      }),
    onSuccess: () => invalidateFaqQueries(queryClient),
  });

  const entries = entriesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">常見問題</h1>
        <button
          type="button"
          className="btn-primary min-h-11 px-4"
          onClick={() => setDraft(draftFromEntry())}
        >
          新增問題
        </button>
      </div>

      {entriesQuery.isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">載入中…</p>
      ) : null}
      {entriesQuery.isError ? (
        <p role="alert" className="text-sm text-red-600">
          未能載入常見問題，請重新整理頁面。
        </p>
      ) : null}

      {!entriesQuery.isLoading && !entriesQuery.isError ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">分類</th>
              <th className="py-2">問題</th>
              <th className="py-2">排序</th>
              <th className="py-2">狀態</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b">
                <td className="py-2">{CATEGORY_LABELS[entry.category]}</td>
                <td className="py-2">{entry.question["zh-HK"]}</td>
                <td className="py-2">{entry.sortOrder}</td>
                <td className="py-2">{entry.isActive ? "顯示中" : "已停用"}</td>
                <td className="py-2">
                  <button type="button" onClick={() => setDraft(draftFromEntry(entry))}>
                    編輯
                  </button>
                  {entry.isActive ? (
                    <button
                      type="button"
                      onClick={() => deactivateMutation.mutate(entry.id)}
                      disabled={deactivateMutation.isPending}
                    >
                      停用
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {deactivateMutation.isError ? (
        <p role="alert" className="text-sm text-red-600">
          停用操作失敗，請再試一次。
        </p>
      ) : null}

      {draft ? (
        <form
          className="space-y-3 border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            upsertMutation.mutate(toInput(draft));
          }}
        >
          <label className="block">
            分類
            <select
              className="mt-1 block w-full border px-3 py-2"
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value as FaqCategory })
              }
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            問題（中文）
            <input
              className="mt-1 block w-full border px-3 py-2"
              value={draft.questionZh}
              onChange={(event) => setDraft({ ...draft, questionZh: event.target.value })}
              required
            />
          </label>
          <label className="block">
            Question (English)
            <input
              className="mt-1 block w-full border px-3 py-2"
              value={draft.questionEn}
              onChange={(event) => setDraft({ ...draft, questionEn: event.target.value })}
              required
            />
          </label>
          <label className="block">
            答案（中文）
            <textarea
              className="mt-1 block w-full border px-3 py-2"
              value={draft.answerZh}
              onChange={(event) => setDraft({ ...draft, answerZh: event.target.value })}
              required
            />
          </label>
          <label className="block">
            Answer (English)
            <textarea
              className="mt-1 block w-full border px-3 py-2"
              value={draft.answerEn}
              onChange={(event) => setDraft({ ...draft, answerEn: event.target.value })}
              required
            />
          </label>
          <label className="block">
            關鍵字（中文，以逗號分隔）
            <input
              className="mt-1 block w-full border px-3 py-2"
              value={draft.keywordsZh}
              onChange={(event) => setDraft({ ...draft, keywordsZh: event.target.value })}
            />
          </label>
          <label className="block">
            Keywords (English, comma-separated)
            <input
              className="mt-1 block w-full border px-3 py-2"
              value={draft.keywordsEn}
              onChange={(event) => setDraft({ ...draft, keywordsEn: event.target.value })}
            />
          </label>
          <label className="block">
            行動按鈕
            <select
              className="mt-1 block w-full border px-3 py-2"
              value={draft.ctaKey}
              onChange={(event) => setDraft({ ...draft, ctaKey: event.target.value })}
            >
              <option value="">（沒有行動按鈕）</option>
              {FAQ_CTA_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label["zh-HK"]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.sensitive}
              onChange={(event) => setDraft({ ...draft, sensitive: event.target.checked })}
            />
            涉及個人資料／財務內容
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
            />
            在 /help 頁面顯示
          </label>
          <label className="block">
            排序
            <input
              type="number"
              className="mt-1 block w-full border px-3 py-2"
              value={draft.sortOrder}
              onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })}
            />
          </label>
          {upsertMutation.isError ? (
            <p role="alert" className="text-sm text-red-600">
              儲存失敗，請檢查資料後再試一次。
            </p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="submit"
              className="btn-primary min-h-11 px-4"
              disabled={upsertMutation.isPending}
            >
              儲存
            </button>
            <button
              type="button"
              className="btn-secondary min-h-11 px-4"
              onClick={() => setDraft(null)}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
