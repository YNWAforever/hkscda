import { Button } from "@/components/ui/button";
import { ContentReviewPanel } from "./ContentReview";
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
import { Link } from "@tanstack/react-router";
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
import { adminErrorMessage } from "../../../lib/admin/session";
import type { AdminLanguage } from "../../../lib/admin/language";
import { contentServerMessage } from "../../../lib/content/serverMessages";
import { getSupabaseClient } from "../../../lib/supabase";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy, useAdminCopy } from "../i18n/copy";
import { uploadContentMediaImage } from "./contentMediaUpload";
import { StatusPill, type StatusTone } from "../StatusBadge";
import {
  contentStatusTone,
  formatContentTypeLabel,
  formatIsoForDatetimeLocal,
  parseDatetimeLocalToIso,
} from "./contentAdminLogic";
import { contentCommonCopy } from "./contentCommonCopy";
import { ContentAdminError, contentFailure } from "./contentErrors";
import { editorCopy } from "./editorCopy";
import {
  createEditorState,
  editorTransition,
  canPublish,
  createEditorOperationGate,
  canAcceptEditorReload,
} from "./editorState";
import { ContentRevisionPanel } from "./ContentRevisionPanel";
import { ContentTimeline } from "./ContentTimeline";
import { LinkedRecordPicker } from "./LinkedRecordPicker";
import { NotificationDraftPanel } from "./NotificationDraftPanel";
import { SocialCopyPanel, type SocialCopyPatch } from "./SocialCopyPanel";
import { useBreadcrumbRecordName } from "../adminBreadcrumbRecord";
import { DestinationHeading } from "../DestinationHeading";
import { LoadFailure } from "../LoadFailure";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { useLeaveConfirm } from "../useLeaveConfirm";

type ContentEditorProps = {
  contentId: string;
  initialContent?: ContentDetail;
};

type ContentDetailResponse = {
  content: ContentDetail & { mediaPending?: number };
};

const toneMap: Record<ReturnType<typeof contentStatusTone>, StatusTone> = {
  success: "success",
  warning: "warning",
  muted: "neutral",
};

export type AdopterDraftNotice = {
  created: number;
  warning: string | null;
};

/**
 * The notice to show after a story update is saved. The server sends a zh-HK warning when it
 * could not create the drafts; it is written in `language` when it is one of the known messages
 * and shown as it came otherwise. zh-HK when no language is given.
 */
export function formatAdopterDraftNotice(
  drafts: AdopterDraftNotice | null | undefined,
  language: AdminLanguage = "zh",
): string | null {
  if (!drafts) return null;
  if (drafts.warning) return contentServerMessage(drafts.warning, language);
  if (drafts.created === 0) return null;
  return pickAdminCopy(editorCopy, language).draftNotice.created(drafts.created);
}

