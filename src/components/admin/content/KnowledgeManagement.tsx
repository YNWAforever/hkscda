import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { LoadFailure, type ViewLoadFailure } from "../LoadFailure";
import { TablePager } from "../TablePager";
import { fetchAdminJson } from "../../../lib/admin/http";
import { adminErrorMessage } from "../../../lib/admin/session";
import type { DocumentAsset } from "../../../lib/documents/types";
import type {
  AdminKnowledgePage,
  AdminKnowledgeStatus,
  KnowledgePost,
  KnowledgePostInput,
} from "../../../lib/knowledge/types";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { fetchAdoptionGuideReleaseOwnership } from "./adoptionGuideReleaseLogic";
import { knowledgeCopy } from "./knowledgeCopy";

export const ADMIN_KNOWLEDGE_QUERY_KEY = ["admin-knowledge"] as const;

type SearchInput = {
  q?: string;
  status?: AdminKnowledgeStatus;
  page?: number;
  pageSize?: number;
};

type AssetListResponse = { items: DocumentAsset[]; total: number };

type DraftDestinationMode = "external" | "document";

type KnowledgeDraft = {
  id?: string;
  title: string;
  topic: string;
  shortIntro: string;
  sourceName: string;
  destinationMode: DraftDestinationMode;
  externalUrl: string;
  documentAssetId: string;
  isPublished: boolean;
  sortOrder: number;
};

export function buildKnowledgeSearchParams(input: SearchInput) {
  const params = new URLSearchParams({
    page: String(Math.max(1, Math.trunc(input.page ?? 1))),
    pageSize: String(Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 50)))),
    status: input.status ?? "all",
  });
  if (input.q?.trim()) params.set("q", input.q.trim());
  return params;
}

export function filterPublishedPdfAssets(assets: DocumentAsset[]) {
  return assets.filter((asset) => asset.isPublished && asset.mimeType === "application/pdf");
}

export function invalidateKnowledgeQueries(client: {
  invalidateQueries(input: { queryKey: readonly string[] }): Promise<unknown>;
}) {
  return client.invalidateQueries({ queryKey: ADMIN_KNOWLEDGE_QUERY_KEY });
}

function draftFromPost(post?: KnowledgePost): KnowledgeDraft {
  if (post?.destination.kind === "document_pair") {
    throw new Error("Release-managed knowledge posts cannot be edited here");
  }
  return {
    id: post?.id,
    title: post?.title ?? "",
    topic: post?.topic ?? "adoption",
    shortIntro: post?.shortIntro ?? "",
    sourceName: post?.sourceName ?? "HKSCDA",
    destinationMode: post?.destination.kind ?? "external",
    externalUrl: post?.destination.kind === "external" ? post.destination.url : "",
    documentAssetId: post?.destination.kind === "document" ? post.destination.assetId : "",
    isPublished: post?.isPublished ?? false,
    sortOrder: post?.sortOrder ?? 0,
  };
}

function toInput(
  draft: KnowledgeDraft,
): KnowledgePostInput & { externalUrl?: string; documentAssetId?: string } {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    title: draft.title,
    topic: draft.topic,
    shortIntro: draft.shortIntro,
    sourceName: draft.sourceName || null,
    destination:
      draft.destinationMode === "external"
        ? { kind: "external", url: draft.externalUrl }
        : { kind: "document", assetId: draft.documentAssetId },
    externalUrl: draft.destinationMode === "external" ? draft.externalUrl : undefined,
    documentAssetId: draft.destinationMode === "document" ? draft.documentAssetId : undefined,
    isPublished: draft.isPublished,
    sortOrder: draft.sortOrder,
  };
}

