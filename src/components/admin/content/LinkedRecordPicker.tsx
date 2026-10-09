import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { ContentLinkType } from "../../../lib/content/types";
import { contentServerMessage } from "../../../lib/content/serverMessages";
import { fetchAdminJson } from "../../../lib/admin/http";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { editorPanelsCopy } from "./editorPanelsCopy";

export type LinkSearchResult = {
  id: string;
  label: string;
  sublabel: string | null;
};

export type LinkOption = {
  id: string;
  label: string;
  sublabel: string;
};

const LINK_SEARCH_DEBOUNCE_MS = 300;

export function toLinkOption(result: LinkSearchResult): LinkOption {
  return { id: result.id, label: result.label, sublabel: result.sublabel ?? "" };
}

export function useLinkSearch(linkedType: ContentLinkType, query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["content-link-search", linkedType, query],
    enabled: trimmed.length > 0,
    queryFn: () =>
      fetchAdminJson<{ results: LinkSearchResult[] }>(
        `/api/admin/content/link-search?linkedType=${encodeURIComponent(linkedType)}&q=${encodeURIComponent(trimmed)}`,
      ),
    select: (data) => data.results.map(toLinkOption),
  });
}

export function LinkedRecordPicker({
  linkedType,
  value,
  label,
  onChange,
  disabled,
}: {
  linkedType: ContentLinkType;
  value: string;
  label?: string;
  onChange: (pick: { id: string; label: string }) => void;
  disabled?: boolean;
}) {
  const copy = useAdminCopy(editorPanelsCopy).picker;
  const { language } = useAdminLanguage();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, LINK_SEARCH_DEBOUNCE_MS);
  const search = useLinkSearch(linkedType, debouncedQuery);
  // The search labels a record that has no name with a stand-in in zh-HK; every other label is
  // the record's own name and is shown as stored.
  const shown = (text: string) => contentServerMessage(text, language);

  return (
    <div className="space-y-2">
      <input
        type="text"
        maxLength={100}
        value={query}
        disabled={disabled}
        placeholder={copy.placeholder}
        aria-label={copy.label}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
      />
      {value ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          {copy.selected(label?.trim() ? shown(label) : value)}
        </p>
      ) : null}
      {search.isError ? (
        <p role="alert" className="text-xs font-semibold text-[var(--color-error)]">
          {copy.failed}
        </p>
      ) : null}
      {search.data && search.data.length > 0 ? (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {search.data.map((option) => (
            <button
              type="button"
              key={option.id}
              aria-pressed={value === option.id}
              disabled={disabled}
              onClick={() => onChange({ id: option.id, label: option.label })}
              className={`flex w-full flex-col rounded-md border p-2 text-left text-sm disabled:opacity-60 ${
                value === option.id
                  ? "border-[var(--color-primary)] bg-[var(--color-background)]"
                  : "border-[var(--color-border)] bg-[var(--color-background)]"
              }`}
            >
              <span className="font-semibold text-[var(--color-panel)]">{shown(option.label)}</span>
              {option.sublabel ? (
                <span className="text-xs text-[var(--color-text-muted)]">
                  {copy.detail(linkedType, option.sublabel)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
