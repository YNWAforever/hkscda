import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { ContentType } from "../../../lib/content/types";
import {
  contentOptionalFieldLabels,
  formatContentTypeLabel,
  suggestSlug,
} from "./contentAdminLogic";

const contentTypes: ContentType[] = ["rescue_story", "event", "charity_market", "report"];

export function ContentCreateForm() {
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
        body: JSON.stringify({ type, title, slug, summary, body, status: "draft", ...optional }),
      }),
    onSuccess: (result) => {
      void navigate({ to: "/admin/content/$id", params: { id: result.id } });
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">宣傳</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">新增宣傳內容</h1>
      </div>
      <form
        className="max-w-2xl space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          類型
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ContentType)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          >
            {contentTypes.map((option) => (
              <option key={option} value={option}>
                {formatContentTypeLabel(option, "zh")}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          標題
          <input
            required
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (!slugTouched) setSlug(suggestSlug(event.target.value));
            }}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          網址 slug（小寫英數字與連字號）
          <input
            required
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          摘要
          <textarea
            required
            maxLength={320}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]">
          正文（可稍後填寫）
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
          />
        </label>

        {(
          Object.keys(contentOptionalFieldLabels) as Array<keyof typeof contentOptionalFieldLabels>
        ).map((key) => (
          <label
            key={key}
            className="block space-y-1 text-sm font-semibold text-[var(--color-panel)]"
          >
            {contentOptionalFieldLabels[key]}
            <input
              value={optional[key]}
              onChange={(event) =>
                setOptional((current) => ({ ...current, [key]: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
        ))}

        {create.error ? (
          <p role="alert" className="text-sm font-semibold text-[var(--color-error)]">
            {create.error instanceof Error ? create.error.message : "建立失敗，請重試。"}
          </p>
        ) : null}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
          >
            {create.isPending ? "建立中" : "建立草稿"}
          </button>
        </div>
      </form>
    </div>
  );
}
