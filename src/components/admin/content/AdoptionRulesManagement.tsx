import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  AdminAdoptionInformationPage,
  AdoptionInformationResource,
  AdoptionRuleContent,
} from "../../../lib/adoptionInformation/types";
import {
  ADOPTION_INFORMATION_QUERY_KEY,
  AdoptionContentTabs,
  invalidateAdoptionInformationQueries,
} from "./AdoptionInformationManagement";

type RuleDraft = {
  id?: string;
  contentZh: string;
  contentEn: string;
  sortOrder: number;
  isPublished: boolean;
};

function draftFromRule(rule?: AdoptionRuleContent): RuleDraft {
  return {
    id: rule?.id,
    contentZh: rule?.content["zh-HK"] ?? "",
    contentEn: rule?.content.en ?? "",
    sortOrder: rule?.sortOrder ?? 0,
    isPublished: rule?.isPublished ?? true,
  };
}

export function toRuleInput(draft: RuleDraft) {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    content: { "zh-HK": draft.contentZh, en: draft.contentEn },
    sortOrder: draft.sortOrder,
    isPublished: draft.isPublished,
  };
}

export function AdoptionRulesManagement({
  activeTab,
  onTabChange,
}: {
  activeTab: AdoptionInformationResource;
  onTabChange: (tab: AdoptionInformationResource) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RuleDraft | null>(null);

  const rulesQuery = useQuery({
    queryKey: [...ADOPTION_INFORMATION_QUERY_KEY, "rules"],
    queryFn: () =>
      fetchAdminJson<AdminAdoptionInformationPage>(
        "/api/admin/adoption-information?resource=rules&page=1&pageSize=50",
      ),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: ReturnType<typeof toRuleInput>) =>
      fetchAdminJson<{ rule: AdoptionRuleContent }>("/api/admin/adoption-information", {
        method: "POST",
        body: JSON.stringify({ resource: "rule", input }),
      }),
    onSuccess: () => {
      setDraft(null);
      return invalidateAdoptionInformationQueries(queryClient);
    },
  });

  const rules = (rulesQuery.data?.items ?? []) as AdoptionRuleContent[];

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">領養</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">領養規則管理</h1>
      </div>

      <AdoptionContentTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">領養規則</h2>
        <button
          type="button"
          className="btn-primary min-h-11 px-4"
          onClick={() => setDraft(draftFromRule())}
        >
          新增規則
        </button>
      </div>

      {rulesQuery.isLoading ? <p aria-live="polite">載入領養規則中…</p> : null}
      {rulesQuery.isError ? (
        <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
          未能載入領養規則，請重新整理頁面。
        </p>
      ) : null}

      {!rulesQuery.isLoading && !rulesQuery.isError ? (
        <ol className="space-y-2">
          {rules
            .slice()
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-2"
              >
                <span>
                  {rule.sortOrder + 1}. {rule.content["zh-HK"]}
                  {rule.isPublished ? null : "（已停用）"}
                </span>
                <button type="button" onClick={() => setDraft(draftFromRule(rule))}>
                  編輯
                </button>
              </li>
            ))}
          {rules.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">沒有領養規則資料</p>
          ) : null}
        </ol>
      ) : null}

      {draft ? (
        <form
          className="space-y-3 border border-[var(--color-border)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            upsertMutation.mutate(toRuleInput(draft));
          }}
        >
          <label className="block">
            規則內容（中文）
            <textarea
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.contentZh}
              onChange={(event) => setDraft({ ...draft, contentZh: event.target.value })}
              maxLength={500}
              required
            />
          </label>
          <label className="block">
            Rule content (English)
            <textarea
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.contentEn}
              onChange={(event) => setDraft({ ...draft, contentEn: event.target.value })}
              maxLength={500}
              required
            />
          </label>
          <label className="block max-w-[8rem]">
            排序
            <input
              type="number"
              min={0}
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.sortOrder}
              onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.isPublished}
              onChange={(event) => setDraft({ ...draft, isPublished: event.target.checked })}
            />
            在領養須知頁面顯示
          </label>
          {upsertMutation.isError ? (
            <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
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
