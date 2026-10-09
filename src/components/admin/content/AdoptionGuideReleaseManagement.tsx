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
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { LoadFailure, type ViewLoadFailure } from "../LoadFailure";
import { adoptionGuideCopy } from "./adoptionGuideCopy";
import { cmsStateCopy } from "./cmsStateCopy";
import { DocumentAdminError, documentErrorMessage } from "./documentErrors";
import { uploadDocumentPdf } from "./documentUpload";
import {
  ADOPTION_GUIDE_EDITOR_STEPS,
  adoptionGuideFailureText,
  createAdoptionGuideReleaseRuntimeController,
  evaluateAdoptionGuideReleaseWorkflow,
  fetchAllAdoptionGuideAssets,
  isAdoptionGuideReleaseContextLocked,
  fetchAdoptionGuideReleases,
  mutateAdoptionGuideRelease,
  presentAdoptionGuideReadiness,
  resolveLinkedAdoptionGuideRelease,
  selectAdoptionGuideAssetsForLanguage,
  type AdoptionGuideFailure,
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

export function AdoptionGuideReleaseManagement({
  initialReleaseId,
}: {
  initialReleaseId?: string;
}) {
  const copy = useAdminCopy(adoptionGuideCopy);
  const { language } = useAdminLanguage();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ReleaseFilters>({
    species: "all",
    state: "all",
    page: 1,
    pageSize: 25,
  });
  const [selectedId, setSelectedId] = useState<string | null>(initialReleaseId ?? null);
  const [localError, setLocalError] = useState<AdoptionGuideFailure>();
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
    onError: (error) => setLocalError({ cause: error }),
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
      if (!selected) throw new DocumentAdminError("release_required");
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
    onError: (error) => setLocalError({ cause: error }),
  });

  const pendingAction =
    createMutation.isPending || uploadMutation.isPending
      ? "working"
      : actionMutation.isPending
        ? actionMutation.variables?.operation
        : undefined;
  const combinedError = adoptionGuideFailureText(localError, copy.errors, language);
  const loadError =
    identityQuery.error ??
    releasesQuery.error ??
    linkedReleaseQuery.error ??
    assetsQuery.error ??
    previewQuery.error;

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
      loadFailure={
        loadError
          ? {
              error: loadError,
              heading: documentErrorMessage(loadError, language),
              onRetry: () => {
                void identityQuery.refetch();
                void releasesQuery.refetch();
                void linkedReleaseQuery.refetch();
                void assetsQuery.refetch();
                void previewQuery.refetch();
              },
            }
          : null
      }
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
  /** A release list, its preview or the documents failed to load. */
  loadFailure?: ViewLoadFailure | null;
  /** A refusal or failure of a save or another action. */
  error?: string | null;
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
  loadFailure = null,
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
  const copy = useAdminCopy(adoptionGuideCopy);
  const states = useAdminCopy(cmsStateCopy);
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
          <p className="text-sm font-semibold text-[var(--color-primary)]">{copy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
        </div>
        <button
          type="button"
          disabled={locked}
          onClick={onCreate}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {copy.add}
        </button>
      </header>

      <section
        aria-label={copy.filters.label}
        className="grid gap-3 rounded-md border border-[var(--color-border)] p-4 md:grid-cols-3"
      >
        <label className="text-sm font-semibold">
          {copy.filters.search}
          <input
            value={filters.q ?? ""}
            disabled={locked}
            onChange={(event) => setFilter("q", event.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>
        <label className="text-sm font-semibold">
          {copy.filters.species}
          <select
            value={filters.species ?? "all"}
            disabled={locked}
            onChange={(event) =>
              setFilter("species", event.target.value as AdoptionGuideSpecies | "all")
            }
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          >
            <option value="all">{copy.filters.all}</option>
            <option value="cat">{copy.species.cat}</option>
            <option value="dog">{copy.species.dog}</option>
            <option value="general">{copy.species.general}</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          {copy.filters.state}
          <select
            value={filters.state ?? "all"}
            disabled={locked}
            onChange={(event) =>
              setFilter("state", event.target.value as AdoptionGuideReleaseState | "all")
            }
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          >
            <option value="all">{copy.filters.all}</option>
            <option value="draft">{states.draft}</option>
            <option value="in_review">{states.in_review}</option>
            <option value="published">{states.published}</option>
            <option value="archived">{states.archived}</option>
          </select>
        </label>
      </section>

      {loadFailure ? (
        <LoadFailure
          error={loadFailure.error}
          onRetry={loadFailure.onRetry}
          title={loadFailure.heading ?? undefined}
        />
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-error)] p-3 text-sm text-[var(--color-error)]"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)]">
        <section
          aria-label={copy.list.heading}
          className="rounded-md border border-[var(--color-border)]"
        >
          <h2 className="border-b border-[var(--color-border)] px-4 py-3 font-bold">
            {copy.list.heading}
          </h2>
          {loading ? <p className="p-4 text-sm">{copy.list.loading}</p> : null}
          {!loading && !loadFailure && releases.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-text-muted)]">{copy.list.empty}</p>
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
                    {copy.list.meta(release.species, states[release.state])}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {total > pageSize ? (
            <nav
              aria-label={copy.list.pagerLabel}
              className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-3 text-sm"
            >
              <button
                type="button"
                disabled={locked || page <= 1}
                onClick={() => onPageChange?.(page - 1)}
              >
                {copy.list.previous}
              </button>
              <span>{copy.list.pageOf(page, Math.max(1, Math.ceil(total / pageSize)))}</span>
              <button
                type="button"
                disabled={locked || page >= Math.ceil(total / pageSize)}
                onClick={() => onPageChange?.(page + 1)}
              >
                {copy.list.next}
              </button>
            </nav>
          ) : null}
        </section>

        <section
          aria-label={copy.editor.label}
          className="space-y-5 rounded-md border border-[var(--color-border)] p-4"
        >
          {!selected ? (
            <p className="text-sm text-[var(--color-text-muted)]">{copy.editor.choose}</p>
          ) : null}
          {selected ? (
            <>
              <ol className="grid gap-2 sm:grid-cols-5">
                {ADOPTION_GUIDE_EDITOR_STEPS.map((step, index) => (
                  <li
                    key={step.id}
                    className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
                  >
                    {index + 1}. {copy.steps[step.id]}
                    {issuesFor(step.id).length ? (
                      <span className="ml-1 text-[var(--color-error)]">!</span>
                    ) : null}
                  </li>
                ))}
              </ol>

              <EditorSection title={copy.sections.topic} issues={issuesFor("topic")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    {copy.topic.topic}
                    <input
                      value={draft.topic}
                      disabled={editorDisabled}
                      onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    {copy.topic.species}
                    <select
                      value={draft.species}
                      disabled={editorDisabled}
                      onChange={(event) =>
                        setDraft({ ...draft, species: event.target.value as AdoptionGuideSpecies })
                      }
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
                    >
                      <option value="cat">{copy.species.cat}</option>
                      <option value="dog">{copy.species.dog}</option>
                      <option value="general">{copy.species.general}</option>
                    </select>
                  </label>
                </div>
              </EditorSection>

              <EditorSection title={copy.sections.chinesePdf} issues={issuesFor("chinese_pdf")}>
                <AssetSelector
                  language="zh-HK"
                  assets={chineseAssets}
                  value={draft.zhHkAssetId}
                  disabled={editorDisabled}
                  onChange={(zhHkAssetId) => setDraft({ ...draft, zhHkAssetId })}
                  onUpload={onUpload}
                />
              </EditorSection>

              <EditorSection title={copy.sections.englishPdf} issues={issuesFor("english_pdf")}>
                <AssetSelector
                  language="en"
                  assets={englishAssets}
                  value={draft.enAssetId}
                  disabled={editorDisabled}
                  onChange={(enAssetId) => setDraft({ ...draft, enAssetId })}
                  onUpload={onUpload}
                />
              </EditorSection>

              <EditorSection title={copy.sections.knowledge} issues={issuesFor("knowledge")}>
                <div className="grid gap-3">
                  <label className="text-sm font-semibold">
                    {copy.knowledge.title}
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
                    {copy.knowledge.topic}
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
                    {copy.knowledge.intro}
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
                    {copy.knowledge.source}
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

              <EditorSection title={copy.sections.preview} issues={issuesFor("preview")}>
                <div className="grid gap-3 md:grid-cols-2">
                  <PreviewCard
                    title={copy.preview.adoptionCard}
                    heading={preview?.adoptionPanel.heading}
                    zhHkUrl={preview?.adoptionPanel.zhHkUrl}
                    enUrl={preview?.adoptionPanel.enUrl}
                  />
                  <PreviewCard
                    title={copy.preview.knowledgeCard}
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
                {workflow?.blocker ? (
                  <p className="mt-3 text-sm text-[var(--color-error)]">
                    {copy.blockers[workflow.blocker]}
                  </p>
                ) : null}
              </EditorSection>

              <section
                aria-label={copy.history.label}
                className="rounded-md bg-[var(--color-background)] p-3 text-sm"
              >
                <h3 className="font-semibold">{copy.history.heading}</h3>
                <p>{copy.history.created(selected.createdAt)}</p>
                {selected.submittedAt ? (
                  <p>{copy.history.submitted(selected.submittedAt)}</p>
                ) : null}
                {selected.publishedAt ? (
                  <p>{copy.history.published(selected.publishedAt)}</p>
                ) : null}
                {selected.archivedAt ? <p>{copy.history.archived(selected.archivedAt)}</p> : null}
              </section>

              <div className="flex flex-wrap gap-2">
                {selected.state === "draft" ? (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onSave?.({ ...draft, expectedVersion: selected.version })}
                    className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {copy.actions.save}
                  </button>
                ) : null}
                {selected.state === "draft" ? (
                  <button
                    type="button"
                    disabled={locked || !workflow?.canSubmit}
                    onClick={onSubmit}
                    className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {copy.actions.submit}
                  </button>
                ) : null}
                {selected.state === "in_review" ? (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={onWithdraw}
                    className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {copy.actions.withdraw}
                  </button>
                ) : null}
                {selected.state === "in_review" && actorRole === "admin" ? (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={onReturnToDraft}
                    className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {copy.actions.returnToDraft}
                  </button>
                ) : null}
                {selected.state === "in_review" && actorRole === "admin" ? (
                  <button
                    type="button"
                    disabled={locked || !workflow?.canPublish}
                    onClick={onPublish}
                    className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {copy.actions.publish}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={locked}
                  onClick={onRefreshPreview}
                  className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {copy.actions.refreshPreview}
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
  const copy = useAdminCopy(adoptionGuideCopy).asset;
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold">
        {copy.choose(language)}
        <select
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value || null)}
          className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
        >
          <option value="">{copy.placeholder}</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        {copy.upload}
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
      <p className="text-xs text-[var(--color-text-muted)]">{copy.hint(language)}</p>
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
  const copy = useAdminCopy(adoptionGuideCopy).preview;
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
            {copy.chinese}
          </a>
        ) : (
          <span>{copy.chineseMissing}</span>
        )}
        {enUrl ? (
          <a href={enUrl} target="_blank" rel="noreferrer">
            {copy.english}
          </a>
        ) : (
          <span>{copy.englishMissing}</span>
        )}
      </div>
    </article>
  );
}
