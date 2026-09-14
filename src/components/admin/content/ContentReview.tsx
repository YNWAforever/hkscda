import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { ReviewInput, ReviewQueueRow } from "../../../lib/contentReview/service";
import { TablePager } from "../TablePager";
const labels = { approved: "已核實可發布", demo: "示範資料（不可發布）", needs_review: "待核實" };
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
  const [classification, setClassification] =
    useState<ReviewInput["classification"]>("needs_review");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <fieldset className="space-y-3 rounded-lg border p-4" disabled={busy || disabled}>
      <legend>此已儲存版本的來源審核</legend>
      <p>只按已核實來源分類。示範資料及未核實資料不可發布；每次儲存新版本均須重新審核。</p>
      <label className="block">
        分類
        <select
          value={classification}
          onChange={(event) =>
            setClassification(event.target.value as ReviewInput["classification"])
          }
          className="ml-2 border p-2"
        >
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        核實來源及理由
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
          setMessage("");
          try {
            await fetchAdminJson("/api/admin/content-review", {
              method: "POST",
              body: JSON.stringify({
                entity_kind: kind,
                entity_id: id,
                revision_key: revision,
                classification,
                evidence,
              }),
            });
            setMessage("此版本的審核已記錄。公開內容尚未改動。");
          } catch {
            setMessage("未能記錄；版本可能已變更，請重新載入後審核。");
          } finally {
            setBusy(false);
          }
        }}
      >
        記錄此版本審核
      </button>
      {message && <p role="status">{message}</p>}
    </fieldset>
  );
}
export function ContentReviewQueue() {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<"animal" | "content">("content");
  const query = useQuery({
    queryKey: ["editorial-review", kind, page],
    queryFn: () =>
      fetchAdminJson<{ items: ReviewQueueRow[]; total: number }>(
        `/api/admin/content-review?kind=${kind}&page=${page}`,
      ),
  });
  return (
    <details className="m-6 space-y-3 rounded-lg border p-4">
      <summary className="cursor-pointer font-semibold">內容來源審核佇列</summary>
      <p>
        分類不會自動撤下現有公開內容。示範內容須先列明記錄、原因及建議處理，再取得內容負責人批准。
      </p>
      <label>
        資料類型
        <select
          className="ml-2 border p-2"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as "animal" | "content");
            setPage(1);
          }}
        >
          <option value="content">宣傳內容</option>
          <option value="animal">動物資料</option>
        </select>
      </label>
      {query.error && (
        <p role="alert">
          未能載入審核佇列。<button onClick={() => void query.refetch()}>重試</button>
        </p>
      )}
      <ul>
        {query.data?.items.map((row) => (
          <li key={row.entity_id} className="border-b py-3">
            <p>
              {row.title} · {labels[row.classification]}
              {row.classification === "demo" && row.publication_state === "published"
                ? " · 建議暫停公開（待授權）"
                : ""}
            </p>
            {row.entity_kind === "content" ? (
              <Link
                to="/admin/content/$id"
                params={{ id: row.entity_id }}
                className="inline-flex min-h-11 items-center underline"
              >
                開啟及核實來源
              </Link>
            ) : (
              <Link
                to="/admin/animals/$id/edit"
                params={{ id: row.entity_id }}
                className="inline-flex min-h-11 items-center underline"
              >
                開啟及核實來源
              </Link>
            )}
          </li>
        ))}
      </ul>
      {query.data && (
        <TablePager
          page={page}
          pageSize={25}
          total={query.data.total}
          onPageChange={setPage}
          label="審核資料"
        />
      )}
    </details>
  );
}
