import { useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { DirectoryList } from "../../../lib/volunteers/directory/types";

import {
  directoryQuery,
  directoryStatuses,
  directoryTiers,
  type DirectorySearch,
} from "./directorySearch";
const control =
  "min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2";
const link =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-border)] px-4 py-2 font-medium text-[var(--color-primary)] hover:bg-[var(--color-muted)] focus-visible:outline-2";
type ListData = DirectoryList;
export function DirectoryResults({ data, search }: { data: ListData; search: DirectorySearch }) {
  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  return (
    <div className="space-y-4">
      <p role="status" className="text-sm text-[var(--color-muted-foreground)]">
        共 {data.total} 位義工 · 第 {data.page} / {pages} 頁 · 包括未曾報名的身份
      </p>
      {data.profiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center">
          <h2 className="font-semibold">
            {search.q || search.status || search.tier ? "找不到符合條件的義工" : "尚未有義工身份"}
          </h2>
          <p className="mt-2 text-sm">
            {search.q || search.status || search.tier
              ? "請調整搜尋字詞或清除篩選後再試。"
              : "已建立的義工身份會在這裏顯示，包括尚未報名的人士。"}
          </p>
        </div>
      ) : (
        <ul className="grid min-w-0 gap-4 lg:grid-cols-2">
          {data.profiles.map((profile) => (
            <li
              key={profile.id}
              className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="break-words text-lg font-semibold">
                  {profile.display_name || "未填姓名"}
                </h2>
                <span className="rounded-full bg-[var(--color-muted)] px-3 py-1 text-sm">
                  {directoryStatuses[profile.status]}
                </span>
              </div>
              <p className="mt-2 break-all">
                {profile.account_linked ? profile.linked_email || "未提供電郵" : "帳戶未連結"}
              </p>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                {profile.account_linked
                  ? profile.email_verified
                    ? "電郵已驗證"
                    : "電郵未驗證"
                  : "沒有已連結的帳戶電郵"}{" "}
                · {directoryTiers[profile.tier]}
              </p>
              <p className="mt-2 text-sm">
                職員身份核實：{profile.verified_at ? "已核實" : "待核實"}
              </p>
              <p className="mt-1 break-all text-xs text-[var(--color-muted-foreground)]">
                身份編號：{profile.id}
              </p>
              <a
                className={`${link} mt-4`}
                href={`/admin/volunteers/people/${encodeURIComponent(profile.id)}?${directoryQuery(search)}`}
                aria-label={`查看 ${profile.display_name || "未填姓名"} 的個人詳情`}
              >
                查看個人詳情
              </a>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="義工名冊分頁" className="flex flex-wrap items-center gap-3">
        {data.page > 1 && (
          <a className={link} href={`?${directoryQuery({ ...search, page: data.page - 1 })}`}>
            上一頁
          </a>
        )}
        {data.page < pages && (
          <a className={link} href={`?${directoryQuery({ ...search, page: data.page + 1 })}`}>
            下一頁
          </a>
        )}
      </nav>
    </div>
  );
}
export function VolunteerDirectory({ search }: { search: DirectorySearch }) {
  const query = useQuery({
    queryKey: ["volunteer-directory", search],
    queryFn: () =>
      fetchAdminJson<ListData>(`/api/admin/volunteers/people?${directoryQuery(search)}`),
  });
  return (
    <section className="min-w-0 space-y-6">
      <form
        action="/admin/volunteers/people"
        method="get"
        className="grid items-end gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]"
      >
        <label className="space-y-2">
          <span className="block text-sm font-medium">姓名或帳戶電郵</span>
          <input
            key={search.q}
            name="q"
            type="search"
            maxLength={100}
            defaultValue={search.q}
            placeholder="搜尋完整或部分姓名／電郵"
            className={control}
          />
        </label>
        <label className="space-y-2">
          <span className="block text-sm font-medium">身份狀態</span>
          <select
            key={search.status}
            name="status"
            defaultValue={search.status || ""}
            className={control}
          >
            <option value="">全部身份</option>
            {Object.entries(directoryStatuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="block text-sm font-medium">義工級別</span>
          <select
            key={search.tier}
            name="tier"
            defaultValue={search.tier || ""}
            className={control}
          >
            <option value="">全部級別</option>
            {Object.entries(directoryTiers).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-11 rounded-lg bg-[var(--color-primary)] px-5 py-2 font-medium text-[var(--color-primary-foreground)]">
          搜尋
        </button>
        <a
          href="/admin/volunteers/people"
          className="inline-flex min-h-11 items-center text-sm underline"
        >
          清除篩選
        </a>
      </form>
      <p className="text-sm text-[var(--color-muted-foreground)]">
        電郵驗證只代表帳戶電郵已確認；義工身份及資格須由職員按證據核實。
      </p>
      {query.isPending && <p role="status">正在載入義工名冊…</p>}
      {query.isError && (
        <div role="alert" className="rounded-xl border border-[var(--color-border)] p-4">
          <p>未能載入義工名冊。搜尋條件已保留。</p>
          <button type="button" className={`${link} mt-3`} onClick={() => void query.refetch()}>
            重新載入
          </button>
        </div>
      )}
      {query.data && !query.isError && <DirectoryResults data={query.data} search={search} />}
    </section>
  );
}
