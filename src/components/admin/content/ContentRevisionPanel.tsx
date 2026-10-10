import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { adminErrorMessage } from "../../../lib/admin/session";
import type { ContentRevisionSummary } from "../../../lib/content/lifecycle";
import type { ContentDetail } from "../../../lib/content/types";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { LoadFailure } from "../LoadFailure";
import { contentCommonCopy } from "./contentCommonCopy";
import { editorCopy } from "./editorCopy";
import { editorPanelsCopy } from "./editorPanelsCopy";
type Revision = { id: string; version: number; snapshot: Record<string, unknown> };

/** Why a restore failed: the caught error, whose reason is written when the panel renders. */
type RestoreFailure = { cause: unknown };

export function ContentRevisionPanel({
  content,
  disabled,
  onRestore,
}: {
  content: ContentDetail;
  disabled: boolean;
  onRestore: (id: string) => Promise<void>;
}) {
  const copy = useAdminCopy(editorPanelsCopy).revision;
  const { language } = useAdminLanguage();
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
  const [error, setError] = useState<RestoreFailure>();
  const [restoreOpen, setRestoreOpen] = useState(false);
  const errorText = error ? (adminErrorMessage(error.cause, language) ?? copy.restoreFailed) : "";
  const saved = detail.data?.revision.snapshot.content as Record<string, unknown> | undefined;
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label={copy.heading}>
      <h2 className="text-lg font-bold">{copy.heading}</h2>
      <p className="text-sm">{copy.intro(content.version)}</p>
      {history.isError || detail.isError ? (
        <LoadFailure
          error={history.error ?? detail.error}
          onRetry={() => {
            void history.refetch();
            void detail.refetch();
          }}
          title={copy.loadFailed}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {history.data?.revisions.map((row) => (
          <button
            key={row.id}
            type="button"
            aria-pressed={selected === row.id}
            className="rounded border px-3 py-2 text-sm"
            onClick={() => setSelected(row.id)}
          >
            {copy.version(row.version, copy.operation(row.operation), row.isPublished)}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <Button
          variant="outline"
          type="button"
          disabled={cursor === undefined}
          onClick={() => setCursor(undefined)}
        >
          {copy.latest}
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={history.data?.nextBeforeVersion == null}
          onClick={() => setCursor(history.data?.nextBeforeVersion ?? undefined)}
        >
          {copy.earlier}
        </Button>
      </div>
      {saved ? (
        <>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>{copy.columns.field}</th>
                <th>{copy.columns.saved}</th>
                <th>{copy.columns.selected}</th>
              </tr>
            </thead>
            <tbody>
              {(["title", "slug", "summary", "body"] as const).map((field) => (
                <tr key={field}>
                  <th>{copy.fields[field]}</th>
                  <td className="max-w-64 whitespace-pre-wrap break-words">{content[field]}</td>
                  <td className="max-w-64 whitespace-pre-wrap break-words">
                    {String(saved[field] ?? "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary>{copy.details}</summary>
            <RevisionChildren snapshot={detail.data?.revision.snapshot ?? {}} />
          </details>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setRestoreOpen(true)}
            className="rounded border px-3 py-2 disabled:opacity-50"
          >
            {copy.restore}
          </button>
          <ConfirmActionDialog
            open={restoreOpen}
            onOpenChange={setRestoreOpen}
            title={copy.restore}
            consequence={copy.restoreConfirm}
            confirmLabel={copy.restore}
            reason="none"
            onConfirm={async () => {
              if (!selected) return;
              try {
                setError(undefined);
                await onRestore(selected);
              } catch (e) {
                // The panel shows a failed restore itself, under the list.
                setError({ cause: e });
              }
            }}
          />
        </>
      ) : null}
      {errorText ? <p role="alert">{errorText}</p> : null}
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

/**
 * The story wall settings, updates, media and linked records of a saved version. Exported so a
 * test can show it for a snapshot, which a static render of the panel only does after a click.
 */
export function RevisionChildren({ snapshot }: { snapshot: Record<string, unknown> }) {
  const copy = useAdminCopy(editorPanelsCopy).revision.children;
  const common = useAdminCopy(contentCommonCopy);
  const linkTypes = useAdminCopy(editorCopy).links.types as Record<string, string>;
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
          <dt>{copy.region}</dt>
          <dd>{String(profile.rescue_region ?? copy.notEntered)}</dd>
          <dt>{copy.map}</dt>
          <dd>
            {profile.show_on_map ? String(profile.public_map_label ?? copy.notEntered) : copy.noMap}
          </dd>
          <dt>{copy.address}</dt>
          <dd>{String(profile.internal_address ?? copy.notEntered)}</dd>
        </dl>
      ) : (
        <p>{copy.noProfile}</p>
      )}
      <h3>{copy.updates(updates.length)}</h3>
      <ul>
        {updates.map((row, index) => (
          <li key={index}>
            {String(row.title ?? copy.untitledUpdate)} ·{" "}
            {row.visibility === "internal" ? common.visibility.internal : common.visibility.public}
            <p>{String(row.body ?? "")}</p>
          </li>
        ))}
      </ul>
      <h3>{copy.media(media.length)}</h3>
      <ul>
        {media.map((row, index) => (
          <li key={index}>
            {String(row.alt_text ?? copy.untitledImage)}
            {row.is_cover ? copy.cover : ""}
            {row.caption ? <p>{String(row.caption)}</p> : null}
          </li>
        ))}
      </ul>
      <h3>{copy.links(links.length)}</h3>
      <ul>
        {links.map((row, index) => (
          <li key={index}>{linkTypes[String(row.linked_type)] ?? copy.relatedRecord}</li>
        ))}
      </ul>
    </div>
  );
}
