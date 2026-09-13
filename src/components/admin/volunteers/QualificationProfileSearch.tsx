import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { DirectoryList } from "../../../lib/volunteers/directory/types";
export function QualificationProfileSearch({
  onSelect,
  disabled = false,
}: {
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
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
      <h2 className="font-bold">尋找需要核實的義工</h2>
      <p className="mb-3 text-sm text-[var(--color-text-muted)]">
        按姓名或電郵搜尋，沒有場次報名也能找到。
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(text.trim());
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">搜尋義工姓名或電郵</span>
          <input
            type="search"
            className="min-h-11 w-full rounded-lg border px-3"
            placeholder="姓名或電郵"
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
          搜尋
        </button>
      </form>
      {query.isFetching && (
        <p role="status" className="py-2">
          搜尋中…
        </p>
      )}
      {query.error && (
        <p role="alert">
          搜尋未能完成。
          <button className="min-h-11 px-2 underline" onClick={() => void query.refetch()}>
            重試
          </button>
        </p>
      )}
      {query.data && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">
            找到 {query.data.total} 位義工
            {query.data.total > 10 ? "，以下顯示首 10 位；請輸入更完整的姓名或電郵。" : ""}
          </p>
          {query.data.profiles.map((p) => (
            <button
              key={p.id}
              disabled={disabled}
              onClick={() => onSelect(p.id)}
              className="flex min-h-11 w-full flex-wrap justify-between gap-2 rounded-lg border p-3 text-left"
            >
              <span>
                <strong>{p.display_name}</strong>
                <span className="block break-all text-sm">{p.linked_email ?? "未有連結電郵"}</span>
              </span>
              <span className="text-sm">
                {p.status === "pending" ? "待核實" : p.status === "active" ? "已核實" : "暫停"} ·
                選擇
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
