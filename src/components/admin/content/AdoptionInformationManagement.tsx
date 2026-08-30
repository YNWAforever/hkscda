import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Search, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  AdminAdoptionInformationPage,
  AdoptionFee,
  AdoptionInformationResource,
  DogFriendlyEstate,
} from "../../../lib/adoptionInformation/types";

export const ADOPTION_INFORMATION_QUERY_KEY = ["admin-adoption-information"] as const;

type InitialData = {
  fees: AdminAdoptionInformationPage;
  estates: AdminAdoptionInformationPage;
};

type SearchInput = {
  resource: AdoptionInformationResource;
  q?: string;
  page?: number;
  pageSize?: number;
};

export function buildAdoptionInformationSearchParams(input: SearchInput) {
  const params = new URLSearchParams({
    resource: input.resource,
    page: String(Math.max(1, Math.trunc(input.page ?? 1))),
    pageSize: String(Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 50)))),
  });
  if (input.q?.trim()) params.set("q", input.q.trim());
  return params;
}

export function invalidateAdoptionInformationQueries(client: {
  invalidateQueries(input: { queryKey: readonly string[] }): Promise<unknown>;
}) {
  return client.invalidateQueries({ queryKey: ADOPTION_INFORMATION_QUERY_KEY });
}

export function AdoptionInformationManagement({ initialData }: { initialData?: InitialData }) {
  if (initialData) {
    return <AdoptionInformationManagementView activeTab="fees" data={initialData.fees} query="" />;
  }
  return <AdoptionInformationManagementRuntime />;
}

