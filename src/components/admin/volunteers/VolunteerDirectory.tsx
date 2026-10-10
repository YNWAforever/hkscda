import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { adminIdentityQueryOptions } from "../../../lib/admin/identity";
import {
  addVolunteerSelection,
  collectMatchingVolunteerIds,
  VolunteerSelectionError,
} from "../../../lib/volunteers/directory/reviewerBulkSelection";
import type { DirectoryList } from "../../../lib/volunteers/directory/types";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { VolunteerReviewBulkPanel } from "./VolunteerReviewBulkPanel";
import { selectionProblemMessage, type SelectionProblem } from "./directoryProblems";

import {
  directoryQuery,
  directoryStatusValues,
  directoryTierValues,
  type DirectorySearch,
} from "./directorySearch";
import { volunteerDirectoryCopy } from "./volunteerDirectoryCopy";
import { LoadFailure } from "../LoadFailure";
const control =
  "min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2";
const link =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-border)] px-4 py-2 font-medium text-[var(--color-primary)] hover:bg-[var(--color-muted)] focus-visible:outline-2";
type ListData = DirectoryList;

/** What the card says about the account email: not linked, verified, or not verified. */
function emailNote(
  profile: { account_linked: boolean; email_verified: boolean },
  text: { noLinkedEmail: string; emailVerified: string; emailNotVerified: string },
) {
  if (!profile.account_linked) return text.noLinkedEmail;
  return profile.email_verified ? text.emailVerified : text.emailNotVerified;
}

