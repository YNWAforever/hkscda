import { Button } from "@/components/ui/button";
import type { AdoptionContentTab } from "./AdoptionInformationManagement";
import { TablePager } from "../TablePager";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  AdminAdoptionInformationPage,
  AdoptionAnimalType,
  CareTopic,
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

export type CareTopicDraft = {
  id?: string;
  animalType: AdoptionAnimalType;
  labelZh: string;
  labelEn: string;
  contentZh: string;
  contentEn: string;
  sortOrder: number;
  isPublished: boolean;
};

function draftFromTopic(defaultAnimalType: AdoptionAnimalType, topic?: CareTopic): CareTopicDraft {
  return {
    id: topic?.id,
    animalType: topic?.animalType ?? defaultAnimalType,
    labelZh: topic?.label["zh-HK"] ?? "",
    labelEn: topic?.label.en ?? "",
    contentZh: topic?.content["zh-HK"] ?? "",
    contentEn: topic?.content.en ?? "",
    sortOrder: topic?.sortOrder ?? 0,
    isPublished: topic?.isPublished ?? true,
  };
}

export function toCareTopicInput(draft: CareTopicDraft) {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    animalType: draft.animalType,
    label: { "zh-HK": draft.labelZh, en: draft.labelEn },
    content: { "zh-HK": draft.contentZh, en: draft.contentEn },
    sortOrder: draft.sortOrder,
    isPublished: draft.isPublished,
  };
}

export function CareTopicsManagement({
  activeTab,
  onTabChange,
}: {
  activeTab: AdoptionContentTab;
  onTabChange: (tab: AdoptionContentTab) => void;
}) {
  const common = useAdminCopy(adoptionRulesCopy);
  const copy = common.careTopics;
  const { language } = useAdminLanguage();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [species, setSpecies] = useState<AdoptionAnimalType>("cat");
  const [draft, setDraft] = useState<CareTopicDraft | null>(null);

  const topicsQuery = useQuery({
    queryKey: [...ADOPTION_INFORMATION_QUERY_KEY, "careTopics", page, species],
    queryFn: () =>
      fetchAdminJson<AdminAdoptionInformationPage>(
        `/api/admin/adoption-information?resource=careTopics&page=${page}&pageSize=50&animalType=${species}`,
      ),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: ReturnType<typeof toCareTopicInput>) =>
      fetchAdminJson<{ careTopic: CareTopic }>("/api/admin/adoption-information", {
        method: "POST",
        body: JSON.stringify({ resource: "careTopic", input }),
      }),
    onSuccess: () => {
      setDraft(null);
      return invalidateAdoptionInformationQueries(queryClient);
    },
  });

  const topics = ((topicsQuery.data?.items ?? []) as CareTopic[]).filter(
    (topic) => topic.animalType === species,
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">{common.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
      </div>

      <AdoptionContentTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="flex gap-2" role="tablist" aria-label={copy.speciesLabel}>
        {(["cat", "dog"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={species === value}
            onClick={() => {
              setSpecies(value);
              setPage(1);
            }}
            className="px-3 py-2 text-sm font-semibold aria-selected:underline"
          >
            {value === "cat" ? copy.cats : copy.dogs}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">
          {species === "cat" ? copy.catHeading : copy.dogHeading}
        </h2>
        <button
          type="button"
          className="btn-primary min-h-11 px-4"
          onClick={() => setDraft(draftFromTopic(species))}
        >
          {copy.add}
        </button>
      </div>

      {topicsQuery.isLoading ? <p aria-live="polite">{copy.loading}</p> : null}
      {topicsQuery.isError ? (
        <LoadFailure
          error={topicsQuery.error}
          onRetry={() => void topicsQuery.refetch()}
          title={copy.loadFailed}
        />
      ) : null}

      {!topicsQuery.isLoading && !topicsQuery.isError ? (
        <ul className="space-y-2">
          {topics
            .slice()
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((topic) => (
              <li
                key={topic.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-2"
              >
                <span>
                  {localizedText(topic.label["zh-HK"], topic.label.en, language)}
                  {topic.isPublished ? null : common.list.disabledSuffix}
                </span>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setDraft(draftFromTopic(species, topic))}
                >
                  {common.list.edit}
                </Button>
              </li>
            ))}
          {topics.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{copy.empty}</p>
          ) : null}
        </ul>
      ) : null}

      {topicsQuery.data && (
        <TablePager
          page={page}
          pageSize={50}
          total={topicsQuery.data.total}
          onPageChange={setPage}
          label={common.list.pager}
        />
      )}
      {draft ? (
        <CareTopicForm
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={() => upsertMutation.mutate(toCareTopicInput(draft))}
          onCancel={() => setDraft(null)}
          pending={upsertMutation.isPending}
          failed={upsertMutation.isError}
        />
      ) : null}
    </div>
  );
}

export function CareTopicForm({
  draft,
  onDraftChange,
  onSubmit,
  onCancel,
  pending,
  failed,
}: {
  draft: CareTopicDraft;
  onDraftChange: (draft: CareTopicDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  failed: boolean;
}) {
  const common = useAdminCopy(adoptionRulesCopy);
  const copy = common.careTopics;
  return (
    <form
      className="space-y-3 border border-[var(--color-border)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="block">
        {copy.species}
        <select
          className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
          value={draft.animalType}
          onChange={(event) =>
            onDraftChange({ ...draft, animalType: event.target.value as AdoptionAnimalType })
          }
        >
          <option value="cat">{copy.catOption}</option>
          <option value="dog">{copy.dogOption}</option>
        </select>
      </label>
      <label className="block">
        {copy.labelZh}
        <input
          className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
          value={draft.labelZh}
          onChange={(event) => onDraftChange({ ...draft, labelZh: event.target.value })}
          maxLength={40}
          required
        />
      </label>
      <label className="block">
        {copy.labelEn}
        <input
          className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
          value={draft.labelEn}
          onChange={(event) => onDraftChange({ ...draft, labelEn: event.target.value })}
          maxLength={40}
          required
        />
      </label>
      <label className="block">
        {copy.contentZh}
        <textarea
          className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
          value={draft.contentZh}
          onChange={(event) => onDraftChange({ ...draft, contentZh: event.target.value })}
          maxLength={1000}
          required
        />
      </label>
      <label className="block">
        {copy.contentEn}
        <textarea
          className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
          value={draft.contentEn}
          onChange={(event) => onDraftChange({ ...draft, contentEn: event.target.value })}
          maxLength={1000}
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
