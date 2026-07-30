import { useMemo, useRef, useState, type RefObject } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  LoaderCircle,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import { getSupabaseClient } from "../../../lib/supabase";
import { pageAfterDelete } from "./documentManagementLogic";
import type { DocumentAsset, DocumentKind, DocumentLanguage } from "../../../lib/documents/types";
import { uploadDocumentPdf } from "./documentUpload";
import { fetchAdoptionGuideReleaseOwnership } from "./adoptionGuideReleaseLogic";

const kindLabels: Record<DocumentKind, string> = {
  annual_report: "年度報告",
  wedding_form: "婚宴回禮表格",
  adoption_guide: "領養指南",
};
const languageLabels: Record<DocumentLanguage, string> = {
  "zh-HK": "中文",
  en: "English",
  bilingual: "中英雙語",
};

export type DocumentListData = { items: DocumentAsset[]; total: number };

export function DocumentManagement({ initialData }: { initialData?: DocumentListData }) {
  if (initialData) return <DocumentManagementView data={initialData} />;
  return <DocumentManagementRuntime />;
}

function DocumentManagementRuntime() {
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
      if (!file || !title.trim()) throw new Error("請填寫標題並選擇 PDF 檔案");
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

  return (
    <DocumentManagementView
      data={documentsQuery.data}
      ownershipReady={ownershipQuery.isSuccess}
      ownerReleaseIds={ownershipQuery.data?.ownerReleaseIdsByAssetId}
      loading={documentsQuery.isLoading || ownershipQuery.isLoading}
      error={
        (documentsQuery.error instanceof Error ? documentsQuery.error.message : null) ??
        (ownershipQuery.error instanceof Error ? ownershipQuery.error.message : null) ??
        (uploadMutation.error instanceof Error ? uploadMutation.error.message : null) ??
        (actionMutation.error instanceof Error ? actionMutation.error.message : null)
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
  const rows = data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 25));
  return (
    <div className="space-y-6 p-6">
      <header>
        <p className="text-sm font-semibold text-[var(--color-primary)]">宣傳內容</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">文件</h1>
        <p className="text-sm text-[var(--color-text-muted)]">管理公開 PDF、語言版本與發佈狀態。</p>
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
            標題
            <input
              value={title}
              onChange={(event) => onTitleChange?.(event.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            類型
            <select
              value={uploadKind}
              onChange={(event) => onUploadKindChange?.(event.target.value as DocumentKind)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              {Object.entries(kindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            語言
            <select
              value={uploadLanguage}
              onChange={(event) => onUploadLanguageChange?.(event.target.value as DocumentLanguage)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              {Object.entries(languageLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            PDF 檔案
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
            上載
          </button>
        </form>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr]">
        <label className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-[var(--color-text-muted)]" />
          <input
            aria-label="搜尋文件"
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            placeholder="搜尋標題或檔案路徑"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <select
          aria-label="文件類型"
          value={kind}
          onChange={(event) => onKindChange?.(event.target.value as DocumentKind | "all")}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          <option value="all">全部類型</option>
          {Object.entries(kindLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="文件語言"
          value={language}
          onChange={(event) => onLanguageChange?.(event.target.value as DocumentLanguage | "all")}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          <option value="all">全部語言</option>
          {Object.entries(languageLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

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
              <th className="px-3 py-3">文件</th>
              <th className="px-3 py-3">類型 / 語言</th>
              <th className="px-3 py-3">大小</th>
              <th className="px-3 py-3">狀態</th>
              <th className="px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center">
                  載入中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[var(--color-text-muted)]">
                  沒有文件
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
                        {"\u7531\u9818\u990a\u6307\u5357\u7248\u672c\u7ba1\u7406"}
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {kindLabels[item.kind]}
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      {languageLabels[item.language]}
                    </span>
                  </td>
                  <td className="px-3 py-3">{formatBytes(item.byteSize)}</td>
                  <td className="px-3 py-3">{item.isPublished ? "已發佈" : "未發佈"}</td>
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
                            {item.isPublished ? "取消發佈" : "發佈"}
                          </button>
                          <button
                            type="button"
                            aria-label={`刪除 ${item.title}`}
                            disabled={actionPending}
                            onClick={() => {
                              if (
                                globalThis.confirm?.(`確定刪除「${item.title}」？此操作無法復原。`)
                              ) {
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
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            aria-label="上一頁"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-md border border-[var(--color-border)] p-2 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            aria-label="下一頁"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            className="rounded-md border border-[var(--color-border)] p-2 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