export function KnowledgeManagement() {
  const copy = useAdminCopy(knowledgeCopy);
  const { language } = useAdminLanguage();
  const queryClient = useQueryClient();
  const [documentPage, setDocumentPage] = useState(1);
  const [documentSearch, setDocumentSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AdminKnowledgeStatus>("all");
  const [page, setPage] = useState(1);

  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }
  const search = useMemo(
    () => buildKnowledgeSearchParams({ q: query, status, page, pageSize: 50 }).toString(),
    [query, status, page],
  );

  const knowledgeQuery = useQuery({
    queryKey: [...ADMIN_KNOWLEDGE_QUERY_KEY, search],
    queryFn: () => fetchAdminJson<AdminKnowledgePage>(`/api/admin/knowledge?${search}`),
  });
  const documentsQuery = useQuery({
    queryKey: ["admin-knowledge-documents", documentPage, documentSearch],
    queryFn: async () => {
      const response = await fetchAdminJson<AssetListResponse>(
        `/api/admin/documents?kind=adoption_guide&page=${documentPage}&pageSize=50&q=${encodeURIComponent(documentSearch)}`,
      );
      return { ...response, items: filterPublishedPdfAssets(response.items) };
    },
  });
  const ownershipQuery = useQuery({
    queryKey: ["adoption-guide-release-ownership"],
    queryFn: () => fetchAdoptionGuideReleaseOwnership(),
  });
  const mutation = useMutation({
    mutationFn: async (
      operation: { action: "save"; draft: KnowledgeDraft } | { action: "delete"; id: string },
    ) => {
      if (operation.action === "delete") {
        return fetchAdminJson("/api/admin/knowledge", {
          method: "DELETE",
          body: JSON.stringify({ id: operation.id }),
        });
      }
      return fetchAdminJson("/api/admin/knowledge", {
        method: "POST",
        body: JSON.stringify(toInput(operation.draft)),
      });
    },
    onSuccess: () => invalidateKnowledgeQueries(queryClient),
  });

  const loadError = knowledgeQuery.error ?? ownershipQuery.error ?? documentsQuery.error;
  // Irreversible, and the trigger sits inline in a list where a mis-click is easy. Name the
  // post so the operator can tell which row they hit.
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteTitle =
    knowledgeQuery.data?.posts.find((post) => post.id === deleteId)?.title ??
    copy.editor.thisArticle;

  return (
    <>
      <ConfirmActionDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title={copy.editor.delete}
        consequence={copy.editor.confirmDelete(deleteTitle)}
        confirmLabel={copy.editor.delete}
        destructive
        reason="none"
        onConfirm={async () => {
          if (deleteId !== null) mutation.mutate({ action: "delete", id: deleteId });
        }}
      />
      <section className="m-6 space-y-3 rounded border p-4">
        <h2>{copy.picker.heading}</h2>
        <label>
          {copy.picker.search}
          <input
            className={inputClass}
            value={documentSearch}
            onChange={(event) => {
              setDocumentSearch(event.target.value);
              setDocumentPage(1);
            }}
          />
        </label>
        {documentsQuery.data && (
          <TablePager
            page={documentPage}
            pageSize={50}
            total={documentsQuery.data.total}
            onPageChange={setDocumentPage}
            label={copy.picker.pager}
          />
        )}
        <p>{copy.picker.note}</p>
      </section>
      <KnowledgeManagementView
        data={knowledgeQuery.data}
        ownershipReady={ownershipQuery.isSuccess}
        ownerReleaseIds={ownershipQuery.data?.ownerReleaseIdsByKnowledgePostId}
        documents={documentsQuery.data?.items ?? []}
        query={query}
        status={status}
        loading={knowledgeQuery.isLoading || ownershipQuery.isLoading}
        pending={mutation.isPending}
        loadFailure={
          loadError
            ? {
                error: loadError,
                heading: adminErrorMessage(loadError, language),
                onRetry: () => {
                  void knowledgeQuery.refetch();
                  void ownershipQuery.refetch();
                  void documentsQuery.refetch();
                },
              }
            : null
        }
        error={adminErrorMessage(mutation.error, language)}
        onQueryChange={withPageReset(setQuery)}
        onStatusChange={withPageReset(setStatus)}
        onPageChange={setPage}
        fetching={knowledgeQuery.isFetching}
        onSave={(draft) => mutation.mutate({ action: "save", draft })}
        onDelete={setDeleteId}
      />
    </>
  );
}

