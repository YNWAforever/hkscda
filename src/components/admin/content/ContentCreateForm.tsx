import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import { AdminApiError, adminErrorMessage } from "../../../lib/admin/session";
import {
  CONTENT_SLUG_INPUT_PATTERN,
  CONTENT_SUMMARY_MAX,
  CONTENT_TEXT_MAX,
  CONTENT_TITLE_MAX,
} from "../../../lib/content/limits";
import type { ContentType } from "../../../lib/content/types";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy, useAdminCopy, type AdminLanguage } from "../i18n/copy";
import { contentFieldErrorLines, editorFieldLabels } from "./contentApiErrors";
import { contentCommonCopy } from "./contentCommonCopy";
import { formatContentTypeLabel, suggestSlug } from "./contentAdminLogic";
import { managementCopy } from "./managementCopy";

const contentTypes: ContentType[] = ["rescue_story", "event", "charity_market", "report"];

type OptionalFieldKey = keyof typeof contentCommonCopy.zh.optionalFields;

export type ContentCreateFormState = {
  type: ContentType;
  title: string;
  slug: string;
  summary: string;
  body: string;
  optional: Record<OptionalFieldKey, string>;
};

export function buildCreateContentPayload(form: ContentCreateFormState) {
  return {
    type: form.type,
    title: form.title,
    slug: form.slug,
    summary: form.summary,
    body: form.body,
    status: "draft" as const,
    ...form.optional,
  };
}

/** The label of each field as this form names it, for a validation failure's lines. */
function createFieldLabels(language: AdminLanguage): Record<string, string> {
  const copy = pickAdminCopy(managementCopy, language).createForm;
  return {
    ...editorFieldLabels(language),
    ...pickAdminCopy(contentCommonCopy, language).optionalFields,
    type: copy.type,
    title: copy.titleLabel,
    slug: copy.slug,
    summary: copy.summary,
    body: copy.body,
  };
}

/**
 * The message for an error from creating content, in `language` (zh-HK when none is given). A
 * validation failure gives one line per field, named by this form's label, with the reason in
 * `language` (BUG-68).
 */
export function createErrorMessage(error: unknown, language: AdminLanguage = "zh"): string {
  const copy = pickAdminCopy(managementCopy, language).createForm;
  if (error instanceof AdminApiError) {
    if (error.status === 409) return copy.slugTaken;
    if (error.fields && Object.keys(error.fields).length > 0) {
      return contentFieldErrorLines(error.fields, language, createFieldLabels(language)).join("\n");
    }
  }
  return adminErrorMessage(error, language) ?? copy.failed;
}

export function ContentCreateForm() {
  const copy = useAdminCopy(managementCopy).createForm;
  const common = useAdminCopy(contentCommonCopy);
  const { language } = useAdminLanguage();
  const navigate = useNavigate();
  const [type, setType] = useState<ContentType>("rescue_story");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [optional, setOptional] = useState({
    ctaLabel: "",
    ctaUrl: "",
    seoTitle: "",
    seoDescription: "",
    ogTitle: "",
    ogDescription: "",
  });

  const create = useMutation({
    mutationFn: () =>
      fetchAdminJson<{ id: string }>(`/api/admin/content`, {
        method: "POST",
        body: JSON.stringify(
          buildCreateContentPayload({ type, title, slug, summary, body, optional }),
        ),
      }),
    onSuccess: (result) => {
      void navigate({ to: "/admin/content/$id", params: { id: result.id } });
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">{copy.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
      </div>
      <form
        className="max-w-2xl space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          {copy.type}
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ContentType)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          >
            {contentTypes.map((option) => (
              <option key={option} value={option}>
                {formatContentTypeLabel(option, language)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          {copy.titleLabel}
          <input
            required
            maxLength={CONTENT_TITLE_MAX}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (!slugTouched) setSlug(suggestSlug(event.target.value));
            }}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          {copy.slug}
          <input
            required
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            pattern={CONTENT_SLUG_INPUT_PATTERN}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          {copy.summary}
          <textarea
            required
            maxLength={CONTENT_SUMMARY_MAX}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          {copy.body}
          <textarea
            maxLength={CONTENT_TEXT_MAX.body}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>

        {(Object.keys(common.optionalFields) as OptionalFieldKey[]).map((key) => (
          <label
            key={key}
            className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]"
          >
            {common.optionalFields[key]}
            <input
              maxLength={key === "ctaUrl" ? undefined : CONTENT_TEXT_MAX[key]}
              value={optional[key]}
              onChange={(event) =>
                setOptional((current) => ({ ...current, [key]: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
        ))}

        {create.error ? (
          <div role="alert" className="text-sm font-semibold text-[var(--color-error)]">
            {create.error instanceof AdminApiError &&
            create.error.status !== 409 &&
            create.error.fields ? (
              <ul className="space-y-1">
                {createErrorMessage(create.error, language)
                  .split("\n")
                  .map((line, index) => (
                    <li key={`${index}:${line}`}>{line}</li>
                  ))}
              </ul>
            ) : (
              <p>{createErrorMessage(create.error, language)}</p>
            )}
          </div>
        ) : null}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
          >
            {create.isPending ? copy.busy : copy.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
