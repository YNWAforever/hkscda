import {
  AdoptionInstructionsManagement,
  type AdoptionInstructionEditorHandle,
} from "./AdoptionInstructionsManagement";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Plus, Search, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  ReorderFeesInput,
  UpdateFeeContentInput,
  CreateEstateInput,
  EstateContentFields,
  UpdateEstateInput,
  SetEstatePublicationInput,
} from "../../../lib/adoptionInformation/schemas";
import type {
  AdminAdoptionInformationPage,
  AdoptionFee,
  AdoptionInformationResource,
  AdoptionRuleContent,
  CareTopic,
  DogFriendlyEstate,
} from "../../../lib/adoptionInformation/types";
import { AdoptionRulesManagement } from "./AdoptionRulesManagement";
import { CareTopicsManagement } from "./CareTopicsManagement";
import { TablePager } from "../TablePager";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";

export const ADOPTION_INFORMATION_QUERY_KEY = ["admin-adoption-information"] as const;

export type AdoptionContentTab = AdoptionInformationResource | "page";

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
  activeTab: AdoptionContentTab;
  onTabChange: (tab: AdoptionContentTab) => void;
}) {
  return (
    <div className="flex gap-2 border-b border-[var(--color-border)]" role="tablist">
      {(
        [
          ["fees", "領養費用"],
          ["page", "頁面內容"],
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
  | { action: "fee-content"; input: UpdateFeeContentInput }
  | { action: "create-estate"; input: CreateEstateInput }
  | { action: "update-estate"; input: UpdateEstateInput }
  | { action: "publish-estate"; input: SetEstatePublicationInput }
  | { action: "delete-estate"; id: string }
  | { action: "move-fees"; input: ReorderFeesInput };

function AdoptionInformationManagementRuntime() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<AdoptionContentTab>("fees");
  const [pageDirty, setPageDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<AdoptionContentTab | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveProblem, setLeaveProblem] = useState<string | null>(null);
  const editorRef = useRef<AdoptionInstructionEditorHandle>(null);
  const reorderInFlight = useRef(false);
  const blocker = useBlocker({
    withResolver: true,
    disabled: !pageDirty,
    enableBeforeUnload: pageDirty,
    shouldBlockFn: ({ current, next }) => current.pathname !== next.pathname,
  });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = useMemo(
    () =>
      buildAdoptionInformationSearchParams({
        resource: activeTab === "page" ? "fees" : activeTab,
        q: query,
        page,
        pageSize: 50,
      }).toString(),
    [activeTab, page, query],
  );
  const informationQuery = useQuery({
    enabled: activeTab === "fees" || activeTab === "estates",
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
        return fetchAdminJson<{ fees: AdoptionFee[] }>("/api/admin/adoption-information", {
          method: "POST",
          body: JSON.stringify({ resource: "fee", command: "reorder", input: operation.input }),
        });
      }
      if (operation.action === "fee-content") {
        return fetchAdminJson<{ fee: AdoptionFee }>("/api/admin/adoption-information", {
          method: "POST",
          body: JSON.stringify({ resource: "fee", command: "content", input: operation.input }),
        });
      }
      return fetchAdminJson<{ estate: DogFriendlyEstate }>("/api/admin/adoption-information", {
        method: "POST",
        body: JSON.stringify({
          resource: "estate",
          command:
            operation.action === "create-estate"
              ? "create"
              : operation.action === "update-estate"
                ? "update"
                : "publication",
          input: operation.input,
        }),
      });
    },
    onSuccess: () => invalidateAdoptionInformationQueries(queryClient),
    onError: (_error, operation) => {
      if (
        operation.action === "update-estate" ||
        operation.action === "publish-estate" ||
        operation.action === "move-fees" ||
        operation.action === "fee-content"
      )
        return invalidateAdoptionInformationQueries(queryClient);
    },
  });

  const switchTab = (tab: AdoptionContentTab) => {
    setActiveTab(tab);
    setQuery("");
    setPage(1);
  };
  const handleTabChange = (tab: AdoptionContentTab) => {
    if (tab === activeTab) return;
    if (pageDirty) {
      setLeaveProblem(null);
      setPendingTab(tab);
      return;
    }
    switchTab(tab);
  };
  const cancelLeave = () => {
    if (leaving) return;
    setPendingTab(null);
    setLeaveProblem(null);
    if (blocker.status === "blocked") blocker.reset();
  };
  const completeLeave = () => {
    if (blocker.status === "blocked") blocker.proceed();
    else if (pendingTab) switchTab(pendingTab);
    setPendingTab(null);
    setLeaveProblem(null);
  };
  const decideLeave = async (decision: "save" | "discard" | "cancel") => {
    if (decision === "cancel") return cancelLeave();
    if (decision === "discard") return completeLeave();
    if (leaving) return;
    setLeaving(true);
    try {
      if (await editorRef.current?.saveDraft()) completeLeave();
      else setLeaveProblem("儲存未成功，仍留在原頁。請關閉此對話框檢查草稿錯誤。");
    } catch (error) {
      setLeaveProblem(error instanceof Error ? error.message : "儲存未成功，仍留在原頁。");
    } finally {
      setLeaving(false);
    }
  };
  const leaveDialog = (
    <AlertDialog
      open={pendingTab !== null || blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open) cancelLeave();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>尚有未儲存的頁面內容</AlertDialogTitle>
          <AlertDialogDescription>
            你可以先儲存草稿、捨棄本機修改，或取消並繼續編輯。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {leaveProblem && <p role="alert">{leaveProblem}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={leaving} onClick={() => cancelLeave()}>
            取消
          </AlertDialogCancel>
          <button type="button" disabled={leaving} onClick={() => void decideLeave("discard")}>
            捨棄並離開
          </button>
          <button type="button" disabled={leaving} onClick={() => void decideLeave("save")}>
            儲存並離開
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (activeTab === "page") {
    return (
      <div>
        <AdoptionContentTabs activeTab={activeTab} onTabChange={handleTabChange} />
        <AdoptionInstructionsManagement onDirtyChange={setPageDirty} editorRef={editorRef} />
        {leaveDialog}
      </div>
    );
  }

  if (activeTab === "rules") {
    return <AdoptionRulesManagement activeTab={activeTab} onTabChange={handleTabChange} />;
  }
  if (activeTab === "careTopics") {
    return <CareTopicsManagement activeTab={activeTab} onTabChange={handleTabChange} />;
  }

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
      onTabChange={handleTabChange}
      onQueryChange={(value) => {
        setQuery(value);
        setPage(1);
      }}
      onPageChange={setPage}
      onSaveFee={async (input) =>
        ((await mutation.mutateAsync({ action: "fee-content", input })) as { fee: AdoptionFee }).fee
      }
      onMoveFee={(input, direction) => {
        if (mutation.isPending || reorderInFlight.current) return;
        const pair = moveFeeWithinSpecies(informationQuery.data?.items ?? [], input.id, direction);
        if (pair.length !== 2 || !pair[0] || !pair[1]) return;
        reorderInFlight.current = true;
        void mutation
          .mutateAsync({
            action: "move-fees",
            input: {
              firstId: pair[0].id,
              secondId: pair[1].id,
              expectedVersions: { first: pair[0].version, second: pair[1].version },
            },
          })
          .catch(() => undefined)
          .finally(() => {
            reorderInFlight.current = false;
          });
      }}
      onCreateEstate={async (input) =>
        (
          (await mutation.mutateAsync({ action: "create-estate", input })) as {
            estate: DogFriendlyEstate;
          }
        ).estate
      }
      onUpdateEstate={async (input) =>
        (
          (await mutation.mutateAsync({ action: "update-estate", input })) as {
            estate: DogFriendlyEstate;
          }
        ).estate
      }
      onSetEstatePublication={async (input) =>
        (
          (await mutation.mutateAsync({ action: "publish-estate", input })) as {
            estate: DogFriendlyEstate;
          }
        ).estate
      }
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
  activeTab: AdoptionContentTab;
  data?: AdminAdoptionInformationPage;
  loading?: boolean;
  error?: string | null;
  query: string;
  page?: number;
  pending?: boolean;
  onTabChange?: (tab: AdoptionContentTab) => void;
  onQueryChange?: (value: string) => void;
  onPageChange?: (page: number) => void;
  onSaveFee?: (input: UpdateFeeContentInput) => Promise<AdoptionFee>;
  onMoveFee?: (fee: AdoptionFee, direction: -1 | 1) => void;
  onCreateEstate?: (input: CreateEstateInput) => Promise<DogFriendlyEstate>;
  onUpdateEstate?: (input: UpdateEstateInput) => Promise<DogFriendlyEstate>;
  onSetEstatePublication?: (input: SetEstatePublicationInput) => Promise<DogFriendlyEstate>;
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
  onCreateEstate,
  onUpdateEstate,
  onSetEstatePublication,
  onDeleteEstate,
}: ViewProps) {
  const fees = data?.items.filter(isFee) ?? [];
  const estates = data?.items.filter(isEstate) ?? [];

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
          <EstateEditor pending={pending} onCreate={onCreateEstate} />
          {estates.length ? (
            estates.map((estate) => (
              <EstateEditor
                key={estate.id}
                estate={estate}
                pending={pending}
                onUpdate={onUpdateEstate}
                onPublication={onSetEstatePublication}
                onDelete={onDeleteEstate}
              />
            ))
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">沒有可養狗屋苑資料</p>
          )}
        </section>
      ) : null}

      {activeTab === "estates" && onPageChange ? (
        <TablePager
          page={page}
          pageSize={50}
          total={data?.total}
          onPageChange={onPageChange}
          label="可養狗屋苑"
          failed={Boolean(error)}
        />
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
  onSave?: (input: UpdateFeeContentInput) => Promise<AdoptionFee>;
  onMove?: (fee: AdoptionFee, direction: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState(fee);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const knownVersion = useRef(fee.version);
  useEffect(() => {
    if (fee.version < knownVersion.current) return;
    if (dirty && fee.version !== knownVersion.current) {
      setConflict(true);
      return;
    }
    if (!dirty) {
      knownVersion.current = fee.version;
      setDraft(fee);
      setConflict(false);
    }
  }, [fee, dirty]);
  const save = async () => {
    if (!onSave || pending || conflict) return;
    try {
      const canonical = await onSave({
        id: fee.id,
        expectedVersion: knownVersion.current,
        itemName: draft.itemName,
        priceHkd: draft.priceHkd,
      });
      knownVersion.current = canonical.version;
      setDraft(canonical);
      setDirty(false);
      setConflict(false);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Fee version or order conflict"))
        setConflict(true);
    }
  };
  return (
    <div className="space-y-2">
      {conflict ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          領養費用已由其他人更新。請檢查最新版本後重新輸入。
          {fee.version <= knownVersion.current ? "最新資料暫未載入，請重新整理頁面。" : null}
          <button
            type="button"
            disabled={fee.version <= knownVersion.current}
            onClick={() => {
              knownVersion.current = fee.version;
              setDraft(fee);
              setDirty(false);
              setConflict(false);
            }}
          >
            載入最新費用
          </button>
        </p>
      ) : null}
      <div className="grid gap-2 md:grid-cols-[1fr_12rem_auto]">
        <input
          aria-label="費用項目"
          value={draft.itemName}
          onChange={(event) => {
            setDraft({ ...draft, itemName: event.target.value });
            setDirty(true);
          }}
          className={inputClass}
        />
        <input
          aria-label="價格"
          value={draft.priceHkd}
          onChange={(event) => {
            setDraft({ ...draft, priceHkd: event.target.value });
            setDirty(true);
          }}
          className={inputClass}
        />
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="上移"
            disabled={pending || dirty || conflict}
            onClick={() => onMove?.(draft, -1)}
          >
            <ChevronUp className="h-4 w-4" /> 上移
          </button>
          <button
            type="button"
            aria-label="下移"
            disabled={pending || dirty || conflict}
            onClick={() => onMove?.(draft, 1)}
          >
            <ChevronDown className="h-4 w-4" /> 下移
          </button>
          <button type="button" disabled={pending || conflict} onClick={() => void save()}>
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

function estateFields(estate: DogFriendlyEstate): EstateContentFields {
  return {
    estateName: estate.estateName,
    district: estate.district,
    notes: estate.notes,
    sortOrder: estate.sortOrder,
  };
}

export function EstateEditor({
  estate,
  pending,
  onCreate,
  onUpdate,
  onPublication,
  onDelete,
}: {
  estate?: DogFriendlyEstate;
  pending: boolean;
  onCreate?: (input: CreateEstateInput) => Promise<DogFriendlyEstate>;
  onUpdate?: (input: UpdateEstateInput) => Promise<DogFriendlyEstate>;
  onPublication?: (input: SetEstatePublicationInput) => Promise<DogFriendlyEstate>;
  onDelete?: (id: string) => void;
}) {
  const [createId, setCreateId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<EstateContentFields>(
    estate ? estateFields(estate) : { estateName: "", district: "", notes: null, sortOrder: 0 },
  );
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [published, setPublished] = useState(estate?.isPublished ?? false);
  const knownVersion = useRef(estate?.version ?? 0);

  useEffect(() => {
    if (!estate || estate.version < knownVersion.current) return;
    if (dirty && estate.version !== knownVersion.current) {
      setConflict(true);
      return;
    }
    if (!dirty) {
      knownVersion.current = estate.version;
      setDraft(estateFields(estate));
      setPublished(estate.isPublished);
      setConflict(false);
    }
  }, [estate, dirty]);

  const acceptCanonical = (saved: DogFriendlyEstate) => {
    knownVersion.current = saved.version;
    setDraft(estateFields(saved));
    setPublished(saved.isPublished);
    setDirty(false);
    setConflict(false);
  };

  const save = async () => {
    if (pending || conflict) return;
    try {
      if (estate) {
        if (!onUpdate) return;
        acceptCanonical(
          await onUpdate({ id: estate.id, expectedVersion: knownVersion.current, fields: draft }),
        );
      } else {
        if (!onCreate) return;
        await onCreate({ id: createId, ...draft });
        setCreateId(crypto.randomUUID());
        setDraft({ estateName: "", district: "", notes: null, sortOrder: 0 });
        setDirty(false);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Estate version conflict"))
        setConflict(true);
    }
  };

  const togglePublication = async () => {
    if (!estate || !onPublication || pending || dirty || conflict) return;
    try {
      acceptCanonical(
        await onPublication({
          id: estate.id,
          expectedVersion: knownVersion.current,
          isPublished: !published,
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("Estate version conflict"))
        setConflict(true);
    }
  };

  return (
    <div className="space-y-2 border-b border-[var(--color-border)] pb-4">
      <h2 className="font-bold">{estate ? "編輯屋苑" : "新增屋苑"}</h2>
      {conflict && estate ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          此屋苑已由其他人更新。請先檢查最新版本，再重新輸入你的修改。
          {estate.version <= knownVersion.current ? "最新資料暫未載入，請重新整理頁面。" : null}
          <button
            type="button"
            disabled={estate.version <= knownVersion.current}
            onClick={() => {
              knownVersion.current = estate.version;
              setDraft(estateFields(estate));
              setPublished(estate.isPublished);
              setDirty(false);
              setConflict(false);
            }}
          >
            載入最新版本
          </button>
        </p>
      ) : null}
      <div className="grid gap-2 md:grid-cols-3">
        <input
          aria-label="屋苑名稱"
          value={draft.estateName}
          onChange={(event) => {
            setDraft({ ...draft, estateName: event.target.value });
            setDirty(true);
          }}
          className={inputClass}
          placeholder="屋苑名稱"
        />
        <input
          aria-label="地區"
          value={draft.district}
          onChange={(event) => {
            setDraft({ ...draft, district: event.target.value });
            setDirty(true);
          }}
          className={inputClass}
          placeholder="地區"
        />
        <input
          aria-label="備註"
          value={draft.notes ?? ""}
          onChange={(event) => {
            setDraft({ ...draft, notes: event.target.value || null });
            setDirty(true);
          }}
          className={inputClass}
          placeholder="備註（選填）"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || conflict || !draft.estateName.trim() || !draft.district.trim()}
          onClick={() => void save()}
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
              disabled={pending || dirty || conflict}
              onClick={() => void togglePublication()}
            >
              {published ? "取消發佈" : "發佈"}
            </button>
            <button type="button" disabled={pending} onClick={() => onDelete?.(estate.id)}>
              <Trash2 className="inline h-4 w-4" /> 刪除
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function isFee(
  item: AdoptionFee | DogFriendlyEstate | AdoptionRuleContent | CareTopic,
): item is AdoptionFee {
  return "itemName" in item;
}

function isEstate(
  item: AdoptionFee | DogFriendlyEstate | AdoptionRuleContent | CareTopic,
): item is DogFriendlyEstate {
  return "estateName" in item;
}

export function moveFeeWithinSpecies(
  items: Array<AdoptionFee | DogFriendlyEstate | AdoptionRuleContent | CareTopic>,
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

const inputClass =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm";
