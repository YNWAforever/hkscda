import { useMemo, useRef, useState, type RefObject } from "react";
import { FileText, LoaderCircle, Search, Trash2, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import { getSupabaseClient } from "../../../lib/supabase";
import { pageAfterDelete } from "./documentManagementLogic";
import type { DocumentAsset, DocumentKind, DocumentLanguage } from "../../../lib/documents/types";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { LoadFailure, type ViewLoadFailure } from "../LoadFailure";
import { TablePager } from "../TablePager";
import { DocumentAdminError, documentErrorMessage } from "./documentErrors";
import { documentsCopy } from "./documentsCopy";
import { uploadDocumentPdf } from "./documentUpload";
import { fetchAdoptionGuideReleaseOwnership } from "./adoptionGuideReleaseLogic";

export type DocumentListData = { items: DocumentAsset[]; total: number };

export function DocumentManagement({ initialData }: { initialData?: DocumentListData }) {
  if (initialData) return <DocumentManagementView data={initialData} />;
  return <DocumentManagementRuntime />;
}

function DocumentManagementRuntime() {
  const { language: adminLanguage } = useAdminLanguage();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DocumentKind | "all">("all");
  const [language, setLanguage] = useState<DocumentLanguage | "all">("all");
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const [uploadKind, setUploadKind] = useState<DocumentKind>("annual_report");
  const [uploadLanguage, setUploadLanguage] = useState<DocumentLanguage>("bilingual");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const search = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (query.trim()) params.set("q", query.trim());
    if (kind !== "all") params.set("kind", kind);
    if (language !== "all") params.set("language", language);
    return params.toString();
  }, [kind, language, page, query]);

  const documentsQuery = useQuery({
    queryKey: ["admin-documents", search],
    queryFn: () => fetchAdminJson<DocumentListData>(`/api/admin/documents?${search}`),
  });

  const ownershipQuery = useQuery({
    queryKey: ["adoption-guide-release-ownership"],
    queryFn: () => fetchAdoptionGuideReleaseOwnership(),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !title.trim()) throw new DocumentAdminError("title_and_file_required");
      const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
      const objectPath = `${uploadKind}/${id}.pdf`;
      return uploadDocumentPdf({
        file,
        objectPath,
        metadata: {
          kind: uploadKind,
          title: title.trim(),
          language: uploadLanguage,
          sortOrder: 0,
        },
        requestUploadTarget: (input) =>
          fetchAdminJson("/api/admin/documents/upload-target", {
            method: "POST",
            body: JSON.stringify(input),
          }),
        uploadToSignedUrl: async (path, token, selectedFile) => {
          const { error } = await getSupabaseClient()
            .storage.from("site-documents")
            .uploadToSignedUrl(path, token, selectedFile, { contentType: "application/pdf" });
          if (error) throw error;
        },
        createAsset: (input) =>
          fetchAdminJson("/api/admin/documents", {
            method: "POST",
            body: JSON.stringify(input),
          }),
      });
    },
    onSuccess: async () => {
      setTitle("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["admin-documents"] });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: "publish" | "unpublish" | "delete";
    }) => {
      const endpoint =
        action === "delete" ? `/api/admin/documents/${id}` : `/api/admin/documents/${id}/publish`;
      return fetchAdminJson(endpoint, {
        method: action === "publish" ? "POST" : "DELETE",
      });
    },
    onSuccess: (_data, variables) => {
      if (variables.action === "delete") {
        const total = documentsQuery.data?.total ?? 0;
        setPage((current) => pageAfterDelete({ page: current, total, pageSize: 25 }));
      }
      return queryClient.invalidateQueries({ queryKey: ["admin-documents"] });
    },
  });

  const loadError = documentsQuery.error ?? ownershipQuery.error;

  return (
    <DocumentManagementView
      data={documentsQuery.data}
      ownershipReady={ownershipQuery.isSuccess}
      ownerReleaseIds={ownershipQuery.data?.ownerReleaseIdsByAssetId}
      loading={documentsQuery.isLoading || ownershipQuery.isLoading}
      loadFailure={
        loadError
          ? {
              error: loadError,
              heading: documentErrorMessage(loadError, adminLanguage),
              onRetry: () => {
                void documentsQuery.refetch();
                void ownershipQuery.refetch();
              },
            }
          : null
      }
      error={
        documentErrorMessage(uploadMutation.error, adminLanguage) ??
        documentErrorMessage(actionMutation.error, adminLanguage)
      }
      query={query}
      kind={kind}
      language={language}
      page={page}
      title={title}
      uploadKind={uploadKind}
      uploadLanguage={uploadLanguage}
      uploading={uploadMutation.isPending}
      actionPending={actionMutation.isPending}
      fileInputRef={fileInputRef}
      onQueryChange={(value) => {
        setQuery(value);
        setPage(1);
      }}
      onKindChange={(value) => {
        setKind(value);
        setPage(1);
      }}
      onLanguageChange={(value) => {
        setLanguage(value);
        setPage(1);
      }}
      onPageChange={setPage}
      onTitleChange={setTitle}
      onUploadKindChange={setUploadKind}
      onUploadLanguageChange={setUploadLanguage}
      onFileChange={setFile}
      onUpload={() => uploadMutation.mutate()}
      onAction={(id, action) => actionMutation.mutate({ id, action })}
    />
  );
}

