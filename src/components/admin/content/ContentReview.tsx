import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { fetchAdminJson } from "../../../lib/admin/http";
import { adminIdentityQueryOptions } from "../../../lib/admin/identity";
import {
  addAnimalReviewSelection,
  collectAnimalReviewIds,
} from "../../../lib/contentReview/animalBulkSelection";
import { AnimalReviewBulkPanel } from "./AnimalReviewBulkPanel";
import {
  addCmsReviewSelection,
  collectCmsReviewIds,
} from "../../../lib/contentReview/cmsBulkSelection";
import { CmsReviewBulkPanel } from "./CmsReviewBulkPanel";
import type { ReviewInput, ReviewQueueRow } from "../../../lib/contentReview/service";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { TablePager } from "../TablePager";
import { reviewCopy } from "./reviewCopy";
import { recordContentReview, type ReviewResult } from "./recordContentReview";
import {
  selectionErrorFrom,
  selectionErrorText,
  type SelectionError,
} from "./reviewSelectionLogic";

export function ContentReviewPanel({
  kind,
  id,
  revision,
  disabled = false,
}: {
  kind: "animal" | "content";
  id: string;
  revision: string;
  disabled?: boolean;
}) {
  const copy = useAdminCopy(reviewCopy);
  const [classification, setClassification] =
    useState<ReviewInput["classification"]>("needs_review");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  return (
    <fieldset className="space-y-3 rounded-lg border p-4" disabled={busy || disabled}>
      <legend>{copy.panel.legend}</legend>
      <p>{copy.panel.intro}</p>
      <label className="block">
        {copy.panel.classification}
        <select
          value={classification}
          onChange={(event) =>
            setClassification(event.target.value as ReviewInput["classification"])
          }
          className="ml-2 border p-2"
        >
          {Object.entries(copy.classifications).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        {copy.panel.evidence}
        <textarea
          maxLength={2000}
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
          className="block w-full border p-2"
        />
      </label>
      <button
        type="button"
        className="min-h-11 rounded border px-4"
        disabled={!evidence.trim()}
        onClick={async () => {
          setBusy(true);
          setResult(null);
          try {
            setResult(await recordContentReview({ kind, id, revision, classification, evidence }));
          } finally {
            setBusy(false);
          }
        }}
      >
        {copy.panel.record}
      </button>
      {result && <p role="status">{copy.panel[result]}</p>}
    </fieldset>
  );
}
export function ContentReviewQueue({
  initialKind = "content",
  initialQuality = "all",
}: {
  initialKind?: "animal" | "content";
  initialQuality?: "all" | "demo" | "expired" | "missing_source";
} = {}) {
  const copy = useAdminCopy(reviewCopy);
  const { language } = useAdminLanguage();
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<"animal" | "content">(initialKind);
  const [quality, setQuality] = useState<"all" | "demo" | "expired" | "missing_source">(
    initialKind === "content" ? initialQuality : "all",
  );
  const identity = useQuery(adminIdentityQueryOptions());
  const isAdmin = identity.data?.admin.role === "admin";
  const canBulk = isAdmin && quality === "all";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionError, setSelectionError] = useState<SelectionError | null>(null);
  const selectionGeneration = useRef(0);
  const query = useQuery({
    queryKey: ["editorial-review", kind, quality, page],
    queryFn: () =>
      fetchAdminJson<{ items: ReviewQueueRow[]; total: number }>(
        `/api/admin/content-review?kind=${kind}&quality=${quality}&page=${page}`,
      ),
  });
  const selectionDisabled =
    selectionBusy || query.isFetching || !query.data || Boolean(query.error);
  function toggleSelected(id: string) {
    setSelectionError(null);
    try {
      setSelectedIds(
        selectedIds.includes(id)
          ? selectedIds.filter((item) => item !== id)
          : kind === "animal"
            ? addAnimalReviewSelection(selectedIds, [id])
            : addCmsReviewSelection(selectedIds, [id]),
      );
    } catch (cause) {
      setSelectionError(selectionErrorFrom(cause, kind, "select_failed"));
    }
  }
  function selectVisible() {
    if (selectionDisabled || !query.data) return;
    setSelectionError(null);
    try {
      setSelectedIds(
        (kind === "animal" ? addAnimalReviewSelection : addCmsReviewSelection)(
          selectedIds,
          query.data.items.map((item) => item.entity_id),
        ),
      );
    } catch (cause) {
      setSelectionError(selectionErrorFrom(cause, kind, "select_failed"));
    }
  }
  async function selectAllMatching() {
    if (selectionDisabled || !query.data) return;
    setSelectionBusy(true);
    setSelectionError(null);
    try {
      const generation = selectionGeneration.current;
      const selectedKind = kind;
      const selectedQuality = quality;
      const ids = await (selectedKind === "animal" ? collectAnimalReviewIds : collectCmsReviewIds)(
        query.data.total,
        async (nextPage) =>
          fetchAdminJson<{ items: ReviewQueueRow[]; total: number }>(
            `/api/admin/content-review?kind=${selectedKind}&quality=${selectedQuality}&page=${nextPage}`,
          ),
      );
      if (selectionGeneration.current !== generation) {
        setSelectionError({ code: "filter_changed" });
        return;
      }
      setSelectedIds(ids);
    } catch (cause) {
      setSelectionError(selectionErrorFrom(cause, kind, "collect_failed"));
    } finally {
      setSelectionBusy(false);
    }
  }
  const selectionMessage = selectionError
    ? selectionErrorText(selectionError, copy.queue, language)
    : "";
  return (
    <details className="m-6 space-y-3 rounded-lg border p-4">
      <summary className="cursor-pointer font-semibold">{copy.queue.summary}</summary>
      <p>{copy.queue.intro}</p>
      <label>
        {copy.queue.kindLabel}
        <select
          className="ml-2 border p-2"
          value={kind}
          onChange={(event) => {
            selectionGeneration.current++;
            setKind(event.target.value as "animal" | "content");
            setQuality("all");
            setPage(1);
            setSelectedIds([]);
            setSelectionError(null);
          }}
        >
          <option value="content">{copy.queue.kinds.content}</option>
          <option value="animal">{copy.queue.kinds.animal}</option>
        </select>
      </label>
      {kind === "content" && (
        <label className="ml-3">
          {copy.queue.qualityLabel}
          <select
            className="ml-2 border p-2"
            value={quality}
            onChange={(event) => {
              selectionGeneration.current++;
              setQuality(event.target.value as typeof quality);
              setPage(1);
              setSelectedIds([]);
              setSelectionError(null);
            }}
          >
            <option value="all">{copy.queue.qualities.all}</option>
            <option value="demo">{copy.queue.qualities.demo}</option>
            <option value="expired">{copy.queue.qualities.expired}</option>
            <option value="missing_source">{copy.queue.qualities.missing_source}</option>
          </select>
        </label>
      )}
      {kind === "content" && quality !== "all" && <p>{copy.queue.qualityNote}</p>}
      {query.error && (
        <p role="alert">
          {copy.queue.loadFailed}
          <button onClick={() => void query.refetch()}>{copy.queue.retry}</button>
        </p>
      )}
      {canBulk && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-11 rounded border px-4"
            disabled={selectionDisabled || !query.data || query.data.items.length === 0}
            onClick={selectVisible}
          >
            {copy.queue.selectPage}
          </button>
          <button
            type="button"
            className="min-h-11 rounded border px-4"
            disabled={
              selectionDisabled || !query.data || query.data.total < 1 || query.data.total > 1000
            }
            onClick={selectAllMatching}
          >
            {copy.queue.selectAll(kind)}
          </button>
          <button
            type="button"
            className="min-h-11 rounded border px-4"
            disabled={selectionBusy || selectedIds.length === 0}
            onClick={() => setSelectedIds([])}
          >
            {copy.queue.clear}
          </button>
        </div>
      )}
      {selectionBusy && <p role="status">{copy.queue.collecting}</p>}
      {selectionMessage && (
        <p role="alert" className="text-[var(--color-error)]">
          {selectionMessage}
        </p>
      )}
      <ul>
        {query.data?.items.map((row) => (
          <li key={row.entity_id} className="border-b py-3">
            {canBulk && (
              <label className="inline-flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(row.entity_id)}
                  disabled={selectionDisabled}
                  onChange={() => toggleSelected(row.entity_id)}
                />
                {copy.queue.selectRow(kind)}
              </label>
            )}
            <p>
              {copy.queue.rowTitle(row.title, copy.classifications[row.classification])}
              {row.classification === "demo" && row.publication_state === "published"
                ? copy.queue.notes.suggestUnpublish
                : ""}
              {row.quality_reason === "demo" ? copy.queue.notes.demoPending : ""}
              {row.quality_reason === "expired" ? copy.queue.notes.expired : ""}
              {row.quality_reason === "missing_source" ? copy.queue.notes.missingSource : ""}
            </p>
            {row.entity_kind === "content" ? (
              <Link
                to="/admin/content/$id"
                params={{ id: row.entity_id }}
                className="inline-flex min-h-11 items-center underline"
              >
                {copy.queue.open}
              </Link>
            ) : (
              <Link
                to="/admin/animals/$id/edit"
                params={{ id: row.entity_id }}
                className="inline-flex min-h-11 items-center underline"
              >
                {copy.queue.open}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {canBulk && kind === "animal" && (
        <AnimalReviewBulkPanel
          selectedIds={selectedIds}
          filterKey={kind}
          selectionDisabled={selectionDisabled}
        />
      )}
      {canBulk && kind === "content" && (
        <CmsReviewBulkPanel
          selectedIds={selectedIds}
          filterKey={kind}
          selectionDisabled={selectionDisabled}
        />
      )}
      {query.data && (
        <TablePager
          page={page}
          pageSize={25}
          total={query.data.total}
          onPageChange={setPage}
          label={copy.queue.pager}
        />
      )}
    </details>
  );
}
