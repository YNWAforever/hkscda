import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Archive, ArrowLeft, RefreshCw, Save, Send } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ContentDetail,
  ContentStatus,
  ContentType,
  NotificationDraftStatus,
  PublishValidationIssue,
  SocialCopyStatus,
} from "../../../lib/content/types";
import { fetchAdminJson, getAdminAccessToken } from "../../../lib/admin/http";
import { StatusPill, type StatusTone } from "../StatusBadge";
import {
  contentStatusTone,
  formatContentTypeLabel,
  formatIsoForDatetimeLocal,
  parseDatetimeLocalToIso,
} from "./contentAdminLogic";
import { ContentTimeline } from "./ContentTimeline";
import { NotificationDraftPanel } from "./NotificationDraftPanel";
import { SocialCopyPanel } from "./SocialCopyPanel";

type ContentEditorProps = {
  contentId: string;
};

type ContentDetailResponse = {
  content: ContentDetail;
};

const statusLabels: Record<ContentStatus, string> = {
  draft: "草稿",
  published: "已發布",
  archived: "已封存",
};

const toneMap: Record<ReturnType<typeof contentStatusTone>, StatusTone> = {
  success: "success",
  warning: "warning",
  muted: "neutral",
};

export function ContentEditor({ contentId }: ContentEditorProps) {
  const queryClient = useQueryClient();
  const [validationIssues, setValidationIssues] = useState<PublishValidationIssue[]>([]);
  const [pendingCopyId, setPendingCopyId] = useState<string | null>(null);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [generatingUpdateId, setGeneratingUpdateId] = useState<string | null>(null);

  const contentQuery = useQuery({
    queryKey: ["admin-content-detail", contentId],
    queryFn: () => fetchAdminJson<ContentDetailResponse>(`/api/admin/content/${contentId}`),
  });

  const content = contentQuery.data?.content;

  const updateContent = useMutation({
    mutationFn: (body: ContentFormState) =>
      fetchAdminJson<ContentDetailResponse>(`/api/admin/content/${contentId}`, {
        method: "PATCH",
        body: JSON.stringify(normalizeForm(body)),
      }),
    onSuccess: (data) => {
      setValidationIssues([]);
      queryClient.setQueryData(["admin-content-detail", contentId], data);
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    },
  });

  const publishContent = useMutation({
    mutationFn: () => publishWithValidation(contentId),
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
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    },
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
    updateContent.isPending ||
    publishContent.isPending ||
    archiveContent.isPending ||
    generateSocialCopy.isPending ||
    updateCopyStatus.isPending ||
    generateNotificationDrafts.isPending ||
    updateDraftStatus.isPending;

  if (contentQuery.isLoading) {
    return <div className="p-6 text-sm text-[var(--color-text-muted)]">載入宣傳內容...</div>;
  }

  if (!content) {
    return (
      <div className="space-y-3 p-6">
        <a
          href="/admin/content"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回宣傳內容
        </a>
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
          <a
            href="/admin/content"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回宣傳內容
          </a>
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
            onClick={() => void contentQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)] disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            重新整理
          </button>
          <button
            type="button"
            disabled={editorActionPending}
            onClick={() => publishContent.mutate()}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            發布
          </button>
          <button
            type="button"
            disabled={editorActionPending}
            onClick={() => archiveContent.mutate()}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)] disabled:opacity-60"
          >
            <Archive className="h-4 w-4" />
            封存
          </button>
        </div>
      </div>

      {validationIssues.length > 0 ? <PublishValidationPanel issues={validationIssues} /> : null}
      <ActionErrors
        errors={[
          updateContent.error,
          publishContent.error,
          archiveContent.error,
          generateSocialCopy.error,
          updateCopyStatus.error,
          generateNotificationDrafts.error,
          updateDraftStatus.error,
        ]}
      />

      <ContentEditorForm
        content={content}
        pending={editorActionPending}
        onSave={(form) => updateContent.mutateAsync(form).then(() => undefined)}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <LinkedRecords content={content} />
        <StoryWallSettings content={content} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[var(--color-panel)]">故事更新</h2>
        <ContentTimeline
          updates={content.updates}
          onGenerateDrafts={(updateId) => generateNotificationDrafts.mutate(updateId)}
          generatingUpdateId={generatingUpdateId}
          disabled={editorActionPending}
        />
      </section>

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
  status: ContentStatus;
  publishedAt: string;
  ctaLabel: string;
  ctaUrl: string;
  seoTitle: string;
  seoDescription: string;
  ogTitle: string;
  ogDescription: string;
};

