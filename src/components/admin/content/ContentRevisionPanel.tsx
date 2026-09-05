import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { ContentRevisionSummary } from "../../../lib/content/lifecycle";
import type { ContentDetail } from "../../../lib/content/types";
type Revision = { id: string; version: number; snapshot: Record<string, unknown> };
export function ContentRevisionPanel({
  content,
  disabled,
  onRestore,
}: {
  content: ContentDetail;
  disabled: boolean;
  onRestore: (id: string) => Promise<void>;
}) {
  const [cursor, setCursor] = useState<number>();
  const [selected, setSelected] = useState<string>();
  const history = useQuery({
    queryKey: ["admin-content-revisions", content.id, content.version, cursor],
    queryFn: () =>
      fetchAdminJson<{ revisions: ContentRevisionSummary[]; nextBeforeVersion: number | null }>(
        `/api/admin/content/${content.id}/revisions${cursor === undefined ? "" : `?beforeVersion=${cursor}`}`,
      ),
  });
  const detail = useQuery({
    queryKey: ["admin-content-revision", content.id, selected],
    enabled: Boolean(selected),
    queryFn: () =>
      fetchAdminJson<{ revision: Revision }>(
        `/api/admin/content/${content.id}/revisions?revisionId=${selected}`,
      ),
  });
  const [error, setError] = useState<string>();
  const saved = detail.data?.revision.snapshot.content as Record<string, unknown> | undefined;
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="版本紀錄與比較">
      <h2 className="text-lg font-bold">版本紀錄與比較</h2>
      <p className="text-sm">
        目前已儲存版本 {content.version ?? "—"}；還原會建立新草稿，公開版本保持不變。
      </p>
      {history.isError || detail.isError ? <p role="alert">未能載入版本紀錄，請重試。</p> : null}
      <div className="flex flex-wrap gap-2">
        {history.data?.revisions.map((row) => (
          <button
            key={row.id}
            type="button"
            aria-pressed={selected === row.id}
            className="rounded border px-3 py-2 text-sm"
            onClick={() => setSelected(row.id)}
          >
            版本 {row.version} · {row.operation}
            {row.isPublished ? " · 曾發布" : ""}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button type="button" disabled={cursor === undefined} onClick={() => setCursor(undefined)}>
          最新版本
        </button>
        <button
          type="button"
          disabled={history.data?.nextBeforeVersion == null}
          onClick={() => setCursor(history.data?.nextBeforeVersion ?? undefined)}
        >
          較早版本
        </button>
      </div>
      {saved ? (
        <>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>欄位</th>
                <th>目前已儲存</th>
                <th>所選版本</th>
              </tr>
            </thead>
            <tbody>
              {(["title", "slug", "summary", "body"] as const).map((field) => (
                <tr key={field}>
                  <th>{{ title: "標題", slug: "網址", summary: "摘要", body: "正文" }[field]}</th>
                  <td className="max-w-64 whitespace-pre-wrap break-words">{content[field]}</td>
                  <td className="max-w-64 whitespace-pre-wrap break-words">
                    {String(saved[field] ?? "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary>所選版本的故事設定、更新與媒體資料</summary>
            <RevisionChildren snapshot={detail.data?.revision.snapshot ?? {}} />
          </details>
          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              if (!selected || !window.confirm("將此版本還原為新草稿？公開內容不會改變。")) return;
              try {
                setError(undefined);
                await onRestore(selected);
              } catch (e) {
                setError(e instanceof Error ? e.message : "還原失敗，請重試。");
              }
            }}
            className="rounded border px-3 py-2 disabled:opacity-50"
          >
            還原為新草稿
          </button>
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
    : [];
}
function RevisionChildren({ snapshot }: { snapshot: Record<string, unknown> }) {
  const profile =
    snapshot.profile && typeof snapshot.profile === "object"
      ? (snapshot.profile as Record<string, unknown>)
      : null;
  const media = records(snapshot.media);
  const updates = records(snapshot.updates);
  const links = records(snapshot.links);
  return (
    <div className="space-y-3 text-sm">
      {profile ? (
        <dl>
          <dt>救援地區</dt>
          <dd>{String(profile.rescue_region ?? "未填寫")}</dd>
          <dt>公開地圖</dt>
          <dd>{profile.show_on_map ? String(profile.public_map_label ?? "未填寫") : "不顯示"}</dd>
          <dt>內部地址</dt>
          <dd>{String(profile.internal_address ?? "未填寫")}</dd>
        </dl>
      ) : (
        <p>沒有故事設定</p>
      )}
      <h3>故事更新（{updates.length}）</h3>
      <ul>
        {updates.map((row, index) => (
          <li key={index}>
            {String(row.title ?? "未命名更新")} · {row.visibility === "internal" ? "內部" : "公開"}
            <p>{String(row.body ?? "")}</p>
          </li>
        ))}
      </ul>
      <h3>媒體（{media.length}）</h3>
      <ul>
        {media.map((row, index) => (
          <li key={index}>
            {String(row.alt_text ?? "未命名圖片")}
            {row.is_cover ? " · 封面" : ""}
            {row.caption ? <p>{String(row.caption)}</p> : null}
          </li>
        ))}
      </ul>
      <h3>關聯紀錄（{links.length}）</h3>
      <ul>
        {links.map((row, index) => (
          <li key={index}>
            {(
              {
                animal: "動物",
                adoption_case: "領養申請",
                successful_adoption: "成功領養",
                supporter: "支持者",
                volunteer_activity: "義工活動",
              } as Record<string, string>
            )[String(row.linked_type)] ?? "相關紀錄"}
          </li>
        ))}
      </ul>
    </div>
  );
}