export function StoryUpdateDraftNotice({ notice }: { notice: string | null }) {
  if (!notice) return null;
  return (
    <p
      role="status"
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm"
    >
      {notice}
    </p>
  );
}

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
  const copy = useAdminCopy(editorCopy);
  const common = useAdminCopy(contentCommonCopy);
  const { language } = useAdminLanguage();
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
  const leaveDialog = useLeaveConfirm({ dirty: hasDirty, consequence: copy.leaveConfirm });
  const [reloadOpen, setReloadOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const [validationIssues, setValidationIssues] = useState<PublishValidationIssue[]>([]);
  const [pendingPublishedMedia, setPendingPublishedMedia] = useState(0);
  const [pendingCopyId, setPendingCopyId] = useState<string | null>(null);
  const [savingCopyId, setSavingCopyId] = useState<string | null>(null);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [generatingUpdateId, setGeneratingUpdateId] = useState<string | null>(null);
  // What the server said about the notification drafts of the last saved update. The notice is
  // written from it when the page renders, so it follows the admin's language.
  const [updateDraftNotice, setUpdateDraftNotice] = useState<AdopterDraftNotice | null>(null);

  // TanStack Router keeps this component mounted when only the `contentId`
  // param changes, so a stale draft notice must be cleared on id change.
  useEffect(() => {
    setUpdateDraftNotice(null);
  }, [contentId]);

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
  useBreadcrumbRecordName(content?.title);
  currentVersion.current = content?.version;
  useEffect(() => {
    if (content)
      setEditor((current) => ({
        ...current,
        version: content.version,
        revisionId: content.revisionId ?? undefined,
      }));
  }, [content]);
  const [reloadFailed, setReloadFailed] = useState(false);
  const requestReload = async () => {
    if (hasDirty) {
      setReloadOpen(true);
      return;
    }
    await performReload();
  };
  const performReload = async () => {
    const data = await contentQuery.refetch();
    if (!canAcceptEditorReload(data) || !data.data) {
      setReloadFailed(true);
      return;
    }
    setReloadFailed(false);
    if (data.data) {
      setEditor(
        createEditorState(data.data.content.version, data.data.content.revisionId ?? undefined),
      );
      dirtyVersions.current = {};
      setResetKey((value) => value + 1);
      setComparison(undefined);
      setUpdateDraftNotice(null);
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
      await requestReload();
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

  const updatePublicationMetadata = useMutation({
    mutationFn: (body: PublicationMetadataFormState) =>
      fetchAdminJson(`/api/admin/content/${contentId}/publication-metadata`, {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: expectedFor("metadata"),
          contentClass: body.contentClass,
          sourceReference: emptyToNull(body.sourceReference),
          contentOwner: emptyToNull(body.contentOwner),
          effectiveFrom: body.effectiveFrom ? parseDatetimeLocalToIso(body.effectiveFrom) : null,
          effectiveUntil: body.effectiveUntil ? parseDatetimeLocalToIso(body.effectiveUntil) : null,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content-revisions", contentId] });
    },
  });

  const publishContent = useMutation({
    mutationFn: () => publishWithValidation(contentId, content?.version, content?.revisionId),
    onSuccess: (data) => {
      setValidationIssues([]);
      setPendingPublishedMedia(data.content.mediaPending ?? 0);
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
      fetchAdminJson<{ id: string; notificationDrafts?: AdopterDraftNotice }>(
        `/api/admin/content/${contentId}/updates`,
        {
          method: "POST",
          body: JSON.stringify({
            ...normalizeStoryUpdateForm(body),
            expectedVersion: expectedFor("update"),
          }),
        },
      ),
    onSuccess: (result) => {
      setUpdateDraftNotice(result.notificationDrafts ?? null);
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
    },
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

  const updateSocialCopy = useMutation({
    mutationFn: ({ copyId, patch }: { copyId: string; patch: SocialCopyPatch }) =>
      fetchAdminJson<{ ok: true }>(`/api/admin/content/social-copy/${copyId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onMutate: ({ copyId }) => setSavingCopyId(copyId),
    onSettled: () => setSavingCopyId(null),
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
    updatePublicationMetadata.isPending ||
    updateContent.isPending ||
    publishContent.isPending ||
    archiveContent.isPending ||
    upsertStoryProfile.isPending ||
    createStoryUpdate.isPending ||
    createContentMedia.isPending ||
    createContentLink.isPending ||
    generateSocialCopy.isPending ||
    updateCopyStatus.isPending ||
    updateSocialCopy.isPending ||
    generateNotificationDrafts.isPending ||
    updateDraftStatus.isPending;

  const conflict = [
    updateContent.error,
    updatePublicationMetadata.error,
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
    return (
      <div className="space-y-3 p-6">
        <DestinationHeading id="content" />
        <p className="text-sm text-[var(--color-text-muted)]">{copy.loading}</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="space-y-3 p-6">
        <Link
          to="/admin/content"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {copy.back}
        </Link>
        <DestinationHeading id="content" />
        {contentQuery.error ? (
          // A failed read is not a missing item: say which it was, and offer the retry.
          <LoadFailure error={contentQuery.error} onRetry={() => void contentQuery.refetch()} />
        ) : (
          <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
            {copy.notFound}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {leaveDialog}
      <ConfirmActionDialog
        open={reloadOpen}
        onOpenChange={setReloadOpen}
        title={copy.conflict.reload}
        consequence={copy.reloadConfirm}
        confirmLabel={copy.conflict.reload}
        destructive
        reason="none"
        onConfirm={performReload}
      />
      <ConfirmActionDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={copy.archive}
        consequence={copy.archiveConfirm(content.title)}
        confirmLabel={copy.archive}
        destructive
        reason="none"
        onConfirm={async () => {
          await runOperation("archive", () => archiveContent.mutateAsync()).catch(() => undefined);
        }}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/admin/content"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy.back}
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--color-panel)]">{content.title}</h1>
            <StatusPill tone={toneMap[contentStatusTone(content.status)]}>
              {common.statuses[content.status]}
            </StatusPill>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {formatContentTypeLabel(content.type, language)} · {content.slug}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={editorActionPending || contentQuery.isFetching}
            onClick={() => void requestReload()}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)] disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            {copy.refresh}
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
            {copy.publish}
          </button>
          <button
            type="button"
            disabled={editorActionPending}
            onClick={() => setArchiveOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)] disabled:opacity-60"
          >
            <Archive className="h-4 w-4" />
            {copy.archive}
          </button>
        </div>
      </div>

      {reloadFailed ? <p role="alert">{copy.reloadFailed}</p> : null}
      <p role="status">{hasDirty ? copy.unsaved : copy.saved(content.version)}</p>
      {conflict ? (
        <div role="alert" className="rounded border border-[var(--color-warning)] p-3">
          <p>{copy.conflict.message}</p>
          <Button
            variant="outline"
            type="button"
            onClick={async () =>
              setComparison(
                (await fetchAdminJson<ContentDetailResponse>(`/api/admin/content/${contentId}`))
                  .content,
              )
            }
          >
            {copy.conflict.compare}
          </Button>
          <Button variant="outline" type="button" onClick={() => void requestReload()}>
            {copy.conflict.reload}
          </Button>
        </div>
      ) : null}
      {comparison ? (
        <details open>
          <summary>{copy.conflict.latest(comparison.version)}</summary>
          <p>{comparison.title}</p>
          <p>{comparison.summary}</p>
          <pre className="whitespace-pre-wrap">{comparison.body}</pre>
        </details>
      ) : null}
      <nav aria-label={copy.history.label} className="flex items-center gap-3">
        <Button
          variant="outline"
          type="button"
          disabled={historyPage === 1 || hasDirty || editorActionPending}
          onClick={() => setHistoryPage((page) => page - 1)}
        >
          {copy.history.previous}
        </Button>
        <span>{copy.history.page(content.history?.page ?? historyPage)}</span>
        <Button
          variant="outline"
          type="button"
          disabled={!content.history?.hasMore || hasDirty || editorActionPending}
          onClick={() => setHistoryPage((page) => page + 1)}
        >
          {copy.history.next}
        </Button>
      </nav>
      <StoryUpdateDraftNotice notice={formatAdopterDraftNotice(updateDraftNotice, language)} />
      {content.revisionId && (
        <ContentReviewPanel
          key={content.revisionId}
          kind="content"
          id={contentId}
          revision={content.revisionId}
          disabled={hasDirty}
        />
      )}
      <ContentRevisionPanel
        content={content}
        disabled={editorActionPending || hasDirty || conflict}
        onRestore={(id) => restoreContent.mutateAsync(id).then(() => undefined)}
      />
      {pendingPublishedMedia > 0 ? (
        <p
          role="status"
          className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-highlight)] p-3 text-sm text-[var(--color-warning)]"
        >
          {copy.syncingMedia(pendingPublishedMedia)}
        </p>
      ) : null}
      {validationIssues.length > 0 ? <PublishValidationPanel issues={validationIssues} /> : null}
      <ActionErrors
        errors={[
          updateContent.error,
          updatePublicationMetadata.error,
          publishContent.error,
          archiveContent.error,
          upsertStoryProfile.error,
          createStoryUpdate.error,
          createContentMedia.error,
          createContentLink.error,
          generateSocialCopy.error,
          updateCopyStatus.error,
          updateSocialCopy.error,
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

          <PublicationMetadataForm
            content={content}
            pending={editorActionPending}
            onSave={(form) =>
              runOperation("metadata", () => updatePublicationMetadata.mutateAsync(form))
            }
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
        onSave={(copyId, patch) => updateSocialCopy.mutate({ copyId, patch })}
        pendingCopyId={pendingCopyId}
        savingCopyId={savingCopyId}
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

type PublicationMetadataFormState = {
  contentClass: NonNullable<ContentDetail["contentClass"]>;
  sourceReference: string;
  contentOwner: string;
  effectiveFrom: string;
  effectiveUntil: string;
};

function PublicationMetadataForm({
  content,
  pending,
  onSave,
}: {
  content: ContentDetail;
  pending: boolean;
  onSave: (value: PublicationMetadataFormState) => Promise<void>;
}) {
  const copy = useAdminCopy(editorCopy).metadata;
  const panelState = useDirtyPanel("metadata");
  const initial = useMemo<PublicationMetadataFormState>(
    () => ({
      contentClass: content.contentClass ?? "unreviewed",
      sourceReference: content.sourceReference ?? "",
      contentOwner: content.contentOwner ?? "",
      effectiveFrom: content.effectiveFrom ? formatIsoForDatetimeLocal(content.effectiveFrom) : "",
      effectiveUntil: content.effectiveUntil
        ? formatIsoForDatetimeLocal(content.effectiveUntil)
        : "",
    }),
    [content],
  );
  const [form, setForm] = useState(initial);
  useEffect(() => {
    if (!panelState.dirty) setForm(initial);
  }, [initial, panelState.dirty]);
  const update = <K extends keyof PublicationMetadataFormState>(
    key: K,
    value: PublicationMetadataFormState[K],
  ) => {
    panelState.mark();
    setForm((current) => ({ ...current, [key]: value }));
  };
  return (
    <form
      className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await onSave(form);
          panelState.clear();
        } catch {
          /* Parent shows the error; preserve input. */
        }
      }}
    >
      <div>
        <h2 className="text-lg font-bold text-[var(--color-panel)]">{copy.heading}</h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={copy.classification}>
          <select
            value={form.contentClass}
            onChange={(event) =>
              update(
                "contentClass",
                event.target.value as PublicationMetadataFormState["contentClass"],
              )
            }
            className="w-full rounded-md border p-2"
          >
            <option value="unreviewed">{copy.classes.unreviewed}</option>
            <option value="verified">{copy.classes.verified}</option>
            <option value="demo">{copy.classes.demo}</option>
          </select>
        </Field>
        <Field label={copy.source}>
          <input
            value={form.sourceReference}
            onChange={(event) => update("sourceReference", event.target.value)}
            maxLength={500}
            className="w-full rounded-md border p-2"
          />
        </Field>
        <Field label={copy.owner}>
          <input
            value={form.contentOwner}
            onChange={(event) => update("contentOwner", event.target.value)}
            maxLength={120}
            className="w-full rounded-md border p-2"
          />
        </Field>
        <Field label={copy.effectiveFrom}>
          <input
            type="datetime-local"
            value={form.effectiveFrom}
            onChange={(event) => update("effectiveFrom", event.target.value)}
            className="w-full rounded-md border p-2"
          />
        </Field>
        <Field label={copy.effectiveUntil}>
          <input
            type="datetime-local"
            value={form.effectiveUntil}
            onChange={(event) => update("effectiveUntil", event.target.value)}
            className="w-full rounded-md border p-2"
          />
        </Field>
      </div>
      <button
        type="submit"
        disabled={pending || !panelState.dirty}
        className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-primary-foreground)] disabled:opacity-60"
      >
        {copy.save}
      </button>
    </form>
  );
}

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
  const copy = useAdminCopy(editorCopy).updates;
  return (
    <>
      <section className="grid gap-4 lg:grid-cols-2">
        <LinkedRecords content={content} pending={pending} onCreate={onCreateLink} />
        <StoryWallSettings content={content} pending={pending} onSave={onSaveStoryProfile} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[var(--color-panel)]">{copy.heading}</h2>
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
  const copy = useAdminCopy(editorCopy).form;
  const { language } = useAdminLanguage();
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
          <h2 className="text-lg font-bold text-[var(--color-panel)]">{copy.heading}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {pending ? copy.saving : copy.save}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label={copy.title}>
          <input
            required
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label={copy.slug}>
          <input
            required
            value={form.slug}
            onChange={(event) => updateField("slug", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label={copy.type}>
          <select
            value={form.type}
            onChange={(event) => updateField("type", event.target.value as ContentType)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            {(["rescue_story", "event", "charity_market", "report"] as ContentType[]).map(
              (type) => (
                <option key={type} value={type}>
                  {formatContentTypeLabel(type, language)}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label={copy.subtitle}>
          <input
            value={form.subtitle}
            onChange={(event) => updateField("subtitle", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
      </div>

      <Field label={copy.summary}>
        <textarea
          required
          rows={3}
          value={form.summary}
          onChange={(event) => updateField("summary", event.target.value)}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
        />
      </Field>
      <Field label={copy.body}>
        <textarea
          rows={7}
          value={form.body}
          onChange={(event) => updateField("body", event.target.value)}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label={copy.ctaLabel}>
          <input
            value={form.ctaLabel}
            onChange={(event) => updateField("ctaLabel", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label={copy.ctaUrl}>
          <input
            value={form.ctaUrl}
            onChange={(event) => updateField("ctaUrl", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label={copy.seoTitle}>
          <input
            value={form.seoTitle}
            onChange={(event) => updateField("seoTitle", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label={copy.seoDescription}>
          <input
            value={form.seoDescription}
            onChange={(event) => updateField("seoDescription", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label={copy.ogTitle}>
          <input
            value={form.ogTitle}
            onChange={(event) => updateField("ogTitle", event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label={copy.ogDescription}>
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
  const copy = useAdminCopy(editorCopy).links;
  const { language } = useAdminLanguage();
  const panelState = useDirtyPanel("link");
  const [form, setForm] = useState<ContentLinkFormState>({
    linkedType: "adoption_case",
    linkedId: "",
    relationship: "adopter",
  });
  const [linkedLabel, setLinkedLabel] = useState("");

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-lg font-bold text-[var(--color-panel)]">{copy.heading}</h2>
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
          setLinkedLabel("");
        }}
      >
        <Field label={copy.type}>
          <select
            value={form.linkedType}
            onChange={(event) => {
              setForm((current) => ({
                ...current,
                linkedType: event.target.value as ContentLinkType,
                linkedId: "",
              }));
              setLinkedLabel("");
            }}
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
                {copy.types[linkedType]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy.record}>
          <LinkedRecordPicker
            linkedType={form.linkedType}
            value={form.linkedId}
            label={linkedLabel}
            disabled={pending}
            onChange={(pick) => {
              setForm((current) => ({ ...current, linkedId: pick.id }));
              setLinkedLabel(pick.label);
            }}
          />
        </Field>
        <Field label={copy.relationship}>
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
                {copy.relationships[relationship]}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          disabled={pending || !form.linkedId}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {copy.add}
        </button>
      </form>
      <div className="mt-3 space-y-2">
        {content.links.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{copy.empty}</p>
        ) : (
          content.links.map((link) => (
            <div
              key={link.id}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm"
            >
              <p className="font-semibold text-[var(--color-panel)]">
                {link.label == null ? link.linkedId : contentServerMessage(link.label, language)}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {copy.types[link.linkedType]} · {copy.relationships[link.relationship]}
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
  const copy = useAdminCopy(editorCopy).wall;
  const panelState = useDirtyPanel("profile");
  const initialForm = useMemo(() => storyProfileFormFromContent(content), [content]);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (!panelState.dirty) setForm(initialForm);
  }, [initialForm, panelState.dirty]);

  if (content.type !== "rescue_story") {
    return (
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-lg font-bold text-[var(--color-panel)]">{copy.heading}</h2>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{copy.notNeeded}</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-lg font-bold text-[var(--color-panel)]">{copy.heading}</h2>
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
          <Field label={copy.animal}>
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
                  {copy.animalTypes[animalType]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={copy.publicStatus}>
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
                  {copy.publicStatuses[publicStatus]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={copy.region}>
            <input
              required
              value={form.rescueRegion}
              onChange={(event) =>
                setForm((current) => ({ ...current, rescueRegion: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
          <Field label={copy.date}>
            <input
              type="date"
              value={form.rescueDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, rescueDate: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
          <Field label={copy.mapLabel}>
            <input
              value={form.publicMapLabel}
              onChange={(event) =>
                setForm((current) => ({ ...current, publicMapLabel: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
          <Field label={copy.latitude}>
            <input
              inputMode="decimal"
              value={form.publicLat}
              onChange={(event) =>
                setForm((current) => ({ ...current, publicLat: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
          <Field label={copy.longitude}>
            <input
              inputMode="decimal"
              value={form.publicLng}
              onChange={(event) =>
                setForm((current) => ({ ...current, publicLng: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
          <Field label={copy.address}>
            <input
              value={form.internalAddress}
              onChange={(event) =>
                setForm((current) => ({ ...current, internalAddress: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            />
          </Field>
        </div>
        <Field label={copy.notes}>
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
            {copy.showOnMap}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(event) =>
                setForm((current) => ({ ...current, isFeatured: event.target.checked }))
              }
            />
            {copy.featured}
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {copy.save}
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
  const copy = useAdminCopy(editorCopy).updates;
  const common = useAdminCopy(contentCommonCopy);
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
        <Field label={copy.type}>
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
                {common.updateKinds[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy.title}>
          <input
            required
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label={copy.occurredAt}>
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
        <Field label={copy.visibility}>
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
                {common.visibility[visibility]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={copy.body}>
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
          {copy.allowDrafts}
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {copy.add}
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
  const copy = useAdminCopy(editorCopy).media;
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
        <h2 className="text-lg font-bold text-[var(--color-panel)]">{copy.heading}</h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro1}</p>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro2}</p>
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
        <Field label={copy.file}>
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
        <Field label={copy.update}>
          <select
            value={form.storyUpdateId}
            onChange={(event) =>
              setForm((current) => ({ ...current, storyUpdateId: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            <option value="">{copy.whole}</option>
            {content.updates.map((update) => (
              <option key={update.id} value={update.id}>
                {copy.updateOption(update.title, update.visibility === "internal")}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy.altText}>
          <input
            required
            value={form.altText}
            onChange={(event) =>
              setForm((current) => ({ ...current, altText: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label={copy.caption}>
          <input
            value={form.caption}
            onChange={(event) =>
              setForm((current) => ({ ...current, caption: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label={copy.sortOrder}>
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
          {copy.cover}
        </label>
        <button
          type="submit"
          disabled={pending || !form.file}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {copy.add}
        </button>
      </form>
      <div className="grid gap-3 md:grid-cols-3">
        {content.media.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{copy.empty}</p>
        ) : (
          content.media.map((item) => <MediaCard key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}

function MediaCard({ item }: { item: ContentMedia }) {
  const copy = useAdminCopy(editorCopy).media;
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
        <p className="mt-1 text-xs font-semibold text-[var(--color-primary)]">{copy.coverBadge}</p>
      ) : null}
    </div>
  );
}

/** The checks that stopped a publish, each naming the field. The messages come from the server. */
export function PublishValidationPanel({ issues }: { issues: PublishValidationIssue[] }) {
  const copy = useAdminCopy(editorCopy).publishIssues;
  return (
    <section className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-surface)] p-4">
      <h2 className="font-bold text-[var(--color-panel)]">{copy.heading}</h2>
      <ul className="mt-2 space-y-1 text-sm text-[var(--color-text)]">
        {issues.map((issue) => (
          <li key={`${issue.field}-${issue.message}`}>
            <span className="font-semibold text-[var(--color-warning)]">
              {copy.field(issue.field)}
            </span>
            : {issue.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What the editor's actions failed with. A content error is written from its code, a session
 * error is translated, and any other reason (the server's, in English) is shown as it came.
 */
export function ActionErrors({ errors }: { errors: unknown[] }) {
  const common = useAdminCopy(contentCommonCopy);
  const { language } = useAdminLanguage();
  const visibleErrors = errors.filter(
    (error): error is Error => error instanceof Error && !(error instanceof PublishValidationError),
  );
  if (visibleErrors.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--color-error)] bg-[var(--color-surface)] p-3 text-sm font-semibold text-[var(--color-error)]"
    >
      {visibleErrors.map((error) => {
        const failure = contentFailure(error);
        const message = failure.code
          ? common.errors[failure.code]
          : (adminErrorMessage(failure.cause, language) ?? "");
        return <p key={error.message}>{message}</p>;
      })}
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
  if (!body.file) throw new ContentAdminError("choose_image");
  if (expectedVersion === undefined) throw new ContentAdminError("reload_before_upload");
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
          throw new ContentAdminError("no_upload_target");
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
    throw new ContentAdminError("save_before_publish");
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
          ? body.error.message // admin-error-render-ok: the server's reason, read into the thrown Error
          : "API request failed",
    );
    throw Object.assign(error, { status: response.status });
  }

  return body as ContentDetailResponse;
}
