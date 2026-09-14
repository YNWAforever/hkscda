import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { ContentLinkType } from "../../../lib/content/types";
import { fetchAdminJson } from "../../../lib/admin/http";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";

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
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, LINK_SEARCH_DEBOUNCE_MS);
  const search = useLinkSearch(linkedType, debouncedQuery);

  return (
    <div className="space-y-2">
      <input
        type="text"
        maxLength={100}
        value={query}
        disabled={disabled}
        placeholder="搜尋名稱或編號"
        aria-label="搜尋關聯紀錄"
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
      />
      {value ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          已選擇：{label?.trim() ? label : value}
        </p>
      ) : null}
      {search.isError ? (
        <p role="alert" className="text-xs font-semibold text-[var(--color-error)]">
          未能載入關聯紀錄，請重試。
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
              <span className="font-semibold text-[var(--color-panel)]">{option.label}</span>
              {option.sublabel ? (
                <span className="text-xs text-[var(--color-text-muted)]">{option.sublabel}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