type ViewProps = {
  data?: DocumentListData;
  ownershipReady?: boolean;
  ownerReleaseIds?: Readonly<Record<string, string>>;
  loading?: boolean;
  /** The list or its ownership failed to load. Shown as a failure with a retry. */
  loadFailure?: ViewLoadFailure | null;
  /** A refusal or failure of an upload or an action. */
  error?: string | null;
  query?: string;
  kind?: DocumentKind | "all";
  language?: DocumentLanguage | "all";
  page?: number;
  title?: string;
  uploadKind?: DocumentKind;
  uploadLanguage?: DocumentLanguage;
  uploading?: boolean;
  onQueryChange?: (value: string) => void;
  onKindChange?: (value: DocumentKind | "all") => void;
  actionPending?: boolean;
  fileInputRef?: RefObject<HTMLInputElement | null>;
  onLanguageChange?: (value: DocumentLanguage | "all") => void;
  onPageChange?: (value: number) => void;
  onTitleChange?: (value: string) => void;
  onUploadKindChange?: (value: DocumentKind) => void;
  onUploadLanguageChange?: (value: DocumentLanguage) => void;
  onFileChange?: (file: File | null) => void;
  onUpload?: () => void;
  onAction?: (id: string, action: "publish" | "unpublish" | "delete") => void;
};

