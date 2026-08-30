import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  AdminAdoptionInformationPage,
  AdoptionAnimalType,
  AdoptionInformationResource,
  CareTopic,
} from "../../../lib/adoptionInformation/types";
import {
  ADOPTION_INFORMATION_QUERY_KEY,
  AdoptionContentTabs,
  invalidateAdoptionInformationQueries,
} from "./AdoptionInformationManagement";

type CareTopicDraft = {
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
  activeTab: AdoptionInformationResource;
  onTabChange: (tab: AdoptionInformationResource) => void;
}) {
  const queryClient = useQueryClient();
  const [species, setSpecies] = useState<AdoptionAnimalType>("cat");
  const [draft, setDraft] = useState<CareTopicDraft | null>(null);

  const topicsQuery = useQuery({
    queryKey: [...ADOPTION_INFORMATION_QUERY_KEY, "careTopics"],
    queryFn: () =>
      fetchAdminJson<AdminAdoptionInformationPage>(
        "/api/admin/adoption-information?resource=careTopics&page=1&pageSize=50",
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
        <p className="text-sm font-semibold text-[var(--color-primary)]">領養</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">動物照顧須知管理</h1>
      </div>

      <AdoptionContentTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="flex gap-2" role="tablist" aria-label="物種">
        {(["cat", "dog"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={species === value}
            onClick={() => setSpecies(value)}
            className="px-3 py-2 text-sm font-semibold aria-selected:underline"
          >
            {value === "cat" ? "貓隻" : "狗隻"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{species === "cat" ? "養貓需知" : "養狗需知"}</h2>
        <button
          type="button"
          className="btn-primary min-h-11 px-4"
          onClick={() => setDraft(draftFromTopic(species))}
        >
          新增主題
        </button>
      </div>

      {topicsQuery.isLoading ? <p aria-live="polite">載入照顧須知中…</p> : null}
      {topicsQuery.isError ? (
        <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
          未能載入照顧須知，請重新整理頁面。
        </p>
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
                  {topic.label["zh-HK"]}
                  {topic.isPublished ? null : "（已停用）"}
                </span>
                <button type="button" onClick={() => setDraft(draftFromTopic(species, topic))}>
                  編輯
                </button>
              </li>
            ))}
          {topics.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">沒有照顧須知資料</p>
          ) : null}
        </ul>
      ) : null}

      {draft ? (
        <form
          className="space-y-3 border border-[var(--color-border)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            upsertMutation.mutate(toCareTopicInput(draft));
          }}
        >
          <label className="block">
            物種
            <select
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.animalType}
              onChange={(event) =>
                setDraft({ ...draft, animalType: event.target.value as AdoptionAnimalType })
              }
            >
              <option value="cat">貓隻</option>
              <option value="dog">狗隻</option>
            </select>
          </label>
          <label className="block">
            主題名稱（中文）
            <input
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.labelZh}
              onChange={(event) => setDraft({ ...draft, labelZh: event.target.value })}
              maxLength={40}
              required
            />
          </label>
          <label className="block">
            Topic label (English)
            <input
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.labelEn}
              onChange={(event) => setDraft({ ...draft, labelEn: event.target.value })}
              maxLength={40}
              required
            />
          </label>
          <label className="block">
            內容（中文）
            <textarea
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.contentZh}
              onChange={(event) => setDraft({ ...draft, contentZh: event.target.value })}
              maxLength={1000}
              required
            />
          </label>
          <label className="block">
            Content (English)
            <textarea
              className="mt-1 block w-full border border-[var(--color-border)] px-3 py-2"
              value={draft.contentEn}
              onChange={(event) => setDraft({ ...draft, contentEn: event.target.value })}
              maxLength={1000}
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
