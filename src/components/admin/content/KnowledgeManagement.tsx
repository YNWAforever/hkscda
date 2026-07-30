import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { DocumentAsset } from "../../../lib/documents/types";
import type {
  AdminKnowledgePage,
  AdminKnowledgeStatus,
  KnowledgePost,
  KnowledgePostInput,
} from "../../../lib/knowledge/types";
import { fetchAdoptionGuideReleaseOwnership } from "./adoptionGuideReleaseLogic";

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
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AdminKnowledgeStatus>("all");
  const search = useMemo(
    () => buildKnowledgeSearchParams({ q: query, status, page: 1, pageSize: 50 }).toString(),
    [query, status],
  );

  const knowledgeQuery = useQuery({
    queryKey: [...ADMIN_KNOWLEDGE_QUERY_KEY, search],
    queryFn: () => fetchAdminJson<AdminKnowledgePage>(`/api/admin/knowledge?${search}`),
  });
  const documentsQuery = useQuery({
    queryKey: ["admin-knowledge-documents"],
    queryFn: async () => {
      const response = await fetchAdminJson<AssetListResponse>(
        "/api/admin/documents?kind=adoption_guide&page=1&pageSize=50",
      );
      return filterPublishedPdfAssets(response.items);
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

  return (
    <KnowledgeManagementView
      data={knowledgeQuery.data}
      ownerReleaseIds={ownershipQuery.data?.ownerReleaseIdsByKnowledgePostId}
      documents={documentsQuery.data ?? []}
      query={query}
      status={status}
      loading={knowledgeQuery.isLoading || documentsQuery.isLoading || ownershipQuery.isLoading}
      pending={mutation.isPending}
      error={
        (knowledgeQuery.error instanceof Error ? knowledgeQuery.error.message : null) ??
        (ownershipQuery.error instanceof Error ? ownershipQuery.error.message : null) ??
        (documentsQuery.error instanceof Error ? documentsQuery.error.message : null) ??
        (mutation.error instanceof Error ? mutation.error.message : null)
      }
      onQueryChange={setQuery}
      onStatusChange={setStatus}
      onSave={(draft) => mutation.mutate({ action: "save", draft })}
      onDelete={(id) => mutation.mutate({ action: "delete", id })}
    />
  );
}

export function KnowledgeManagementView({
  data,
  ownerReleaseIds = {},
  documents,
  query,
  status = "all",
  loading = false,
  pending = false,
  error,
  onQueryChange,
  onStatusChange,
  onSave,
  onDelete,
}: {
  data?: AdminKnowledgePage;
  ownerReleaseIds?: Readonly<Record<string, string>>;
  documents: DocumentAsset[];
  query: string;
  status?: AdminKnowledgeStatus;
  loading?: boolean;
  pending?: boolean;
  error?: string | null;
  onQueryChange?: (value: string) => void;
  onStatusChange?: (value: AdminKnowledgeStatus) => void;
  onSave?: (draft: KnowledgeDraft) => void;
  onDelete?: (id: string) => void;
}) {
  const posts = data?.posts ?? [];
  return (
    <div className="space-y-6 p-6">
      <header>
        <p className="text-sm font-semibold text-[var(--color-primary)]">Content</p>
        <h1 className="text-2xl font-bold text-[var(--color-panel)]">Knowledge hub</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Manage public adoption, pet care, and reference links.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-[1fr_14rem]">
        <label className="space-y-1 text-sm font-semibold">
          Search
          <input
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          Publication
          <select
            value={status}
            onChange={(event) => onStatusChange?.(event.target.value as AdminKnowledgeStatus)}
            className={inputClass}
          >
            <option value="all">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
      {loading ? <p aria-live="polite">Loading knowledge posts...</p> : null}

      {!loading ? (
        <KnowledgeEditor documents={documents} pending={pending} onSave={onSave} />
      ) : null}

      {!loading && posts.length === 0 ? <p>No knowledge posts yet.</p> : null}
      {!loading &&
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
            {"\u7531\u9818\u990a\u6307\u5357\u7248\u672c\u7ba1\u7406"}
          </a>
        ) : (
          <p className="text-sm font-semibold text-[var(--color-primary)]">
            {"\u7531\u9818\u990a\u6307\u5357\u7248\u672c\u7ba1\u7406"}
          </p>
        )}
        <p className="text-sm text-[var(--color-text-muted)]">
          This bilingual post is read-only here. Update it through the release workflow.
        </p>
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="font-semibold">Chinese asset ID</dt>
            <dd className="break-all font-mono">
              {post.destination.kind === "document_pair" ? post.destination.zhHkAssetId : "?"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">English asset ID</dt>
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
  const [draft, setDraft] = useState(() => draftFromPost(post));
  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="font-bold">{post ? post.title : "New knowledge post"}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">
          Title
          <input
            className={inputClass}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          Topic
          <input
            className={inputClass}
            value={draft.topic}
            onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm font-semibold">
        Short intro
        <textarea
          className={inputClass}
          value={draft.shortIntro}
          onChange={(event) => setDraft({ ...draft, shortIntro: event.target.value })}
        />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">
          Destination mode
          <select
            className={inputClass}
            value={draft.destinationMode}
            onChange={(event) =>
              setDraft({ ...draft, destinationMode: event.target.value as DraftDestinationMode })
            }
          >
            <option value="external">External URL</option>
            <option value="document">Document PDF</option>
          </select>
        </label>
        {draft.destinationMode === "external" ? (
          <label className="space-y-1 text-sm font-semibold">
            External URL
            <input
              className={inputClass}
              value={draft.externalUrl}
              onChange={(event) => setDraft({ ...draft, externalUrl: event.target.value })}
              placeholder="https://"
            />
            <span className="text-xs text-[var(--color-text-muted)]">HTTPS only</span>
          </label>
        ) : (
          <label className="space-y-1 text-sm font-semibold">
            Document PDF
            <select
              className={inputClass}
              value={draft.documentAssetId}
              onChange={(event) => setDraft({ ...draft, documentAssetId: event.target.value })}
            >
              <option value="">Choose a published PDF</option>
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
          Source
          <input
            className={inputClass}
            value={draft.sourceName}
            onChange={(event) => setDraft({ ...draft, sourceName: event.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          Sort order
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
          {draft.isPublished ? "Published" : "Draft"}
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !draft.title.trim() || !draft.shortIntro.trim()}
          onClick={() => onSave?.(draft)}
        >
          Save
        </button>
        {post ? (
          <button type="button" disabled={pending} onClick={() => onDelete?.(post.id)}>
            Delete
          </button>
        ) : null}
      </div>
    </section>
  );
}

const inputClass =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm";