function ContentEditorForm({
  content,
  pending,
  onSave,
}: {
  content: ContentDetail;
  pending: boolean;
  onSave: (form: ContentFormState) => Promise<void>;
}) {
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
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await onSave(form);
          setDirty(false);
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
          {pending ? "儲存中" : "儲存"}
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
        <Field label="狀態">
          <select
            value={form.status}
            onChange={(event) => updateField("status", event.target.value as ContentStatus)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            {(["draft", "published", "archived"] as ContentStatus[]).map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="發布時間">
          <input
            type="datetime-local"
            value={form.publishedAt}
            onChange={(event) => updateField("publishedAt", event.target.value)}
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

function LinkedRecords({ content }: { content: ContentDetail }) {
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-lg font-bold text-[var(--color-panel)]">關聯紀錄</h2>
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
                {link.linkedType} · {link.relationship}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function StoryWallSettings({ content }: { content: ContentDetail }) {
  const profile = content.storyProfile;

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-lg font-bold text-[var(--color-panel)]">故事牆設定</h2>
      {profile ? (
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <Info label="動物" value={profile.animalType} />
          <Info label="公開狀態" value={profile.publicStatus} />
          <Info label="救援地區" value={profile.rescueRegion} />
          <Info label="地圖顯示" value={profile.showOnMap ? "顯示" : "不顯示"} />
          <Info label="精選" value={profile.isFeatured ? "是" : "否"} />
          <Info label="地圖標籤" value={profile.publicMapLabel ?? "未設定"} />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">此內容未設定救援故事資料。</p>
      )}
    </section>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 font-semibold text-[var(--color-panel)]">{value}</dd>
    </div>
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
    status: content.status,
    publishedAt: content.publishedAt ? formatIsoForDatetimeLocal(content.publishedAt) : "",
    ctaLabel: content.ctaLabel ?? "",
    ctaUrl: content.ctaUrl ?? "",
    seoTitle: content.seoTitle ?? "",
    seoDescription: content.seoDescription ?? "",
    ogTitle: content.ogTitle ?? "",
    ogDescription: content.ogDescription ?? "",
  };
}

function normalizeForm(form: ContentFormState) {
  return {
    ...form,
    subtitle: emptyToNull(form.subtitle),
    body: emptyToNull(form.body),
    publishedAt: parseDatetimeLocalToIso(form.publishedAt),
    ctaLabel: emptyToNull(form.ctaLabel),
    ctaUrl: emptyToNull(form.ctaUrl),
    seoTitle: emptyToNull(form.seoTitle),
    seoDescription: emptyToNull(form.seoDescription),
    ogTitle: emptyToNull(form.ogTitle),
    ogDescription: emptyToNull(form.ogDescription),
  };
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

class PublishValidationError extends Error {
  constructor(public issues: PublishValidationIssue[]) {
    super("Content item cannot be published");
  }
}

async function publishWithValidation(contentId: string) {
  const token = await getAdminAccessToken();
  const response = await fetch(`/api/admin/content/${contentId}/publish`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const issues = Array.isArray(body.issues) ? body.issues : [];
    if (issues.length > 0) throw new PublishValidationError(issues);
    throw new Error(typeof body.error === "string" ? body.error : "API request failed");
  }

  return body as ContentDetailResponse;
}
