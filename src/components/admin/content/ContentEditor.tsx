import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Archive, ArrowLeft, Plus, RefreshCw, Save, Send } from "lucide-react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AnimalStoryType,
  ContentLinkRelationship,
  ContentLinkType,
  ContentDetail,
  ContentMedia,
  ContentStatus,
  ContentType,
  NotificationDraftStatus,
  PublishValidationIssue,
  RescuePublicStatus,
  SocialCopyStatus,
  StoryUpdateKind,
  StoryUpdateVisibility,
} from "../../../lib/content/types";
import { fetchAdminJson, getAdminAccessToken } from "../../../lib/admin/http";
import { getSupabaseClient } from "../../../lib/supabase";
import { uploadContentMediaImage } from "./contentMediaUpload";
import { StatusPill, type StatusTone } from "../StatusBadge";
import {
  contentStatusTone,
  formatContentTypeLabel,
  formatIsoForDatetimeLocal,
  parseDatetimeLocalToIso,
} from "./contentAdminLogic";
import {
  createEditorState,
  editorTransition,
  canPublish,
  createEditorOperationGate,
  canAcceptEditorReload,
} from "./editorState";
import { ContentRevisionPanel } from "./ContentRevisionPanel";
import { ContentTimeline } from "./ContentTimeline";
import { NotificationDraftPanel } from "./NotificationDraftPanel";
import { SocialCopyPanel } from "./SocialCopyPanel";

type ContentEditorProps = {
  contentId: string;
  initialContent?: ContentDetail;
};

type ContentDetailResponse = {
  content: ContentDetail;
};

const statusLabels: Record<ContentStatus, string> = {
  draft: "草稿",
  published: "已發布",
  archived: "已封存",
};

const animalTypeLabels: Record<AnimalStoryType, string> = {
  cat: "貓",
  dog: "狗",
  mixed: "貓狗",
  unknown: "未分類",
};

const publicStatusLabels: Record<RescuePublicStatus, string> = {
  rescued: "已救援",
  medical_care: "醫療照護",
  foster_recovery: "暫養康復",
  ready_for_adoption: "準備領養",
  adopted: "已領養",
  sponsor_needed: "需要助養",
  closed: "已完結",
};

const storyUpdateKindLabels: Record<StoryUpdateKind, string> = {
  medical: "醫療",
  care: "照顧",
  photo: "相片",
  foster: "寄養",
  adoption: "領養",
  general: "一般",
};

const storyUpdateVisibilityLabels: Record<StoryUpdateVisibility, string> = {
  public: "公開",
  internal: "內部",
};

const linkTypeLabels: Record<ContentLinkType, string> = {
  animal: "動物",
  adoption_case: "領養申請",
  successful_adoption: "成功領養",
  supporter: "支持者",
  volunteer_activity: "義工活動",
};

const linkRelationshipLabels: Record<ContentLinkRelationship, string> = {
  primary_subject: "主要主角",
  related_case: "相關個案",
  adopter: "領養人",
  volunteer_context: "義工背景",
  other: "其他",
};

const toneMap: Record<ReturnType<typeof contentStatusTone>, StatusTone> = {
  success: "success",
  warning: "warning",
  muted: "neutral",
};

const DirtyContext = createContext<(panel: string, dirty: boolean) => void>(() => undefined);
function useDirtyPanel(panel: string) {
  const report = useContext(DirtyContext);
  const [dirty, setDirty] = useState(false);
  return {
    dirty,
    mark: () => {
      setDirty(true);
      report(panel, true);
    },
    clear: () => {
      setDirty(false);
      report(panel, false);
    },
  };
}

