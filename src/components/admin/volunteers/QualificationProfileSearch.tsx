import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { DirectoryList } from "../../../lib/volunteers/directory/types";
import { useAdminCopy } from "../i18n/copy";
import { volunteerDirectoryCopy } from "./volunteerDirectoryCopy";
import { LoadFailure } from "../LoadFailure";
export function QualificationProfileSearch({
  onSelect,
  disabled = false,
}: {
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const copy = useAdminCopy(volunteerDirectoryCopy).search;
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["volunteer-directory", "qualification-picker", search],
    queryFn: () =>
      fetchAdminJson<DirectoryList>(
        "/api/admin/volunteers/people?" + new URLSearchParams({ q: search, limit: "10" }),
      ),
    enabled: !!search,
  });
  return (
    <section className="rounded-xl border border-[var(--color-border)] p-4">
      <h2 className="font-bold">{copy.title}</h2>
      <p className="mb-3 text-sm text-[var(--color-text-muted)]">{copy.hint}</p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(text.trim());
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">{copy.label}</span>
          <input
            type="search"
            className="min-h-11 w-full rounded-lg border px-3"
            placeholder={copy.placeholder}
            maxLength={200}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg border px-4"
          disabled={!text.trim() || disabled}
        >
          {copy.submit}
        </button>
      </form>
      {query.isFetching && (
        <p role="status" className="py-2">
          {copy.searching}
        </p>
      )}
      {query.error && (
        <LoadFailure
          error={query.error}
          onRetry={() => void query.refetch()}
          title={copy.failed}
          retryLabel={copy.retry}
        />
      )}
      {query.data && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">{copy.found(query.data.total)}</p>
          {query.data.profiles.map((p) => (
            <button
              key={p.id}
              disabled={disabled}
              onClick={() => onSelect(p.id)}
              className="flex min-h-11 w-full flex-wrap justify-between gap-2 rounded-lg border p-3 text-left"
            >
              <span>
                <strong>{p.display_name}</strong>
                <span className="block break-all text-sm">{p.linked_email ?? copy.noEmail}</span>
              </span>
              <span className="text-sm">{copy.choose[p.status]}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
