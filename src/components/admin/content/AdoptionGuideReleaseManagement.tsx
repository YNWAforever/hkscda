import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import { adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
import type { DocumentAsset } from "../../../lib/documents/types";
import { getSupabaseClient } from "../../../lib/supabase";
import type { AdoptionGuideMutationInput } from "../../../lib/adoptionGuideReleases/repository.server";
import type {
  AdoptionGuidePreview,
  AdoptionGuideRelease,
  AdoptionGuideReleaseState,
  AdoptionGuideSpecies,
} from "../../../lib/adoptionGuideReleases/types";
import { uploadDocumentPdf } from "./documentUpload";
import {
  ADOPTION_GUIDE_EDITOR_STEPS,
  createAdoptionGuideReleaseRuntimeController,
  evaluateAdoptionGuideReleaseWorkflow,
  fetchAllAdoptionGuideAssets,
  isAdoptionGuideReleaseContextLocked,
  fetchAdoptionGuideReleases,
  mutateAdoptionGuideRelease,
  presentAdoptionGuideReadiness,
  resolveLinkedAdoptionGuideRelease,
  selectAdoptionGuideAssetsForLanguage,
  type AdoptionGuideReleaseMutationOperation,
  type ReleaseFilters,
} from "./adoptionGuideReleaseLogic";

type DocumentListResponse = {
  items: DocumentAsset[];
  total: number;
  page: number;
  pageSize: number;
};
type AssetLanguage = "zh-HK" | "en";

type DraftFields = Omit<AdoptionGuideMutationInput, "expectedVersion">;

const initialDraft: DraftFields = {
  topic: "post_adoption",
  species: "cat",
  zhHkAssetId: null,
  enAssetId: null,
  knowledgeTitle: "",
  knowledgeTopic: "",
  knowledgeShortIntro: "",
  knowledgeSourceName: null,
  sortOrder: 0,
};

function draftFromRelease(release: AdoptionGuideRelease | null): DraftFields {
  if (!release) return initialDraft;
  return {
    topic: release.topic,
    species: release.species,
    zhHkAssetId: release.zhHkAssetId,
    enAssetId: release.enAssetId,
    knowledgeTitle: release.knowledgeTitle,
    knowledgeTopic: release.knowledgeTopic,
    knowledgeShortIntro: release.knowledgeShortIntro,
    knowledgeSourceName: release.knowledgeSourceName,
    sortOrder: release.sortOrder,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

export function AdoptionGuideReleaseManagement({
  initialReleaseId,
}: {
  initialReleaseId?: string;
}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ReleaseFilters>({
    species: "all",
    state: "all",
    page: 1,
    pageSize: 25,
  });
  const [selectedId, setSelectedId] = useState<string | null>(initialReleaseId ?? null);
  const [localError, setLocalError] = useState<string>();
  const runtimeController = useMemo(
    () => createAdoptionGuideReleaseRuntimeController({ queryClient, setLocalError }),
    [queryClient],
  );

  const identityQuery = useQuery(adminIdentityQueryOptions());
  const releasesQuery = useQuery({
    queryKey: ["adoption-guide-releases", filters],
    queryFn: () => fetchAdoptionGuideReleases(filters),
  });
  const linkedReleaseQuery = useQuery({
    queryKey: ["adoption-guide-releases", initialReleaseId, "linked"],
    enabled: Boolean(initialReleaseId),
    queryFn: () =>
      fetchAdminJson<AdoptionGuideRelease>(
        `/api/admin/adoption-guide-releases/${encodeURIComponent(initialReleaseId!)}`,
      ),
  });
  const assetsQuery = useQuery({
    queryKey: ["documents", "adoption-guide-options"],
    queryFn: () =>
      fetchAllAdoptionGuideAssets((page, pageSize) =>
        fetchAdminJson<DocumentListResponse>(
          `/api/admin/documents?kind=adoption_guide&page=${page}&pageSize=${pageSize}`,
        ),
      ),
  });

  const releases = releasesQuery.data?.items ?? [];
  const selected = resolveLinkedAdoptionGuideRelease(releases, selectedId, linkedReleaseQuery.data);
  const previewQuery = useQuery({
    queryKey: ["adoption-guide-releases", selected?.id, "preview"],
    enabled: Boolean(selected),
    queryFn: () =>
      fetchAdminJson<AdoptionGuidePreview>(
        `/api/admin/adoption-guide-releases/${encodeURIComponent(selected!.id)}/preview`,
      ),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      fetchAdminJson<AdoptionGuideRelease>("/api/admin/adoption-guide-releases", {
        method: "POST",
        body: JSON.stringify(initialDraft),
      }),
    onSuccess: async (created) => {
      setLocalError(undefined);
      setSelectedId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["adoption-guide-releases"] });
    },
    onError: (error) => setLocalError(errorMessage(error)),
  });

  const actionMutation = useMutation({
    mutationFn: ({
      release,
      operation,
      payload,
    }: {
      release: AdoptionGuideRelease;
      operation: AdoptionGuideReleaseMutationOperation;
      payload: unknown;
    }) => mutateAdoptionGuideRelease(release.id, operation, payload),
    onSuccess: (_result, variables) =>
      runtimeController.onActionSuccess({
        operation: variables.operation,
        releaseId: variables.release.id,
      }),
    onError: (error, variables) => {
      runtimeController.onActionError(error, variables.payload);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ language, file }: { language: AssetLanguage; file: File }) => {
      if (!selected) throw new Error("請先選擇領養後指南");
      const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
      return runtimeController.upload({
        release: selected,
        language,
        file,
        id,
        uploadPdf: ({ file: selectedFile, objectPath, metadata }) =>
          uploadDocumentPdf({
            file: selectedFile,
            objectPath,
            metadata,
            requestUploadTarget: (input) =>
              fetchAdminJson("/api/admin/documents/upload-target", {
                method: "POST",
                body: JSON.stringify(input),
              }),
            uploadToSignedUrl: async (path, token, uploadedFile) => {
              const { error } = await getSupabaseClient()
                .storage.from("site-documents")
                .uploadToSignedUrl(path, token, uploadedFile, { contentType: "application/pdf" });
              if (error) throw error;
            },
            createAsset: (input) =>
              fetchAdminJson("/api/admin/documents", {
                method: "POST",
                body: JSON.stringify(input),
              }),
          }),
      });
    },
    onSuccess: async () => {
      setLocalError(undefined);
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => setLocalError(errorMessage(error)),
  });

  const pendingAction =
    createMutation.isPending || uploadMutation.isPending
      ? "working"
      : actionMutation.isPending
        ? actionMutation.variables?.operation
        : undefined;
  const combinedError =
    localError ??
    errorMessage(identityQuery.error) ??
    errorMessage(releasesQuery.error) ??
    errorMessage(linkedReleaseQuery.error) ??
    errorMessage(assetsQuery.error) ??
    errorMessage(previewQuery.error);

  const actorRole = identityQuery.data?.admin.role === "admin" ? "admin" : "staff";

  return (
    <AdoptionGuideReleaseManagementView
      actorRole={actorRole}
      releases={releases}
      selected={selected}
      preview={previewQuery.data ?? null}
      previewSucceeded={previewQuery.isSuccess}
      assets={assetsQuery.data ?? []}
      total={releasesQuery.data?.total ?? 0}
      page={releasesQuery.data?.page ?? filters.page ?? 1}
      pageSize={releasesQuery.data?.pageSize ?? filters.pageSize ?? 25}
      filters={filters}
      loading={releasesQuery.isLoading || linkedReleaseQuery.isLoading || identityQuery.isLoading}
      error={combinedError}
      pendingAction={pendingAction}
      onFiltersChange={setFilters}
      onPageChange={(page) => setFilters({ ...filters, page })}
      onSelect={setSelectedId}
      onCreate={() => createMutation.mutate()}
      onSave={(input) => {
        if (selected)
          actionMutation.mutate({ release: selected, operation: "save", payload: input });
      }}
      onSubmit={() => {
        if (selected) {
          actionMutation.mutate({
            release: selected,
            operation: "submit",
            payload: { expectedVersion: selected.version },
          });
        }
      }}
      onWithdraw={() => {
        if (selected) {
          actionMutation.mutate({
            release: selected,
            operation: "withdraw",
            payload: { expectedVersion: selected.version },
          });
        }
      }}
      onReturnToDraft={() => {
        if (selected) {
          actionMutation.mutate({
            release: selected,
            operation: "return-to-draft",
            payload: { expectedVersion: selected.version },
          });
        }
      }}
      onPublish={() => {
        if (!selected) return;
        actionMutation.mutate({
          release: selected,
          operation: "publish",
          payload: runtimeController.getPublishPayload(selected),
        });
      }}
      onRefreshPreview={() => previewQuery.refetch()}
      onUpload={(language, file) => uploadMutation.mutate({ language, file })}
    />
  );
}

export type AdoptionGuideReleaseManagementViewProps = {
  actorRole: "staff" | "admin";
  releases: AdoptionGuideRelease[];
  selected: AdoptionGuideRelease | null;
  preview: AdoptionGuidePreview | null;
  previewSucceeded?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  loading?: boolean;
  error?: string;
  pendingAction?: string;
  onSelect?: (id: string) => void;
  onCreate?: () => void;
  onSave?: (input: AdoptionGuideMutationInput) => void;
  onSubmit?: () => void;
  onWithdraw?: () => void;
  onReturnToDraft?: () => void;
  onPublish?: () => void;
  onRefreshPreview?: () => void;
  assets?: DocumentAsset[];
  filters?: ReleaseFilters;
  onFiltersChange?: (filters: ReleaseFilters) => void;
  onPageChange?: (page: number) => void;
  onUpload?: (language: AssetLanguage, file: File) => void;
};

export function AdoptionGuideReleaseManagementView({
  actorRole,
  releases,
  selected,
  preview,
  previewSucceeded = Boolean(preview),
  total = releases.length,
  page = 1,
  pageSize = 25,
  loading = false,
  error,
  pendingAction,
  onSelect,
  onCreate,
  onSave,
  onSubmit,
  onWithdraw,
  onReturnToDraft,
  onPublish,
  onRefreshPreview,
  assets = [],
  filters = {},
  onFiltersChange,
  onPageChange,
  onUpload,
}: AdoptionGuideReleaseManagementViewProps) {
  const [draft, setDraft] = useState<DraftFields>(() => draftFromRelease(selected));
  // Preserve local field edits after a conflict; only a different selected release/version resets them.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(draftFromRelease(selected)), [selected?.id, selected?.version]);

  const readiness = useMemo(
    () => (preview ? presentAdoptionGuideReadiness(preview.readiness) : null),
    [preview],
  );
  const locked = isAdoptionGuideReleaseContextLocked(pendingAction);
  const editorDisabled = locked || selected?.state !== "draft";
  const workflow = selected
    ? evaluateAdoptionGuideReleaseWorkflow({ release: selected, draft, preview, previewSucceeded })
    : null;
  const chineseAssets = selectAdoptionGuideAssetsForLanguage(assets, "zh-HK");
  const englishAssets = selectAdoptionGuideAssetsForLanguage(assets, "en");
  const issuesFor = (step: (typeof ADOPTION_GUIDE_EDITOR_STEPS)[number]["id"]) =>
    readiness?.issues.filter((issue) => issue.step === step) ?? [];

  function setFilter<K extends keyof ReleaseFilters>(key: K, value: ReleaseFilters[K]) {
    onFiltersChange?.({ ...filters, [key]: value, page: 1 });
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-primary)]">宣傳內容</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">領養後指南</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            管理中英文 PDF、知識庫內容和發佈流程。
          </p>
        </div>
        <button
          type="button"
          disabled={locked}
          onClick={onCreate}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          新增指南
        </button>
      </header>

      <section
        aria-label="篩選領養後指南"
        className="grid gap-3 rounded-md border border-[var(--color-border)] p-4 md:grid-cols-3"
      >
        <label className="text-sm font-semibold">
          搜尋
          <input
            value={filters.q ?? ""}
            disabled={locked}
            onChange={(event) => setFilter("q", event.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>
        <label className="text-sm font-semibold">
          物種
          <select
            value={filters.species ?? "all"}
            disabled={locked}
            onChange={(event) =>
              setFilter("species", event.target.value as AdoptionGuideSpecies | "all")
            }
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          >
            <option value="all">全部</option>
            <option value="cat">貓</option>
            <option value="dog">狗</option>
            <option value="general">一般</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          狀態
          <select
            value={filters.state ?? "all"}
            disabled={locked}
            onChange={(event) =>
              setFilter("state", event.target.value as AdoptionGuideReleaseState | "all")
            }
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          >
            <option value="all">全部</option>
            <option value="draft">草稿</option>
            <option value="in_review">審閱中</option>
            <option value="published">已發佈</option>
            <option value="archived">已封存</option>
          </select>
        </label>
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-error)] p-3 text-sm text-[var(--color-error)]"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)]">
        <section aria-label="指南列表" className="rounded-md border border-[var(--color-border)]">
          <h2 className="border-b border-[var(--color-border)] px-4 py-3 font-bold">指南列表</h2>
          {loading ? <p className="p-4 text-sm">載入中...</p> : null}
          {!loading && releases.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-text-muted)]">尚未建立領養後指南</p>
          ) : null}
          <ul className="divide-y divide-[var(--color-border)]">
            {releases.map((release) => (
              <li key={release.id}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onSelect?.(release.id)}
                  className="w-full px-4 py-3 text-left hover:bg-[var(--color-background)]"
                  aria-current={selected?.id === release.id ? "true" : undefined}
                >
                  <span className="block font-semibold">
                    {release.knowledgeTitle || release.topic}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {release.species} · {release.state}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {total > pageSize ? (
            <nav
              aria-label="Release pages"
              className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-3 text-sm"
            >
              <button
                type="button"
                disabled={locked || page <= 1}
                onClick={() => onPageChange?.(page - 1)}
              >
                Previous
              </button>
              <span>
                {page} / {Math.max(1, Math.ceil(total / pageSize))}
              </span>
              <button
                type="button"
                disabled={locked || page >= Math.ceil(total / pageSize)}
                onClick={() => onPageChange?.(page + 1)}
              >
                Next
              </button>
            </nav>
          ) : null}
        </section>

        <section
          aria-label="領養後指南編輯器"
          className="space-y-5 rounded-md border border-[var(--color-border)] p-4"
        >
          {!selected ? (
            <p className="text-sm text-[var(--color-text-muted)]">請從列表選擇或新增一份指南。</p>
          ) : null}
          {selected ? (
            <>
              <ol className="grid gap-2 sm:grid-cols-5">
                {ADOPTION_GUIDE_EDITOR_STEPS.map((step, index) => (
                  <li
                    key={step.id}
                    className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
                  >
                    {index + 1}. {step.label}
                    {issuesFor(step.id).length ? (
                      <span className="ml-1 text-[var(--color-error)]">!</span>
                    ) : null}
                  </li>
                ))}
              </ol>

              <EditorSection title="1. 主題及物種" issues={issuesFor("topic")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    主題
                    <input
                      value={draft.topic}
                      disabled={editorDisabled}
                      onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    物種
                    <select
                      value={draft.species}
                      disabled={editorDisabled}
                      onChange={(event) =>
                        setDraft({ ...draft, species: event.target.value as AdoptionGuideSpecies })
                      }
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
                    >
                      <option value="cat">貓</option>
                      <option value="dog">狗</option>
                      <option value="general">一般</option>
                    </select>
                  </label>
                </div>
              </EditorSection>

              <EditorSection title="2. 中文版 PDF" issues={issuesFor("chinese_pdf")}>
                <AssetSelector
                  language="zh-HK"
                  assets={chineseAssets}
                  value={draft.zhHkAssetId}
                  disabled={editorDisabled}
                  onChange={(zhHkAssetId) => setDraft({ ...draft, zhHkAssetId })}
                  onUpload={onUpload}
                />
              </EditorSection>

              <EditorSection title="3. English PDF" issues={issuesFor("english_pdf")}>
                <AssetSelector
                  language="en"
                  assets={englishAssets}
                  value={draft.enAssetId}
                  disabled={editorDisabled}
                  onChange={(enAssetId) => setDraft({ ...draft, enAssetId })}
                  onUpload={onUpload}
                />
              </EditorSection>

              <EditorSection title="4. 知識庫內容" issues={issuesFor("knowledge")}>
                <div className="grid gap-3">
                  <label className="text-sm font-semibold">
                    標題
                    <input
                      value={draft.knowledgeTitle}
                      disabled={editorDisabled}
                      onChange={(event) =>
                        setDraft({ ...draft, knowledgeTitle: event.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    主題
                    <input
                      value={draft.knowledgeTopic}
                      disabled={editorDisabled}
                      onChange={(event) =>
                        setDraft({ ...draft, knowledgeTopic: event.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    簡介
                    <textarea
                      value={draft.knowledgeShortIntro}
                      disabled={editorDisabled}
                      onChange={(event) =>
                        setDraft({ ...draft, knowledgeShortIntro: event.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    來源名稱（可選）
                    <input
                      value={draft.knowledgeSourceName ?? ""}
                      disabled={editorDisabled}
                      onChange={(event) =>
                        setDraft({ ...draft, knowledgeSourceName: event.target.value || null })
                      }
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
                    />
                  </label>
                </div>
              </EditorSection>

              <EditorSection title="5. 預覽及提交" issues={issuesFor("preview")}>
                <div className="grid gap-3 md:grid-cols-2">
                  <PreviewCard
                    title="領養頁面預覽"
                    heading={preview?.adoptionPanel.heading}
                    zhHkUrl={preview?.adoptionPanel.zhHkUrl}
                    enUrl={preview?.adoptionPanel.enUrl}
                  />
                  <PreviewCard
                    title="知識庫卡片預覽"
                    heading={preview?.knowledgeCard.title}
                    description={preview?.knowledgeCard.shortIntro}
                    zhHkUrl={preview?.knowledgeCard.zhHkUrl}
                    enUrl={preview?.knowledgeCard.enUrl}
                  />
                </div>
                {readiness && !readiness.ready ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--color-error)]">
                    {readiness.issues.map((issue) => (
                      <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>
                    ))}
                  </ul>
                ) : null}
                {workflow?.message ? (
                  <p className="mt-3 text-sm text-[var(--color-error)]">{workflow.message}</p>
                ) : null}
              </EditorSection>

              <section
                aria-label="發佈歷史"
                className="rounded-md bg-[var(--color-background)] p-3 text-sm"
              >
                <h3 className="font-semibold">歷史</h3>
                <p>建立：{selected.createdAt}</p>
                {selected.submittedAt ? <p>提交：{selected.submittedAt}</p> : null}
                {selected.publishedAt ? <p>發佈：{selected.publishedAt}</p> : null}
                {selected.archivedAt ? <p>封存：{selected.archivedAt}</p> : null}
              </section>

              <div className="flex flex-wrap gap-2">
                {selected.state === "draft" ? (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onSave?.({ ...draft, expectedVersion: selected.version })}
                    className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    儲存草稿
                  </button>
                ) : null}
                {selected.state === "draft" ? (
                  <button
                    type="button"
                    disabled={locked || !workflow?.canSubmit}
                    onClick={onSubmit}
                    className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    提交審閱
                  </button>
                ) : null}
                {selected.state === "in_review" ? (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={onWithdraw}
                    className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    撤回提交
                  </button>
                ) : null}
                {selected.state === "in_review" && actorRole === "admin" ? (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={onReturnToDraft}
                    className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    退回草稿
                  </button>
                ) : null}
                {selected.state === "in_review" && actorRole === "admin" ? (
                  <button
                    type="button"
                    disabled={locked || !workflow?.canPublish}
                    onClick={onPublish}
                    className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    正式發佈
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={locked}
                  onClick={onRefreshPreview}
                  className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  重新整理預覽
                </button>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function EditorSection({
  title,
  issues,
  children,
}: {
  title: string;
  issues: Array<{ message: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-bold">{title}</h2>
      {issues.map((issue) => (
        <p key={issue.message} className="text-sm text-[var(--color-error)]">
          {issue.message}
        </p>
      ))}
      {children}
    </section>
  );
}

function AssetSelector({
  language,
  assets,
  value,
  disabled,
  onChange,
  onUpload,
}: {
  language: AssetLanguage;
  assets: DocumentAsset[];
  value: string | null;
  disabled: boolean;
  onChange: (id: string | null) => void;
  onUpload?: (language: AssetLanguage, file: File) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold">
        選擇 {language === "zh-HK" ? "中文版" : "English"} PDF
        <select
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value || null)}
          className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
        >
          <option value="">選擇已上傳的領養指南 PDF</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        上傳新 PDF
        <input
          type="file"
          accept="application/pdf"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload?.(language, file);
          }}
          className="mt-1 block w-full text-sm font-normal"
        />
      </label>
      <p className="text-xs text-[var(--color-text-muted)]">
        只可上傳 PDF 檔案；此欄只顯示 adoption_guide 的 {language} 文件。
      </p>
    </div>
  );
}

function PreviewCard({
  title,
  heading,
  description,
  zhHkUrl,
  enUrl,
}: {
  title: string;
  heading?: string;
  description?: string;
  zhHkUrl?: string | null;
  enUrl?: string | null;
}) {
  return (
    <article className="rounded-md border border-[var(--color-border)] p-3">
      <h3 className="font-semibold">{title}</h3>
      {heading ? <p className="mt-1 font-medium">{heading}</p> : null}
      {description ? (
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {zhHkUrl ? (
          <a href={zhHkUrl} target="_blank" rel="noreferrer">
            中文版
          </a>
        ) : (
          <span>中文版 PDF 尚未準備</span>
        )}
        {enUrl ? (
          <a href={enUrl} target="_blank" rel="noreferrer">
            English
          </a>
        ) : (
          <span>English PDF 尚未準備</span>
        )}
      </div>
    </article>
  );
}