export function DirectoryResults({
  data,
  search,
  selection,
}: {
  data: ListData;
  search: DirectorySearch;
  selection?: { ids: string[]; disabled: boolean; toggle: (id: string) => void };
}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerDirectoryCopy, language);
  const text = copy.results;
  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  const filtered = Boolean(search.q || search.status || search.tier);
  return (
    <div className="space-y-4">
      <p role="status" className="text-sm text-[var(--color-muted-foreground)]">
        {text.summary(data.total, data.page, pages)}
      </p>
      {data.profiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center">
          <h2 className="font-semibold">{filtered ? text.noMatchTitle : text.emptyTitle}</h2>
          <p className="mt-2 text-sm">{filtered ? text.noMatchHint : text.emptyHint}</p>
        </div>
      ) : (
        <ul className="grid min-w-0 gap-4 lg:grid-cols-2">
          {data.profiles.map((profile) => (
            <li
              key={profile.id}
              className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                {selection && (
                  <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                    <input
                      type="checkbox"
                      aria-label={text.select(profile.display_name || profile.id)}
                      checked={selection.ids.includes(profile.id)}
                      disabled={selection.disabled}
                      onChange={() => selection.toggle(profile.id)}
                    />
                  </label>
                )}
                <h2 className="break-words text-lg font-semibold">
                  {profile.display_name || text.unnamed}
                </h2>
                <span className="rounded-full bg-[var(--color-muted)] px-3 py-1 text-sm">
                  {copy.statuses[profile.status]}
                </span>
              </div>
              <p className="mt-2 break-all">
                {profile.account_linked ? profile.linked_email || text.noEmail : text.notLinked}
              </p>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                {emailNote(profile, text)} · {copy.tiers[profile.tier]}
              </p>
              <p className="mt-2 text-sm">{text.staffVerification(Boolean(profile.verified_at))}</p>
              <p className="mt-1 break-all text-xs text-[var(--color-muted-foreground)]">
                {text.profileId(profile.id)}
              </p>
              <a
                className={`${link} mt-4`}
                href={`/admin/volunteers/people/${encodeURIComponent(profile.id)}?${directoryQuery(search)}`}
                aria-label={text.viewDetailsFor(profile.display_name || text.unnamed)}
              >
                {text.viewDetails}
              </a>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label={text.pagesLabel} className="flex flex-wrap items-center gap-3">
        {data.page > 1 && (
          <a className={link} href={`?${directoryQuery({ ...search, page: data.page - 1 })}`}>
            {text.previous}
          </a>
        )}
        {data.page < pages && (
          <a className={link} href={`?${directoryQuery({ ...search, page: data.page + 1 })}`}>
            {text.next}
          </a>
        )}
      </nav>
    </div>
  );
}
export function VolunteerDirectory({ search }: { search: DirectorySearch }) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerDirectoryCopy, language);
  const identity = useQuery(adminIdentityQueryOptions());
  const isAdmin = identity.data?.admin.role === "admin";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedScope, setSelectedScope] = useState("");
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionProblem, setSelectionProblem] = useState<SelectionProblem | null>(null);
  const filterKey = JSON.stringify([search.q ?? "", search.status ?? "", search.tier ?? ""]);
  const effectiveSelectedIds = selectedScope === filterKey ? selectedIds : [];
  const filterKeyRef = useRef(filterKey);
  filterKeyRef.current = filterKey;
  useEffect(() => {
    setSelectedIds([]);
    setSelectedScope(filterKey);
    setSelectionProblem(null);
  }, [filterKey]);
  const query = useQuery({
    queryKey: ["volunteer-directory", search],
    queryFn: () =>
      fetchAdminJson<ListData>(`/api/admin/volunteers/people?${directoryQuery(search)}`),
  });
  const selectionDisabled = selectionBusy || query.isFetching || !query.data;
  const selectionMessage = selectionProblemMessage(selectionProblem, language);
  function toggleSelected(id: string) {
    setSelectedScope(filterKey);
    setSelectionProblem(null);
    try {
      setSelectedIds(
        effectiveSelectedIds.includes(id)
          ? effectiveSelectedIds.filter((item) => item !== id)
          : addVolunteerSelection(effectiveSelectedIds, [id]),
      );
    } catch (cause) {
      setSelectionProblem({ code: "select_failed", cause });
    }
  }
  function selectVisible() {
    if (!query.data || selectionDisabled) return;
    setSelectedScope(filterKey);
    setSelectionProblem(null);
    try {
      setSelectedIds(
        addVolunteerSelection(
          effectiveSelectedIds,
          query.data.profiles.map((item) => item.id),
        ),
      );
    } catch (cause) {
      setSelectionProblem({ code: "select_failed", cause });
    }
  }
  async function selectAllMatching() {
    if (!query.data || selectionDisabled) return;
    const scope = filterKey;
    setSelectionBusy(true);
    setSelectionProblem(null);
    try {
      const ids = await collectMatchingVolunteerIds(query.data.total, async (page, limit) =>
        fetchAdminJson<DirectoryList>(
          `/api/admin/volunteers/people?${directoryQuery({ ...search, page })}&limit=${limit}`,
        ),
      );
      if (filterKeyRef.current !== scope) throw new VolunteerSelectionError("filter_changed");
      setSelectedScope(scope);
      setSelectedIds(ids);
    } catch (cause) {
      setSelectionProblem({ code: "pin_failed", cause });
    } finally {
      setSelectionBusy(false);
    }
  }
  return (
    <section className="min-w-0 space-y-6">
      <form
        action="/admin/volunteers/people"
        method="get"
        className="grid items-end gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]"
      >
        <label className="space-y-2">
          <span className="block text-sm font-medium">{copy.form.nameOrEmail}</span>
          <input
            key={search.q}
            name="q"
            type="search"
            maxLength={100}
            defaultValue={search.q}
            placeholder={copy.form.nameOrEmailPlaceholder}
            className={control}
          />
        </label>
        <label className="space-y-2">
          <span className="block text-sm font-medium">{copy.form.status}</span>
          <select
            key={search.status}
            name="status"
            defaultValue={search.status || ""}
            className={control}
          >
            <option value="">{copy.form.allStatuses}</option>
            {directoryStatusValues.map((value) => (
              <option key={value} value={value}>
                {copy.statuses[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="block text-sm font-medium">{copy.form.tier}</span>
          <select
            key={search.tier}
            name="tier"
            defaultValue={search.tier || ""}
            className={control}
          >
            <option value="">{copy.form.allTiers}</option>
            {directoryTierValues.map((value) => (
              <option key={value} value={value}>
                {copy.tiers[value]}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-11 rounded-lg bg-[var(--color-primary)] px-5 py-2 font-medium text-[var(--color-primary-foreground)]">
          {copy.form.search}
        </button>
        <a
          href="/admin/volunteers/people"
          className="inline-flex min-h-11 items-center text-sm underline"
        >
          {copy.form.clear}
        </a>
      </form>
      <p className="text-sm text-[var(--color-muted-foreground)]">{copy.note}</p>
      {query.isPending && <p role="status">{copy.loading}</p>}
      {query.isError && (
        <LoadFailure
          error={query.error}
          onRetry={() => void query.refetch()}
          title={copy.loadFailed}
          retryLabel={copy.reload}
        />
      )}
      {isAdmin && query.data && !query.isError && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              className={link}
              disabled={selectionDisabled || query.data.profiles.length === 0}
              onClick={selectVisible}
            >
              {copy.selection.selectPage}
            </button>
            <button
              type="button"
              className={link}
              disabled={selectionDisabled || query.data.total < 1 || query.data.total > 1000}
              onClick={selectAllMatching}
            >
              {copy.selection.selectAll}
            </button>
            <button
              type="button"
              className={link}
              disabled={selectionBusy || effectiveSelectedIds.length === 0}
              onClick={() => setSelectedIds([])}
            >
              {copy.selection.clear}
            </button>
            {selectionBusy && <span role="status">{copy.selection.locking}</span>}
            {selectionMessage && (
              <span role="alert" className="text-[var(--color-error)]">
                {selectionMessage}
              </span>
            )}
          </div>
          <VolunteerReviewBulkPanel
            selectedIds={effectiveSelectedIds}
            filterKey={filterKey}
            selectionDisabled={selectionDisabled}
          />
        </div>
      )}
      {query.data && !query.isError && (
        <DirectoryResults
          data={query.data}
          search={search}
          selection={
            isAdmin
              ? { ids: effectiveSelectedIds, disabled: selectionDisabled, toggle: toggleSelected }
              : undefined
          }
        />
      )}
    </section>
  );
}