export function KnowledgeManagementView({
  data,
  ownershipReady = true,
  ownerReleaseIds = {},
  documents,
  query,
  status = "all",
  loading = false,
  pending = false,
  loadFailure = null,
  error,
  onQueryChange,
  onStatusChange,
  onPageChange,
  fetching,
  onSave,
  onDelete,
}: {
  data?: AdminKnowledgePage;
  ownershipReady?: boolean;
  ownerReleaseIds?: Readonly<Record<string, string>>;
  documents: DocumentAsset[];
  query: string;
  status?: AdminKnowledgeStatus;
  loading?: boolean;
  pending?: boolean;
  /** The articles, their ownership or the documents failed to load. */
  loadFailure?: ViewLoadFailure | null;
  /** A refusal or failure of a save or a delete. */
  error?: string | null;
  onQueryChange?: (value: string) => void;
  onStatusChange?: (value: AdminKnowledgeStatus) => void;
  onPageChange?: (page: number) => void;
  fetching?: boolean;
  onSave?: (draft: KnowledgeDraft) => void;
  onDelete?: (id: string) => void;
}) {
  const copy = useAdminCopy(knowledgeCopy);
  const posts = data?.posts ?? [];
  return (
    <div className="space-y-6 p-6">
      <header>
        <p className="text-sm font-semibold text-[var(--color-primary)]">{copy.eyebrow}</p>
        <h1 className="text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      </header>

      <div className="grid gap-3 md:grid-cols-[1fr_14rem]">
        <label className="space-y-1 text-sm font-semibold">
          {copy.filters.search}
          <input
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          {copy.filters.publication}
          <select
            value={status}
            onChange={(event) => onStatusChange?.(event.target.value as AdminKnowledgeStatus)}
            className={inputClass}
          >
            <option value="all">{copy.filters.all}</option>
            <option value="published">{copy.filters.published}</option>
            <option value="draft">{copy.filters.draft}</option>
          </select>
        </label>
      </div>

      {loadFailure ? (
        <LoadFailure
          error={loadFailure.error}
          onRetry={loadFailure.onRetry}
          title={loadFailure.heading ?? undefined}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
      {loading ? <p aria-live="polite">{copy.loading}</p> : null}
      {!loading && !ownershipReady ? <p role="alert">{copy.ownershipUnknown}</p> : null}

      {!loading && ownershipReady ? (
        <KnowledgeEditor documents={documents} pending={pending} onSave={onSave} />
      ) : null}

      {!loading && ownershipReady && posts.length === 0 && !error && !loadFailure ? (
        <p>{copy.empty}</p>
      ) : null}
      {!loading &&
        ownershipReady &&
        posts.map((post) => (
          <KnowledgeEditor
            key={post.id}
            post={post}
            ownerReleaseId={ownerReleaseIds[post.id]}
            documents={documents}
            pending={pending}
            onSave={onSave}
            onDelete={onDelete}
          />
        ))}
      {data && onPageChange ? (
        <TablePager
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={onPageChange}
          busy={fetching}
          label={copy.pager}
        />
      ) : null}
    </div>
  );
}

function KnowledgeEditor({
  post,
  ownerReleaseId,
  ...props
}: {
  post?: KnowledgePost;
  ownerReleaseId?: string;
  documents: DocumentAsset[];
  pending: boolean;
  onSave?: (draft: KnowledgeDraft) => void;
  onDelete?: (id: string) => void;
}) {
  const copy = useAdminCopy(knowledgeCopy).managed;
  if (post && (ownerReleaseId || post.destination.kind === "document_pair")) {
    return (
      <section
        data-release-managed-knowledge={post.id}
        className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      >
        <h2 className="font-bold">{post.title}</h2>
        {ownerReleaseId ? (
          <a
            href={`/admin/content/adoption-guides?releaseId=${encodeURIComponent(ownerReleaseId)}`}
            className="text-sm font-semibold text-[var(--color-primary)] underline"
          >
            {copy.byReleases}
          </a>
        ) : (
          <p className="text-sm font-semibold text-[var(--color-primary)]">{copy.byReleases}</p>
        )}
        <p className="text-sm text-[var(--color-text-muted)]">{copy.readOnly}</p>
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="font-semibold">{copy.chineseAsset}</dt>
            <dd className="break-all font-mono">
              {post.destination.kind === "document_pair" ? post.destination.zhHkAssetId : "?"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">{copy.englishAsset}</dt>
            <dd className="break-all font-mono">
              {post.destination.kind === "document_pair" ? post.destination.enAssetId : "?"}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  return <EditableKnowledgeEditor post={post} {...props} />;
}

function EditableKnowledgeEditor({
  post,
  documents,
  pending,
  onSave,
  onDelete,
}: {
  post?: KnowledgePost;
  documents: DocumentAsset[];
  pending: boolean;
  onSave?: (draft: KnowledgeDraft) => void;
  onDelete?: (id: string) => void;
}) {
  const copy = useAdminCopy(knowledgeCopy).editor;
  const [draft, setDraft] = useState(() => draftFromPost(post));
  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="font-bold">{post ? post.title : copy.addHeading}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">
          {copy.title}
          <input
            className={inputClass}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          {copy.topic}
          <input
            className={inputClass}
            value={draft.topic}
            onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm font-semibold">
        {copy.intro}
        <textarea
          className={inputClass}
          value={draft.shortIntro}
          onChange={(event) => setDraft({ ...draft, shortIntro: event.target.value })}
        />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">
          {copy.linkType}
          <select
            className={inputClass}
            value={draft.destinationMode}
            onChange={(event) =>
              setDraft({ ...draft, destinationMode: event.target.value as DraftDestinationMode })
            }
          >
            <option value="external">{copy.external}</option>
            <option value="document">{copy.document}</option>
          </select>
        </label>
        {draft.destinationMode === "external" ? (
          <label className="space-y-1 text-sm font-semibold">
            {copy.externalUrl}
            <input
              className={inputClass}
              value={draft.externalUrl}
              onChange={(event) => setDraft({ ...draft, externalUrl: event.target.value })}
              placeholder="https://"
            />
            <span className="text-xs text-[var(--color-text-muted)]">{copy.httpsOnly}</span>
          </label>
        ) : (
          <label className="space-y-1 text-sm font-semibold">
            {copy.documentLabel}
            <select
              className={inputClass}
              value={draft.documentAssetId}
              onChange={(event) => setDraft({ ...draft, documentAssetId: event.target.value })}
            >
              <option value="">{copy.choosePdf}</option>
              {draft.documentAssetId &&
                !documents.some((asset) => asset.id === draft.documentAssetId) && (
                  <option value={draft.documentAssetId}>{copy.currentChoice}</option>
                )}
              {documents.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm font-semibold">
          {copy.source}
          <input
            className={inputClass}
            value={draft.sourceName}
            onChange={(event) => setDraft({ ...draft, sourceName: event.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          {copy.sortOrder}
          <input
            className={inputClass}
            type="number"
            min={0}
            value={draft.sortOrder}
            onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) || 0 })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={draft.isPublished}
            onChange={(event) => setDraft({ ...draft, isPublished: event.target.checked })}
          />
          {draft.isPublished ? copy.published : copy.draft}
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !draft.title.trim() || !draft.shortIntro.trim()}
          onClick={() => onSave?.(draft)}
        >
          {copy.save}
        </button>
        {post ? (
          <button type="button" disabled={pending} onClick={() => onDelete?.(post.id)}>
            {copy.delete}
          </button>
        ) : null}
      </div>
    </section>
  );
}

const inputClass =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm";
