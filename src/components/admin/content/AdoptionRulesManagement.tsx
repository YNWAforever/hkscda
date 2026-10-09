import type { AdoptionContentTab } from "./AdoptionInformationManagement";
import { TablePager } from "../TablePager";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  AdminAdoptionInformationPage,
  AdoptionRuleContent,
} from "../../../lib/adoptionInformation/types";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { localizedText } from "../i18n/localizedText";
import { LoadFailure } from "../LoadFailure";
import { adoptionRulesCopy } from "./adoptionRulesCopy";
import {
  ADOPTION_INFORMATION_QUERY_KEY,
  AdoptionContentTabs,
  invalidateAdoptionInformationQueries,
} from "./AdoptionInformationManagement";

export type RuleDraft = {
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
  activeTab: AdoptionContentTab;
  onTabChange: (tab: AdoptionContentTab) => void;
}) {
  const common = useAdminCopy(adoptionRulesCopy);
  const copy = common.rules;
  const { language } = useAdminLanguage();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<RuleDraft | null>(null);

  const rulesQuery = useQuery({
    queryKey: [...ADOPTION_INFORMATION_QUERY_KEY, "rules", page],
    queryFn: () =>
      fetchAdminJson<AdminAdoptionInformationPage>(
        `/api/admin/adoption-information?resource=rules&page=${page}&pageSize=50`,
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
        <p className="text-sm font-semibold text-[var(--color-primary)]">{common.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
      </div>

      <AdoptionContentTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{copy.heading}</h2>
        <button
          type="button"
          className="btn-primary min-h-11 px-4"
          onClick={() => setDraft(draftFromRule())}
        >
          {copy.add}
        </button>
      </div>

      {rulesQuery.isLoading ? <p aria-live="polite">{copy.loading}</p> : null}
      {rulesQuery.isError ? (
        <LoadFailure
          error={rulesQuery.error}
          onRetry={() => void rulesQuery.refetch()}
          title={copy.loadFailed}
        />
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
                  {rule.sortOrder + 1}.{" "}
                  {localizedText(rule.content["zh-HK"], rule.content.en, language)}
                  {rule.isPublished ? null : common.list.disabledSuffix}
                </span>
                <button type="button" onClick={() => setDraft(draftFromRule(rule))}>
                  {common.list.edit}
                </button>
              </li>
            ))}
          {rules.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{copy.empty}</p>
          ) : null}
        </ol>
      ) : null}

      {rulesQuery.data && (
        <TablePager
          page={page}
          pageSize={50}
          total={rulesQuery.data.total}
          onPageChange={setPage}
          label={common.list.pager}
        />
      )}
      {draft ? (
        <AdoptionRuleForm
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={() => upsertMutation.mutate(toRuleInput(draft))}
          onCancel={() => setDraft(null)}
          pending={upsertMutation.isPending}
          failed={upsertMutation.isError}
        />
      ) : null}
    </div>
  );
}

export function AdoptionRuleForm({
  draft,
  onDraftChange,
  onSubmit,
  onCancel,
  pending,
  failed,
}: {
  draft: RuleDraft;
  onDraftChange: (draft: RuleDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  failed: boolean;
}) {
  const common = useAdminCopy(adoptionRulesCopy);
  const copy = common.rules;
  return (
    <form
      className="space-y-3 border border-[var(--color-border)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="block">
        {copy.contentZh}
        <textarea
          className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
          value={draft.contentZh}
          onChange={(event) => onDraftChange({ ...draft, contentZh: event.target.value })}
          maxLength={500}
          required
        />
      </label>
      <label className="block">
        {copy.contentEn}
        <textarea
          className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
          value={draft.contentEn}
          onChange={(event) => onDraftChange({ ...draft, contentEn: event.target.value })}
          maxLength={500}
          required
        />
      </label>
      <label className="block max-w-[8rem]">
        {common.form.sortOrder}
        <input
          type="number"
          min={0}
          className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
          value={draft.sortOrder}
          onChange={(event) => onDraftChange({ ...draft, sortOrder: Number(event.target.value) })}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={draft.isPublished}
          onChange={(event) => onDraftChange({ ...draft, isPublished: event.target.checked })}
        />
        {common.form.showOnPage}
      </label>
      {failed ? (
        <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
          {common.form.saveFailed}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button type="submit" className="btn-primary min-h-11 px-4" disabled={pending}>
          {common.form.save}
        </button>
        <button type="button" className="btn-secondary min-h-11 px-4" onClick={onCancel}>
          {common.form.cancel}
        </button>
      </div>
    </form>
  );
}