export function ContentEditor({ contentId, initialContent }: ContentEditorProps) {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState(() =>
    createEditorState(initialContent?.version, initialContent?.revisionId ?? undefined),
  );
  const [historyPage, setHistoryPage] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const runOperation = useRef(createEditorOperationGate()).current;
  const dirtyVersions = useRef<Record<string, number | undefined>>({});
  const currentVersion = useRef(initialContent?.version);
  const expectedFor = (panel: string) =>
    Object.hasOwn(dirtyVersions.current, panel)
      ? dirtyVersions.current[panel]
      : currentVersion.current;
  const hasDirty = Object.values(editor.dirty).some(Boolean);
  const reportDirty = useCallback((panel: string, dirty: boolean) => {
    if (dirty && !Object.hasOwn(dirtyVersions.current, panel))
      dirtyVersions.current[panel] = currentVersion.current;
    if (!dirty) delete dirtyVersions.current[panel];
    setEditor((current) => editorTransition(current, { type: dirty ? "edit" : "saved", panel }));
  }, []);
  useBlocker({
    shouldBlockFn: () => hasDirty && !window.confirm("離開會捨棄未儲存的內容，確定離開？"),
    enableBeforeUnload: hasDirty,
  });

  const [validationIssues, setValidationIssues] = useState<PublishValidationIssue[]>([]);
  const [pendingCopyId, setPendingCopyId] = useState<string | null>(null);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [generatingUpdateId, setGeneratingUpdateId] = useState<string | null>(null);

  const contentQuery = useQuery({
    queryKey: ["admin-content-detail", contentId, historyPage],
    queryFn: () =>
      fetchAdminJson<ContentDetailResponse>(
        `/api/admin/content/${contentId}?historyPage=${historyPage}`,
      ),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    initialData: initialContent && historyPage === 1 ? { content: initialContent } : undefined,
  });

  const content = contentQuery.data?.content;
  currentVersion.current = content?.version;
  useEffect(() => {
    if (content)
      setEditor((current) => ({
        ...current,
        version: content.version,
        revisionId: content.revisionId ?? undefined,
      }));
  }, [content]);
  const [reloadError, setReloadError] = useState<string>();
  const reload = async () => {
    if (hasDirty && !window.confirm("重新載入會捨棄所有未儲存內容，確定繼續？")) return;
    const data = await contentQuery.refetch();
    if (!canAcceptEditorReload(data) || !data.data) {
      setReloadError("未能重新載入，未儲存內容已保留，請重試。");
      return;
    }
    setReloadError(undefined);
    if (data.data) {
      setEditor(
        createEditorState(data.data.content.version, data.data.content.revisionId ?? undefined),
      );
      dirtyVersions.current = {};
      setResetKey((value) => value + 1);
      setComparison(undefined);
      updateContent.reset();
      publishContent.reset();
      archiveContent.reset();
      upsertStoryProfile.reset();
      createStoryUpdate.reset();
      createContentMedia.reset();
      createContentLink.reset();
      restoreContent.reset();
    }
  };
  const [comparison, setComparison] = useState<ContentDetail>();
  const restoreContent = useMutation({
    mutationFn: (revisionId: string) =>
      fetchAdminJson(`/api/admin/content/${contentId}/revisions/${revisionId}/restore`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: content?.version }),
      }),
    onSuccess: async () => {
      await reload();
      void queryClient.invalidateQueries({ queryKey: ["admin-content-revisions", contentId] });
    },
  });

  const updateContent = useMutation({
    mutationFn: (body: ContentFormState) =>
      fetchAdminJson<ContentDetailResponse>(`/api/admin/content/${contentId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...normalizeForm(body), expectedVersion: expectedFor("content") }),
      }),
    onSuccess: (data) => {
      setValidationIssues([]);
      queryClient.setQueryData(["admin-content-detail", contentId, historyPage], data);
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    },
  });

  const publishContent = useMutation({
    mutationFn: () => publishWithValidation(contentId, content?.version, content?.revisionId),
    onSuccess: () => {
      setValidationIssues([]);
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    },
    onError: (error) => {
      if (error instanceof PublishValidationError) setValidationIssues(error.issues);
    },
  });

  const archiveContent = useMutation({
    mutationFn: () =>
      fetchAdminJson<ContentDetailResponse>(`/api/admin/content/${contentId}/archive`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: content?.version }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    },
  });

  const upsertStoryProfile = useMutation({
    mutationFn: (body: StoryProfileFormState) =>
      fetchAdminJson<ContentDetailResponse>(`/api/admin/content/${contentId}/story-profile`, {
        method: "PUT",
        body: JSON.stringify({
          ...normalizeStoryProfileForm(body),
          expectedVersion: expectedFor("profile"),
        }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-content-detail", contentId, historyPage], data);
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    },
  });

  const createStoryUpdate = useMutation({
    mutationFn: (body: StoryUpdateFormState) =>
      fetchAdminJson<{ id: string }>(`/api/admin/content/${contentId}/updates`, {
        method: "POST",
        body: JSON.stringify({
          ...normalizeStoryUpdateForm(body),
          expectedVersion: expectedFor("update"),
        }),
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] }),
  });

  const createContentMedia = useMutation({
    mutationFn: (body: ContentMediaFormState) =>
      createContentMediaWithUpload(contentId, body, expectedFor("media")),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    },
  });

  const createContentLink = useMutation({
    mutationFn: (body: ContentLinkFormState) =>
      fetchAdminJson<{ id: string }>(`/api/admin/content/${contentId}/links`, {
        method: "POST",
        body: JSON.stringify({ ...body, expectedVersion: expectedFor("link") }),
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] }),
  });

  const generateSocialCopy = useMutation({
    mutationFn: () =>
      fetchAdminJson<{ count: number }>(`/api/admin/content/${contentId}/social-copy`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] }),
  });

  const updateCopyStatus = useMutation({
    mutationFn: ({ copyId, status }: { copyId: string; status: SocialCopyStatus }) =>
      fetchAdminJson<{ ok: true }>(`/api/admin/content/social-copy/${copyId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onMutate: ({ copyId }) => setPendingCopyId(copyId),
    onSettled: () => setPendingCopyId(null),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] }),
  });

  const generateNotificationDrafts = useMutation({
    mutationFn: (updateId: string) =>
      fetchAdminJson<{ count: number }>(
        `/api/admin/content/updates/${updateId}/notification-drafts`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      ),
    onMutate: (updateId) => setGeneratingUpdateId(updateId),
    onSettled: () => setGeneratingUpdateId(null),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] }),
  });

  const updateDraftStatus = useMutation({
    mutationFn: ({ draftId, status }: { draftId: string; status: NotificationDraftStatus }) =>
      fetchAdminJson<{ ok: true }>(`/api/admin/content/notification-drafts/${draftId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onMutate: ({ draftId }) => setPendingDraftId(draftId),
    onSettled: () => setPendingDraftId(null),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] }),
  });

  const editorActionPending =
    restoreContent.isPending ||
    updateContent.isPending ||
    publishContent.isPending ||
    archiveContent.isPending ||
    upsertStoryProfile.isPending ||
    createStoryUpdate.isPending ||
    createContentMedia.isPending ||
    createContentLink.isPending ||
    generateSocialCopy.isPending ||
    updateCopyStatus.isPending ||
    generateNotificationDrafts.isPending ||
    updateDraftStatus.isPending;

  const conflict = [
    updateContent.error,
    publishContent.error,
    archiveContent.error,
    upsertStoryProfile.error,
    createStoryUpdate.error,
    createContentMedia.error,
    createContentLink.error,
    restoreContent.error,
  ].some((error) =>
    Boolean(error && typeof error === "object" && "status" in error && error.status === 409),
  );
  const publishAllowed = canPublish({ ...editor, pending: editorActionPending, conflict });
  if (contentQuery.isLoading) {
    return <div className="p-6 text-sm text-[var(--color-text-muted)]">載入宣傳內容...</div>;
  }

  if (!content) {
    return (
      <div className="space-y-3 p-6">
        <Link
          to="/admin/content"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回宣傳內容
        </Link>
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
          找不到宣傳內容。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/admin/content"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回宣傳內容
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--color-panel)]">{content.title}</h1>
            <StatusPill tone={toneMap[contentStatusTone(content.status)]}>
              {statusLabels[content.status]}
            </StatusPill>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {formatContentTypeLabel(content.type, "zh")} · {content.slug}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={editorActionPending || contentQuery.isFetching}
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)] disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            重新整理
          </button>
          <button
            type="button"
            disabled={!publishAllowed}
            onClick={() => {
              if (publishAllowed)
                void runOperation("publish", () => publishContent.mutateAsync()).catch(
                  () => undefined,
                );
            }}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            發布
          </button>
          <button
            type="button"
            disabled={editorActionPending}
            onClick={() => {
              if (!window.confirm(`確定封存「${content.title}」？封存後將不再於公開頁面顯示。`)) {
                return;
              }
              void runOperation("archive", () => archiveContent.mutateAsync()).catch(
                () => undefined,
              );
            }}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)] disabled:opacity-60"
          >
            <Archive className="h-4 w-4" />
            封存
          </button>
        </div>
      </div>

      {reloadError ? <p role="alert">{reloadError}</p> : null}
      <p role="status">
        {hasDirty
          ? "尚有未儲存變更，請先儲存各面板後發布。"
          : `已儲存草稿 · 版本 ${content.version ?? "—"}`}
      </p>
      {conflict ? (
        <div role="alert" className="rounded border border-amber-500 p-3">
          <p>
            內容已有較新版本或發布網址衝突。你的輸入已保留，請比較最新內容；重新載入前請先複製要保留的文字。
          </p>
          <button
            type="button"
            onClick={async () =>
              setComparison(
                (await fetchAdminJson<ContentDetailResponse>(`/api/admin/content/${contentId}`))
                  .content,
              )
            }
          >
            比較最新內容
          </button>
          <button type="button" onClick={() => void reload()}>
            重新載入最新版本
          </button>
        </div>
      ) : null}
      {comparison ? (
        <details open>
          <summary>伺服器最新版本 {comparison.version}（本機輸入保留於下方）</summary>
          <p>{comparison.title}</p>
          <p>{comparison.summary}</p>
          <pre className="whitespace-pre-wrap">{comparison.body}</pre>
        </details>
      ) : null}
      <nav aria-label="內容歷史分頁" className="flex items-center gap-3">
        <button
          type="button"
          disabled={historyPage === 1 || hasDirty || editorActionPending}
          onClick={() => setHistoryPage((page) => page - 1)}
        >
          上一頁紀錄
        </button>
        <span>紀錄第 {content.history?.page ?? historyPage} 頁 · 每類最多 20 筆</span>
        <button
          type="button"
          disabled={!content.history?.hasMore || hasDirty || editorActionPending}
          onClick={() => setHistoryPage((page) => page + 1)}
        >
          下一頁紀錄
        </button>
      </nav>
      <ContentRevisionPanel
        content={content}
        disabled={editorActionPending || hasDirty || conflict}
        onRestore={(id) => restoreContent.mutateAsync(id).then(() => undefined)}
      />
      {validationIssues.length > 0 ? <PublishValidationPanel issues={validationIssues} /> : null}
      <ActionErrors
        errors={[
          updateContent.error,
          publishContent.error,
          archiveContent.error,
          upsertStoryProfile.error,
          createStoryUpdate.error,
          createContentMedia.error,
          createContentLink.error,
          generateSocialCopy.error,
          updateCopyStatus.error,
          generateNotificationDrafts.error,
          updateDraftStatus.error,
        ]}
      />

      <DirtyContext.Provider value={reportDirty}>
        <fieldset
          key={`${contentId}-${resetKey}`}
          disabled={editorActionPending}
          className="space-y-6"
        >
          <ContentEditorForm
            content={content}
            pending={editorActionPending}
            onSave={(form) => runOperation("content", () => updateContent.mutateAsync(form))}
          />

          <ContentAuthoringPanels
            content={content}
            pending={editorActionPending}
            generatingUpdateId={generatingUpdateId}
            onCreateLink={(form) => runOperation("link", () => createContentLink.mutateAsync(form))}
            onSaveStoryProfile={(form) =>
              runOperation("profile", () => upsertStoryProfile.mutateAsync(form))
            }
            onCreateStoryUpdate={(form) =>
              runOperation("update", () => createStoryUpdate.mutateAsync(form))
            }
            onGenerateDrafts={(updateId) => generateNotificationDrafts.mutate(updateId)}
            onCreateMedia={(form) =>
              runOperation("media", () => createContentMedia.mutateAsync(form))
            }
          />
        </fieldset>
      </DirtyContext.Provider>

      <SocialCopyPanel
        copies={content.socialCopies}
        onGenerate={() => generateSocialCopy.mutate()}
        onUpdateStatus={(copyId, status) => updateCopyStatus.mutate({ copyId, status })}
        pendingCopyId={pendingCopyId}
        generating={generateSocialCopy.isPending}
        disabled={editorActionPending}
      />

      <NotificationDraftPanel
        drafts={content.notificationDrafts}
        onUpdateStatus={(draftId, status) => updateDraftStatus.mutate({ draftId, status })}
        pendingDraftId={pendingDraftId}
        disabled={editorActionPending}
      />
    </div>
  );
}

type ContentFormState = {
  type: ContentType;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  seoTitle: string;
  seoDescription: string;
  ogTitle: string;
  ogDescription: string;
};

type StoryProfileFormState = {
  animalType: AnimalStoryType;
  publicStatus: RescuePublicStatus;
  rescueRegion: string;
  rescueDate: string;
  showOnMap: boolean;
  publicMapLabel: string;
  publicLat: string;
  publicLng: string;
  internalAddress: string;
  internalLocationNotes: string;
  isFeatured: boolean;
};

type StoryUpdateFormState = {
  kind: StoryUpdateKind;
  title: string;
  body: string;
  occurredAt: string;
  visibility: StoryUpdateVisibility;
  shouldGenerateAdopterDrafts: boolean;
};

type ContentMediaFormState = {
  file: File | null;
  storyUpdateId: string;
  altText: string;
  caption: string;
  sortOrder: string;
  isCover: boolean;
};

type ContentLinkFormState = {
  linkedType: ContentLinkType;
  linkedId: string;
  relationship: ContentLinkRelationship;
};

type ContentAuthoringPanelsProps = {
  content: ContentDetail;
  pending: boolean;
  generatingUpdateId?: string | null;
  onCreateLink: (form: ContentLinkFormState) => Promise<void>;
  onSaveStoryProfile: (form: StoryProfileFormState) => Promise<void>;
  onCreateStoryUpdate: (form: StoryUpdateFormState) => Promise<void>;
  onGenerateDrafts?: (updateId: string) => void;
  onCreateMedia: (form: ContentMediaFormState) => Promise<void>;
};

export function ContentAuthoringPanels({
  content,
  pending,
  generatingUpdateId,
  onCreateLink,
  onSaveStoryProfile,
  onCreateStoryUpdate,
  onGenerateDrafts,
  onCreateMedia,
}: ContentAuthoringPanelsProps) {
  return (
    <>
      <section className="grid gap-4 lg:grid-cols-2">
        <LinkedRecords content={content} pending={pending} onCreate={onCreateLink} />
        <StoryWallSettings content={content} pending={pending} onSave={onSaveStoryProfile} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[var(--color-panel)]">故事更新</h2>
        <StoryUpdateCreateForm pending={pending} onCreate={onCreateStoryUpdate} />
        <ContentTimeline
          updates={content.updates}
          onGenerateDrafts={onGenerateDrafts}
          generatingUpdateId={generatingUpdateId}
          disabled={pending}
        />
      </section>

      <ContentMediaPanel content={content} pending={pending} onCreate={onCreateMedia} />
    </>
  );
}

function ContentEditorForm({
  content,
  pending,
  onSave,
}: {
  content: ContentDetail;
  pending: boolean;
  onSave: (form: ContentFormState) => Promise<void>;
}) {
  const panelState = useDirtyPanel("content");
  const initialForm = useMemo(() => formFromContent(content), [content]);
  const [form, setForm] = useState(initialForm);
  const [dirty, setDirty] = useState(false);
  const [lastContentId, setLastContentId] = useState(content.id);

  useEffect(() => {
    if (content.id !== lastContentId) {
      setForm(initialForm);
      setDirty(false);
      setLastContentId(content.id);
      return;
    }

    if (!dirty) setForm(initialForm);
  }, [content.id, dirty, initialForm, lastContentId]);

  const updateField = <Key extends keyof ContentFormState>(
    key: Key,
    value: ContentFormState[Key],
  ) => {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <form
      onChangeCapture={panelState.mark}
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await onSave(form);
          setDirty(false);
          panelState.clear();
        } catch {
          // Mutation errors are rendered by the parent; keep the dirty form intact.
        }
      }}
      className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-panel)]">基本內容</h2>
          <p className="text-sm text-[var(--color-text-muted)]">標題、摘要、SEO 與 CTA 設定。</p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {pending ? "儲存中" : "儲存草稿"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="標題">
          <input
            required
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="Slug">
          <input
            required
            value={form.slug}
            onChange={(event) => updateField("slug", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="類型">
          <select
            value={form.type}
            onChange={(event) => updateField("type", event.target.value as ContentType)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            {(["rescue_story", "event", "charity_market", "report"] as ContentType[]).map(
              (type) => (
                <option key={type} value={type}>
                  {formatContentTypeLabel(type, "zh")}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="副標題">
          <input
            value={form.subtitle}
            onChange={(event) => updateField("subtitle", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
      </div>

      <Field label="摘要">
        <textarea
          required
          rows={3}
          value={form.summary}
          onChange={(event) => updateField("summary", event.target.value)}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
        />
      </Field>
      <Field label="內文">
        <textarea
          rows={7}
          value={form.body}
          onChange={(event) => updateField("body", event.target.value)}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="CTA 文字">
          <input
            value={form.ctaLabel}
            onChange={(event) => updateField("ctaLabel", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="CTA 連結">
          <input
            value={form.ctaUrl}
            onChange={(event) => updateField("ctaUrl", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="SEO 標題">
          <input
            value={form.seoTitle}
            onChange={(event) => updateField("seoTitle", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="SEO 描述">
          <input
            value={form.seoDescription}
            onChange={(event) => updateField("seoDescription", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="OG 標題">
          <input
            value={form.ogTitle}
            onChange={(event) => updateField("ogTitle", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="OG 描述">
          <input
            value={form.ogDescription}
            onChange={(event) => updateField("ogDescription", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
      </div>
    </form>
  );
}

function LinkedRecords({
  content,
  pending,
  onCreate,
}: {
  content: ContentDetail;
  pending: boolean;
  onCreate: (form: ContentLinkFormState) => Promise<void>;
}) {
  const panelState = useDirtyPanel("link");
  const [form, setForm] = useState<ContentLinkFormState>({
    linkedType: "adoption_case",
    linkedId: "",
    relationship: "adopter",
  });

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-lg font-bold text-[var(--color-panel)]">關聯紀錄</h2>
      <form
        onChangeCapture={panelState.mark}
        className="mt-3 grid gap-3 md:grid-cols-[1fr_1.2fr_1fr_auto]"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await onCreate(form);
          } catch {
            return;
          }
          panelState.clear();
          setForm({ linkedType: "adoption_case", linkedId: "", relationship: "adopter" });
        }}
      >
        <Field label="類型">
          <select
            value={form.linkedType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                linkedType: event.target.value as ContentLinkType,
              }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            {(
              [
                "animal",
                "adoption_case",
                "successful_adoption",
                "supporter",
                "volunteer_activity",
              ] as ContentLinkType[]
            ).map((linkedType) => (
              <option key={linkedType} value={linkedType}>
                {linkTypeLabels[linkedType]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="紀錄 ID">
          <input
            required
            value={form.linkedId}
            onChange={(event) =>
              setForm((current) => ({ ...current, linkedId: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="關係">
          <select
            value={form.relationship}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                relationship: event.target.value as ContentLinkRelationship,
              }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            {(
              [
                "primary_subject",
                "related_case",
                "adopter",
                "volunteer_context",
                "other",
              ] as ContentLinkRelationship[]
            ).map((relationship) => (
              <option key={relationship} value={relationship}>
                {linkRelationshipLabels[relationship]}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          disabled={pending}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          新增關聯紀錄
        </button>
      </form>
      <div className="mt-3 space-y-2">
        {content.links.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">未連結任何紀錄。</p>
        ) : (
          content.links.map((link) => (
            <div
              key={link.id}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm"
            >
              <p className="font-semibold text-[var(--color-panel)]">
                {link.label ?? link.linkedId}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {linkTypeLabels[link.linkedType]} · {linkRelationshipLabels[link.relationship]}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function StoryWallSettings({
  content,
  pending,
  onSave,
}: {
  content: ContentDetail;
  pending: boolean;
  onSave: (form: StoryProfileFormState) => Promise<void>;
}) {
  const panelState = useDirtyPanel("profile");
  const initialForm = useMemo(() => storyProfileFormFromContent(content), [content]);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (!panelState.dirty) setForm(initialForm);
  }, [initialForm, panelState.dirty]);

  if (content.type !== "rescue_story") {
    return (
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-lg font-bold text-[var(--color-panel)]">故事牆設定</h2>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">只有救援故事需要故事牆設定。</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-lg font-bold text-[var(--color-panel)]">故事牆設定</h2>
      <form
        onChangeCapture={panelState.mark}
        className="mt-3 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await onSave(form);
            panelState.clear();
          } catch {
            /* Preserve unsaved profile; parent renders error. */
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="動物">
            <select
              value={form.animalType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  animalType: event.target.value as AnimalStoryType,
                }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            >
              {(["cat", "dog", "mixed", "unknown"] as AnimalStoryType[]).map((animalType) => (
                <option key={animalType} value={animalType}>
                  {animalTypeLabels[animalType]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="公開狀態">
            <select
              value={form.publicStatus}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  publicStatus: event.target.value as RescuePublicStatus,
                }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            >
              {(
                [
                  "rescued",
                  "medical_care",
                  "foster_recovery",
                  "ready_for_adoption",
                  "adopted",
                  "sponsor_needed",
                  "closed",
                ] as RescuePublicStatus[]
              ).map((publicStatus) => (
                <option key={publicStatus} value={publicStatus}>
                  {publicStatusLabels[publicStatus]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="救援地區">
            <input
              required
              value={form.rescueRegion}
              onChange={(event) =>
                setForm((current) => ({ ...current, rescueRegion: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
          <Field label="救援日期">
            <input
              type="date"
              value={form.rescueDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, rescueDate: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
          <Field label="地圖標籤">
            <input
              value={form.publicMapLabel}
              onChange={(event) =>
                setForm((current) => ({ ...current, publicMapLabel: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
          <Field label="公開緯度">
            <input
              inputMode="decimal"
              value={form.publicLat}
              onChange={(event) =>
                setForm((current) => ({ ...current, publicLat: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
          <Field label="公開經度">
            <input
              inputMode="decimal"
              value={form.publicLng}
              onChange={(event) =>
                setForm((current) => ({ ...current, publicLng: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
          <Field label="內部地址">
            <input
              value={form.internalAddress}
              onChange={(event) =>
                setForm((current) => ({ ...current, internalAddress: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
        </div>
        <Field label="內部位置備註">
          <textarea
            rows={2}
            value={form.internalLocationNotes}
            onChange={(event) =>
              setForm((current) => ({ ...current, internalLocationNotes: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-[var(--color-panel)]">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.showOnMap}
              onChange={(event) =>
                setForm((current) => ({ ...current, showOnMap: event.target.checked }))
              }
            />
            顯示於公開地圖
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(event) =>
                setForm((current) => ({ ...current, isFeatured: event.target.checked }))
              }
            />
            精選故事
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          儲存故事設定
        </button>
      </form>
    </section>
  );
}

function StoryUpdateCreateForm({
  pending,
  onCreate,
}: {
  pending: boolean;
  onCreate: (form: StoryUpdateFormState) => Promise<void>;
}) {
  const panelState = useDirtyPanel("update");
  const [form, setForm] = useState<StoryUpdateFormState>({
    kind: "general",
    title: "",
    body: "",
    occurredAt: "",
    visibility: "public",
    shouldGenerateAdopterDrafts: false,
  });

  return (
    <form
      onChangeCapture={panelState.mark}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await onCreate(form);
        } catch {
          return;
        }
        panelState.clear();
        setForm({
          kind: "general",
          title: "",
          body: "",
          occurredAt: "",
          visibility: "public",
          shouldGenerateAdopterDrafts: false,
        });
      }}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_1fr_1fr]">
        <Field label="類型">
          <select
            value={form.kind}
            onChange={(event) =>
              setForm((current) => ({ ...current, kind: event.target.value as StoryUpdateKind }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            {(
              ["medical", "care", "photo", "foster", "adoption", "general"] as StoryUpdateKind[]
            ).map((kind) => (
              <option key={kind} value={kind}>
                {storyUpdateKindLabels[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="標題">
          <input
            required
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="發生時間">
          <input
            required
            type="datetime-local"
            value={form.occurredAt}
            onChange={(event) =>
              setForm((current) => ({ ...current, occurredAt: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="可見度">
          <select
            value={form.visibility}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                visibility: event.target.value as StoryUpdateVisibility,
              }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            {(["public", "internal"] as StoryUpdateVisibility[]).map((visibility) => (
              <option key={visibility} value={visibility}>
                {storyUpdateVisibilityLabels[visibility]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="內容">
        <textarea
          rows={3}
          value={form.body}
          onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
          className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
        />
      </Field>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-panel)]">
          <input
            type="checkbox"
            checked={form.shouldGenerateAdopterDrafts}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                shouldGenerateAdopterDrafts: event.target.checked,
              }))
            }
          />
          發佈後可產生領養人通知草稿
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          新增故事更新
        </button>
      </div>
    </form>
  );
}

function ContentMediaPanel({
  content,
  pending,
  onCreate,
}: {
  content: ContentDetail;
  pending: boolean;
  onCreate: (form: ContentMediaFormState) => Promise<void>;
}) {
  const panelState = useDirtyPanel("media");
  const [form, setForm] = useState<ContentMediaFormState>({
    file: null,
    storyUpdateId: "",
    altText: "",
    caption: "",
    sortOrder: "0",
    isCover: false,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-panel)]">媒體與相片</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          上傳圖片作為封面或故事更新相片（JPG、PNG 或 WEBP，8 MiB 以內）。
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          圖片先儲存為私密媒體；內部更新的圖片不會公開。
        </p>
      </div>
      <form
        onChangeCapture={panelState.mark}
        className="grid gap-3 md:grid-cols-3"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await onCreate(form);
          } catch {
            return;
          }
          panelState.clear();
          setForm({
            file: null,
            storyUpdateId: "",
            altText: "",
            caption: "",
            sortOrder: "0",
            isCover: false,
          });
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      >
        <Field label="圖片檔案">
          <input
            required
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={(event) =>
              setForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="關聯更新">
          <select
            value={form.storyUpdateId}
            onChange={(event) =>
              setForm((current) => ({ ...current, storyUpdateId: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            <option value="">整篇內容</option>
            {content.updates.map((update) => (
              <option key={update.id} value={update.id}>
                {update.title}
                {update.visibility === "internal" ? "（內部）" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Alt text">
          <input
            required
            value={form.altText}
            onChange={(event) =>
              setForm((current) => ({ ...current, altText: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="說明">
          <input
            value={form.caption}
            onChange={(event) =>
              setForm((current) => ({ ...current, caption: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="排序">
          <input
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(event) =>
              setForm((current) => ({ ...current, sortOrder: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-panel)] md:col-span-2">
          <input
            type="checkbox"
            checked={form.isCover}
            onChange={(event) =>
              setForm((current) => ({ ...current, isCover: event.target.checked }))
            }
          />
          設為封面
        </label>
        <button
          type="submit"
          disabled={pending || !form.file}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          新增媒體
        </button>
      </form>
      <div className="grid gap-3 md:grid-cols-3">
        {content.media.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">尚未有媒體。</p>
        ) : (
          content.media.map((item) => <MediaCard key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}

function MediaCard({ item }: { item: ContentMedia }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm">
      {item.url ? (
        <img
          src={item.url}
          alt={item.altText}
          className="mb-2 aspect-[16/9] w-full rounded-md object-cover"
        />
      ) : null}
      <p className="font-semibold text-[var(--color-panel)]">{item.altText}</p>
      <p className="break-all text-xs text-[var(--color-text-muted)]">{item.storagePath}</p>
      {item.isCover ? (
        <p className="mt-1 text-xs font-semibold text-[var(--color-primary)]">封面</p>
      ) : null}
    </div>
  );
}

function PublishValidationPanel({ issues }: { issues: PublishValidationIssue[] }) {
  return (
    <section className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-surface)] p-4">
      <h2 className="font-bold text-[var(--color-panel)]">發布前需要修正</h2>
      <ul className="mt-2 space-y-1 text-sm text-[var(--color-text)]">
        {issues.map((issue) => (
          <li key={`${issue.field}-${issue.message}`}>
            <span className="font-semibold text-[var(--color-warning)]">{issue.field}</span>:{" "}
            {issue.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActionErrors({ errors }: { errors: unknown[] }) {
  const visibleErrors = errors.filter(
    (error): error is Error => error instanceof Error && !(error instanceof PublishValidationError),
  );
  if (visibleErrors.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--color-error)] bg-[var(--color-surface)] p-3 text-sm font-semibold text-[var(--color-error)]">
      {visibleErrors.map((error) => (
        <p key={error.message}>{error.message}</p>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
      {label}
      {children}
    </label>
  );
}

function formFromContent(content: ContentDetail): ContentFormState {
  return {
    type: content.type,
    slug: content.slug,
    title: content.title,
    subtitle: content.subtitle ?? "",
    summary: content.summary,
    body: content.body ?? "",
    ctaLabel: content.ctaLabel ?? "",
    ctaUrl: content.ctaUrl ?? "",
    seoTitle: content.seoTitle ?? "",
    seoDescription: content.seoDescription ?? "",
    ogTitle: content.ogTitle ?? "",
    ogDescription: content.ogDescription ?? "",
  };
}

function normalizeForm(form: ContentFormState) {
  const draft = form;
  return {
    ...draft,
    subtitle: emptyToNull(form.subtitle),
    body: emptyToNull(form.body),
    ctaLabel: emptyToNull(form.ctaLabel),
    ctaUrl: emptyToNull(form.ctaUrl),
    seoTitle: emptyToNull(form.seoTitle),
    seoDescription: emptyToNull(form.seoDescription),
    ogTitle: emptyToNull(form.ogTitle),
    ogDescription: emptyToNull(form.ogDescription),
  };
}

function storyProfileFormFromContent(content: ContentDetail): StoryProfileFormState {
  const profile = content.storyProfile;
  return {
    animalType: profile?.animalType ?? "unknown",
    publicStatus: profile?.publicStatus ?? "rescued",
    rescueRegion: profile?.rescueRegion ?? "",
    rescueDate: profile?.rescueDate ?? "",
    showOnMap: profile?.showOnMap ?? false,
    publicMapLabel: profile?.publicMapLabel ?? "",
    publicLat:
      profile?.publicLat === null || profile?.publicLat === undefined
        ? ""
        : String(profile.publicLat),
    publicLng:
      profile?.publicLng === null || profile?.publicLng === undefined
        ? ""
        : String(profile.publicLng),
    internalAddress: profile?.internalAddress ?? "",
    internalLocationNotes: profile?.internalLocationNotes ?? "",
    isFeatured: profile?.isFeatured ?? false,
  };
}

function normalizeStoryProfileForm(form: StoryProfileFormState) {
  return {
    ...form,
    rescueDate: emptyToNull(form.rescueDate),
    publicMapLabel: emptyToNull(form.publicMapLabel),
    publicLat: nullableNumber(form.publicLat),
    publicLng: nullableNumber(form.publicLng),
    internalAddress: emptyToNull(form.internalAddress),
    internalLocationNotes: emptyToNull(form.internalLocationNotes),
  };
}

function normalizeStoryUpdateForm(form: StoryUpdateFormState) {
  return {
    ...form,
    body: emptyToNull(form.body),
    occurredAt: parseDatetimeLocalToIso(form.occurredAt),
  };
}

// Extracted from createContentMedia's mutationFn so the real fetchAdminJson/
// getSupabaseClient wiring (not just uploadContentMediaImage's injected fakes)
// has a unit test to exercise directly, without needing a DOM to drive the
// form's submit event.
type CachedMediaUpload = {
  token: string;
  path: string;
  bucket: string;
  uploadSessionId: string;
  uploaded: boolean;
};
const pendingMediaUploads = new WeakMap<File, Map<string, CachedMediaUpload>>();
export async function createContentMediaWithUpload(
  contentId: string,
  body: ContentMediaFormState,
  expectedVersion?: number,
) {
  if (!body.file) throw new Error("請選擇圖片");
  if (expectedVersion === undefined) throw new Error("請重新載入內容後再上傳圖片");
  const cacheKey = `${contentId}:${expectedVersion}:${body.storyUpdateId}`;
  const sessions = pendingMediaUploads.get(body.file) ?? new Map<string, CachedMediaUpload>();
  pendingMediaUploads.set(body.file, sessions);
  let target = sessions.get(cacheKey);
  const finalize = async (path: string, sessionId: string) =>
    fetchAdminJson<{ id: string }>(`/api/admin/content/${contentId}/media`, {
      method: "POST",
      body: JSON.stringify({
        ...normalizeContentMediaForm({ ...body, storagePath: path }),
        uploadSessionId: sessionId,
        expectedVersion,
      }),
    });
  if (target && !target.uploaded) {
    try {
      const recovered = await finalize(target.path, target.uploadSessionId);
      sessions.delete(cacheKey);
      return recovered;
    } catch (error) {
      if (!error || typeof error !== "object" || !("status" in error) || error.status !== 404)
        throw error;
    }
  }

  const storagePath = await uploadContentMediaImage({
    file: body.file,
    contentId,
    storyUpdateId: emptyToNull(body.storyUpdateId),
    requestUploadTarget: async (input) => {
      if (!target) {
        const allocated = await fetchAdminJson<Omit<CachedMediaUpload, "uploaded">>(
          `/api/admin/content/${contentId}/media-upload-target`,
          { method: "POST", body: JSON.stringify({ ...input, expectedVersion }) },
        );
        if (allocated.bucket !== "content-media-private" || !allocated.uploadSessionId)
          throw new Error("無法取得私密媒體上傳位置");
        target = { ...allocated, uploaded: false };
        sessions.set(cacheKey, target);
      }
      return target;
    },
    uploadToSignedUrl: async (path, token, file) => {
      if (!target || target.uploaded) return;
      const { error } = await getSupabaseClient()
        .storage.from(target.bucket)
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (error) throw error;
      target.uploaded = true;
    },
  });
  if (!target) throw new Error("Missing upload session");
  const result = await finalize(storagePath, target.uploadSessionId);
  sessions.delete(cacheKey);
  return result;
}

function normalizeContentMediaForm(form: ContentMediaFormState & { storagePath: string }) {
  return {
    storyUpdateId: emptyToNull(form.storyUpdateId),
    storagePath: form.storagePath,
    altText: form.altText,
    caption: emptyToNull(form.caption),
    sortOrder: Number(form.sortOrder || 0),
    isCover: form.isCover,
  };
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

class PublishValidationError extends Error {
  constructor(public issues: PublishValidationIssue[]) {
    super("Content item cannot be published");
  }
}

async function publishWithValidation(
  contentId: string,
  expectedVersion?: number,
  revisionId?: string | null,
) {
  if (expectedVersion === undefined || !revisionId)
    throw new Error("請先儲存內容並重新載入後再發布");
  const token = await getAdminAccessToken();
  const response = await fetch(`/api/admin/content/${contentId}/publish`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      expectedVersion,
      revisionId,
      idempotencyKey: `content-publish-${contentId}-${expectedVersion}-${revisionId}`,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const issues = Array.isArray(body.issues) ? body.issues : [];
    if (issues.length > 0) throw new PublishValidationError(issues);
    const error = new Error(
      typeof body.error === "string"
        ? body.error
        : typeof body.error?.message === "string"
          ? body.error.message
          : "API request failed",
    );
    throw Object.assign(error, { status: response.status });
  }

  return body as ContentDetailResponse;
}