export function AdoptionContentTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: AdoptionInformationResource;
  onTabChange: (tab: AdoptionInformationResource) => void;
}) {
  return (
    <div className="flex gap-2 border-b border-[var(--color-border)]" role="tablist">
      {(
        [
          ["fees", "領養費用"],
          ["estates", "可養狗屋苑"],
          ["rules", "領養規則"],
          ["careTopics", "動物照顧須知"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={activeTab === value}
          onClick={() => onTabChange(value)}
          className="px-4 py-3 text-sm font-semibold aria-selected:border-b-2 aria-selected:border-[var(--color-primary)] aria-selected:text-[var(--color-primary)]"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type MutationInput =
  | { action: "fee"; input: AdoptionFee }
  | { action: "estate"; input: DogFriendlyEstate }
  | { action: "delete-estate"; id: string }
  | { action: "move-fees"; inputs: AdoptionFee[]; temporarySortOrder: number };

function AdoptionInformationManagementRuntime() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<AdoptionInformationResource>("fees");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = useMemo(
    () =>
      buildAdoptionInformationSearchParams({
        resource: activeTab,
        q: query,
        page,
        pageSize: 50,
      }).toString(),
    [activeTab, page, query],
  );
  const informationQuery = useQuery({
    queryKey: [...ADOPTION_INFORMATION_QUERY_KEY, search],
    queryFn: () =>
      fetchAdminJson<AdminAdoptionInformationPage>("/api/admin/adoption-information?" + search),
  });
  const mutation = useMutation({
    mutationFn: async (operation: MutationInput) => {
      if (operation.action === "delete-estate") {
        return fetchAdminJson("/api/admin/adoption-information", {
          method: "DELETE",
          body: JSON.stringify({ id: operation.id }),
        });
      }
      if (operation.action === "move-fees") {
        const results = [];
        for (const input of buildFeeMoveSequence(operation.inputs, operation.temporarySortOrder)) {
          results.push(
            await fetchAdminJson("/api/admin/adoption-information", {
              method: "POST",
              body: JSON.stringify({ resource: "fee", input }),
            }),
          );
        }
        return results;
      }
      return fetchAdminJson("/api/admin/adoption-information", {
        method: "POST",
        body: JSON.stringify({
          resource: operation.action === "estate" ? "estate" : "fee",
          input: operation.input,
        }),
      });
    },
    onSuccess: () => invalidateAdoptionInformationQueries(queryClient),
  });

  return (
    <AdoptionInformationManagementView
      activeTab={activeTab}
      data={informationQuery.data}
      loading={informationQuery.isLoading}
      error={
        (informationQuery.error instanceof Error ? informationQuery.error.message : null) ??
        (mutation.error instanceof Error ? mutation.error.message : null)
      }
      query={query}
      page={page}
      pending={mutation.isPending}
      onTabChange={(tab) => {
        setActiveTab(tab);
        setQuery("");
        setPage(1);
      }}
      onQueryChange={(value) => {
        setQuery(value);
        setPage(1);
      }}
      onPageChange={setPage}
      onSaveFee={(input) => mutation.mutate({ action: "fee", input })}
      onMoveFee={(input, direction) => {
        const updates = moveFeeWithinSpecies(
          informationQuery.data?.items ?? [],
          input.id,
          direction,
        );
        const temporarySortOrder =
          Math.max(
            -1,
            ...(informationQuery.data?.items ?? [])
              .filter(
                (item): item is AdoptionFee => isFee(item) && item.animalType === input.animalType,
              )
              .map((fee) => fee.sortOrder),
          ) + 1;
        if (updates.length)
          mutation.mutate({ action: "move-fees", inputs: updates, temporarySortOrder });
      }}
      onSaveEstate={(input) => mutation.mutate({ action: "estate", input })}
      onDeleteEstate={(id) => {
        // Irreversible and triggered from an inline row button; name the estate
        // so the operator can confirm they hit the row they meant.
        const estate = informationQuery.data?.items.find((item) => item.id === id);
        const label =
          estate && "estateName" in estate ? (estate as { estateName?: string }).estateName : null;
        if (!window.confirm(`確定刪除「${label ?? "此屋苑"}」？此操作無法復原。`)) return;
        mutation.mutate({ action: "delete-estate", id });
      }}
    />
  );
}

type ViewProps = {
  activeTab: AdoptionInformationResource;
  data?: AdminAdoptionInformationPage;
  loading?: boolean;
  error?: string | null;
  query: string;
  page?: number;
  pending?: boolean;
  onTabChange?: (tab: AdoptionInformationResource) => void;
  onQueryChange?: (value: string) => void;
  onPageChange?: (page: number) => void;
  onSaveFee?: (fee: AdoptionFee) => void;
  onMoveFee?: (fee: AdoptionFee, direction: -1 | 1) => void;
  onSaveEstate?: (estate: DogFriendlyEstate) => void;
  onDeleteEstate?: (id: string) => void;
};

export function AdoptionInformationManagementView({
  activeTab,
  data,
  loading = false,
  error,
  query,
  page = 1,
  pending = false,
  onTabChange,
  onQueryChange,
  onPageChange,
  onSaveFee,
  onMoveFee,
  onSaveEstate,
  onDeleteEstate,
}: ViewProps) {
  const fees = data?.items.filter(isFee) ?? [];
  const estates = data?.items.filter(isEstate) ?? [];
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 50));

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">領養</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">領養資料管理</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          管理公開領養費用及可養狗屋苑參考名單。
        </p>
        <a
          href="/admin/content/adoption-guides"
          className="mt-3 inline-flex rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)]"
        >
          {"\u9818\u990a\u5f8c\u6307\u5357\u7248\u672c"}
        </a>
      </div>

      <AdoptionContentTabs activeTab={activeTab} onTabChange={(tab) => onTabChange?.(tab)} />

      {activeTab === "estates" ? (
        <label className="block max-w-xl space-y-1 text-sm font-semibold">
          <span className="inline-flex items-center gap-2">
            <Search className="h-4 w-4" /> 搜尋屋苑
          </span>
          <input
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            maxLength={180}
            className={inputClass}
            placeholder="屋苑或地區"
          />
        </label>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
      {loading ? <p aria-live="polite">載入領養資料中…</p> : null}

      {!loading && activeTab === "fees" ? (
        <section className="space-y-6" aria-label="領養費用">
          {(["dog", "cat"] as const).map((animalType) => (
            <div key={animalType} className="space-y-3">
              <h2 className="text-lg font-bold">{animalType === "dog" ? "狗隻" : "貓隻"}</h2>
              {fees.filter((fee) => fee.animalType === animalType).length ? (
                fees
                  .filter((fee) => fee.animalType === animalType)
                  .map((fee) => (
                    <FeeEditor
                      key={fee.id}
                      fee={fee}
                      pending={pending}
                      onSave={onSaveFee}
                      onMove={onMoveFee}
                    />
                  ))
              ) : (
                <p className="text-sm text-[var(--color-text-muted)]">沒有領養費用資料</p>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {!loading && activeTab === "estates" ? (
        <section className="space-y-4" aria-label="可養狗屋苑">
          <EstateEditor pending={pending} onSave={onSaveEstate} />
          {estates.length ? (
            estates.map((estate) => (
              <EstateEditor
                key={estate.id}
                estate={estate}
                pending={pending}
                onSave={onSaveEstate}
                onDelete={onDeleteEstate}
              />
            ))
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">沒有可養狗屋苑資料</p>
          )}
        </section>
      ) : null}

      {activeTab === "estates" && pageCount > 1 ? (
        <div className="flex items-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>
            上一頁
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => onPageChange?.(page + 1)}
          >
            下一頁
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FeeEditor({
  fee,
  pending,
  onSave,
  onMove,
}: {
  fee: AdoptionFee;
  pending: boolean;
  onSave?: (fee: AdoptionFee) => void;
  onMove?: (fee: AdoptionFee, direction: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState(fee);
  return (
    <div className="grid gap-2 md:grid-cols-[1fr_12rem_auto]">
      <input
        aria-label="費用項目"
        value={draft.itemName}
        onChange={(event) => setDraft({ ...draft, itemName: event.target.value })}
        className={inputClass}
      />
      <input
        aria-label="價格"
        value={draft.priceHkd}
        onChange={(event) => setDraft({ ...draft, priceHkd: event.target.value })}
        className={inputClass}
      />
      <div className="flex gap-2">
        <button type="button" aria-label="上移" onClick={() => onMove?.(draft, -1)}>
          <ChevronUp className="h-4 w-4" /> 上移
        </button>
        <button type="button" aria-label="下移" onClick={() => onMove?.(draft, 1)}>
          <ChevronDown className="h-4 w-4" /> 下移
        </button>
        <button type="button" disabled={pending} onClick={() => onSave?.(draft)}>
          儲存
        </button>
      </div>
    </div>
  );
}

function EstateEditor({
  estate,
  pending,
  onSave,
  onDelete,
}: {
  estate?: DogFriendlyEstate;
  pending: boolean;
  onSave?: (estate: DogFriendlyEstate) => void;
  onDelete?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<DogFriendlyEstate>(
    estate ?? {
      id: crypto.randomUUID(),
      estateName: "",
      district: "",
      notes: null,
      sortOrder: 0,
      isPublished: false,
    },
  );
  return (
    <div className="space-y-2 border-b border-[var(--color-border)] pb-4">
      <h2 className="font-bold">{estate ? "編輯屋苑" : "新增屋苑"}</h2>
      <div className="grid gap-2 md:grid-cols-3">
        <input
          aria-label="屋苑名稱"
          value={draft.estateName}
          onChange={(event) => setDraft({ ...draft, estateName: event.target.value })}
          className={inputClass}
          placeholder="屋苑名稱"
        />
        <input
          aria-label="地區"
          value={draft.district}
          onChange={(event) => setDraft({ ...draft, district: event.target.value })}
          className={inputClass}
          placeholder="地區"
        />
        <input
          aria-label="備註"
          value={draft.notes ?? ""}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })}
          className={inputClass}
          placeholder="備註（選填）"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !draft.estateName.trim() || !draft.district.trim()}
          onClick={() => onSave?.(draft)}
        >
          {estate ? (
            "編輯"
          ) : (
            <>
              <Plus className="inline h-4 w-4" /> 新增屋苑
            </>
          )}
        </button>
        {estate ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => onSave?.({ ...draft, isPublished: !draft.isPublished })}
            >
              {draft.isPublished ? "取消發佈" : "發佈"}
            </button>
            <button type="button" disabled={pending} onClick={() => onDelete?.(draft.id)}>
              <Trash2 className="inline h-4 w-4" /> 刪除
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function isFee(item: AdoptionFee | DogFriendlyEstate): item is AdoptionFee {
  return "animalType" in item;
}

function isEstate(item: AdoptionFee | DogFriendlyEstate): item is DogFriendlyEstate {
  return "estateName" in item;
}

export function moveFeeWithinSpecies(
  items: Array<AdoptionFee | DogFriendlyEstate>,
  id: string,
  direction: -1 | 1,
) {
  const current = items.find((item): item is AdoptionFee => isFee(item) && item.id === id);
  if (!current) return [];
  const scoped = items
    .filter((item): item is AdoptionFee => isFee(item) && item.animalType === current.animalType)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const index = scoped.findIndex((fee) => fee.id === id);
  const target = scoped[index + direction];
  if (!target) return [];
  return [
    { ...current, sortOrder: target.sortOrder },
    { ...target, sortOrder: current.sortOrder },
  ];
}

export function buildFeeMoveSequence(inputs: AdoptionFee[], temporarySortOrder: number) {
  const [current, target] = inputs;
  if (!current || !target) return [];

  return [{ ...current, sortOrder: temporarySortOrder }, target, current];
}

const inputClass =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm";