export function DocumentManagementView({
  data,
  ownershipReady = true,
  ownerReleaseIds = {},
  loading = false,
  loadFailure = null,
  error,
  query = "",
  kind = "all",
  language = "all",
  page = 1,
  title = "",
  uploadKind = "annual_report",
  uploadLanguage = "bilingual",
  uploading = false,
  onQueryChange,
  onKindChange,
  onLanguageChange,
  actionPending = false,
  fileInputRef,
  onPageChange,
  onTitleChange,
  onUploadKindChange,
  onUploadLanguageChange,
  onFileChange,
  onUpload,
  onAction,
}: ViewProps) {
  const common = useAdminCopy(documentsCopy);
  const copy = common.documents;
  const rows = data?.items ?? [];
  return (
    <div className="space-y-6 p-6">
      <header>
        <p className="text-sm font-semibold text-[var(--color-primary)]">{common.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      </header>

      {onUpload ? (
        <form
          className="grid gap-3 border-y border-[var(--color-border)] py-4 lg:grid-cols-[1.5fr_1fr_1fr_1.5fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            onUpload();
          }}
        >
          <label className="space-y-1 text-sm font-semibold">
            {copy.upload.title}
            <input
              value={title}
              onChange={(event) => onTitleChange?.(event.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            {copy.upload.kind}
            <select
              value={uploadKind}
              onChange={(event) => onUploadKindChange?.(event.target.value as DocumentKind)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              {Object.entries(common.kinds).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            {copy.upload.language}
            <select
              value={uploadLanguage}
              onChange={(event) => onUploadLanguageChange?.(event.target.value as DocumentLanguage)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              {Object.entries(common.languages).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            {copy.upload.file}
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => onFileChange?.(event.target.files?.[0] ?? null)}
              ref={fileInputRef}
              className="block w-full text-sm font-normal"
            />
          </label>
          <button
            type="submit"
            disabled={uploading}
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md bg-[var(--color-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {uploading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {copy.upload.submit}
          </button>
        </form>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr]">
        <label className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-[var(--color-text-muted)]" />
          <input
            aria-label={copy.filters.searchLabel}
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            placeholder={copy.filters.searchPlaceholder}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <select
          aria-label={copy.filters.kindLabel}
          value={kind}
          onChange={(event) => onKindChange?.(event.target.value as DocumentKind | "all")}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          <option value="all">{copy.filters.allKinds}</option>
          {Object.entries(common.kinds).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label={copy.filters.languageLabel}
          value={language}
          onChange={(event) => onLanguageChange?.(event.target.value as DocumentLanguage | "all")}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          <option value="all">{copy.filters.allLanguages}</option>
          {Object.entries(common.languages).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

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
          aria-live="assertive"
          className="border-l-4 border-[var(--color-error)] px-3 py-2 text-sm font-semibold text-[var(--color-error)]"
        >
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto border-y border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
              <th className="px-3 py-3">{copy.table.document}</th>
              <th className="px-3 py-3">{copy.table.kindAndLanguage}</th>
              <th className="px-3 py-3">{copy.table.size}</th>
              <th className="px-3 py-3">{copy.table.status}</th>
              <th className="px-3 py-3 text-right">{copy.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center">
                  {copy.table.loading}
                </td>
              </tr>
            ) : rows.length === 0 && !error && !loadFailure ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[var(--color-text-muted)]">
                  {copy.table.empty}
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2 font-semibold">
                      <FileText className="h-4 w-4 text-[var(--color-primary)]" />
                      {item.title}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                      {item.objectPath}
                    </span>
                    {ownerReleaseIds[item.id] ? (
                      <a
                        href={`/admin/content/adoption-guides?releaseId=${encodeURIComponent(ownerReleaseIds[item.id])}`}
                        className="mt-1 block text-xs font-semibold text-[var(--color-primary)] underline"
                      >
                        {copy.table.managedByReleases}
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {common.kinds[item.kind]}
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      {common.languages[item.language]}
                    </span>
                  </td>
                  <td className="px-3 py-3">{formatBytes(item.byteSize)}</td>
                  <td className="px-3 py-3">
                    {item.isPublished ? copy.table.published : copy.table.notPublished}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      {ownershipReady && onAction && !ownerReleaseIds[item.id] ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              onAction(item.id, item.isPublished ? "unpublish" : "publish")
                            }
                            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-semibold"
                            disabled={actionPending}
                          >
                            {item.isPublished ? copy.table.unpublish : copy.table.publish}
                          </button>
                          <button
                            type="button"
                            aria-label={copy.table.deleteLabel(item.title)}
                            disabled={actionPending}
                            onClick={() => {
                              if (globalThis.confirm?.(copy.table.confirmDelete(item.title))) {
                                onAction(item.id, "delete");
                              }
                            }}
                            className="rounded-md border border-[var(--color-border)] p-2 text-[var(--color-error)]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {onPageChange ? (
        <TablePager
          page={page}
          pageSize={25}
          total={data?.total}
          onPageChange={onPageChange}
          label={copy.table.pager}
          failed={Boolean(error || loadFailure)}
        />
      ) : null}
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
