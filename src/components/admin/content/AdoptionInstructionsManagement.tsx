import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
import { AdminApiError, adminErrorMessage, fetchAdminJson } from "../../../lib/admin/session";
import type {
  AdoptionInstructionAdminPage,
  AdoptionInstructionHistoryPage,
} from "../../../lib/adoptionInstructions/repository.server";
import type {
  AdoptionInstructionContent,
  AdoptionInstructionRevision,
  AdoptionInstructionRevisionSummary,
} from "../../../lib/adoptionInstructions/types";
import { adoptionInstructionContentSchema } from "../../../lib/adoptionInstructions/schemas";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { adoptionInstructionsCopy } from "./adoptionInstructionsCopy";

type ProblemCode = keyof typeof adoptionInstructionsCopy.zh.problems;
/** What went wrong, as the editor keeps it: a code, and the error the server gave, if any. */
type Problem = { code: ProblemCode; cause?: unknown };

export const ADOPTION_INSTRUCTIONS_QUERY_KEY = ["admin-adoption-instructions"] as const;
type Operation =
  | { action: "create"; expectedPageVersion: number }
  | { action: "save"; expectedVersion: number; content: AdoptionInstructionContent }
  | { action: "publish"; expectedVersion: number; idempotencyKey: string }
  | { action: "archive"; expectedVersion: number }
  | { action: "restore"; revisionId: string };
export function buildAdoptionInstructionMutation(operation: Operation) {
  const { action, ...body } = operation;
  return {
    path:
      "/api/admin/adoption-instructions/" +
      (action === "save" || action === "create" || action === "archive" ? "draft" : action),
    method: action === "archive" ? "DELETE" : action === "save" ? "PUT" : "POST",
    body,
  };
}

export type AdoptionInstructionEditorHandle = { saveDraft: () => Promise<boolean> };

export function AdoptionInstructionsManagement({
  onDirtyChange,
  editorRef,
}: {
  onDirtyChange?: (dirty: boolean) => void;
  editorRef?: Ref<AdoptionInstructionEditorHandle>;
} = {}) {
  const { language } = useAdminLanguage();
  const client = useQueryClient();
  const identity = useQuery(adminIdentityQueryOptions());
  const query = useQuery({
    queryKey: ADOPTION_INSTRUCTIONS_QUERY_KEY,
    queryFn: () => fetchAdminJson<AdoptionInstructionAdminPage>("/api/admin/adoption-instructions"),
  });
  const [generation, setGeneration] = useState(0);
  const mutate = async (operation: Operation) => {
    const request = buildAdoptionInstructionMutation(operation);
    const result = await fetchAdminJson<AdoptionInstructionRevision>(request.path, {
      method: request.method,
      body: JSON.stringify(request.body),
    });
    await client.invalidateQueries({ queryKey: ADOPTION_INSTRUCTIONS_QUERY_KEY });
    return result;
  };
  return (
    <AdoptionInstructionsManagementView
      key={generation}
      data={query.data}
      loading={query.isPending}
      error={adminErrorMessage(query.error, language) ?? undefined}
      role={identity.data?.admin.role}
      onDirtyChange={onDirtyChange}
      editorRef={editorRef}
      onMutation={mutate}
      onLoadHistory={(cursor) =>
        fetchAdminJson<AdoptionInstructionHistoryPage>(
          "/api/admin/adoption-instructions/history?cursor=" + encodeURIComponent(cursor),
        )
      }
      onLoadRevision={(revisionId) =>
        fetchAdminJson<AdoptionInstructionRevision>(
          "/api/admin/adoption-instructions/revisions/" + encodeURIComponent(revisionId),
        )
      }
      onRefresh={async () => {
        await query.refetch();
      }}
      onReload={async () => {
        const result = await query.refetch();
        if (result.error) throw result.error;
        setGeneration((value) => value + 1);
      }}
    />
  );
}

type Props = {
  data?: AdoptionInstructionAdminPage;
  role?: string;
  loading?: boolean;
  error?: string;
  onMutation?: (operation: Operation) => Promise<AdoptionInstructionRevision>;
  onRefresh?: () => Promise<void>;
  onReload?: () => Promise<void>;
  onLoadHistory?: (cursor: string) => Promise<AdoptionInstructionHistoryPage>;
  onLoadRevision?: (revisionId: string) => Promise<AdoptionInstructionRevision>;
  onDirtyChange?: (dirty: boolean) => void;
  editorRef?: Ref<AdoptionInstructionEditorHandle>;
};
function fields(content: AdoptionInstructionContent): [string, string][] {
  const entries: [string, string][] = [];
  function visit(value: object, prefix = "") {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? prefix + "." + key : key;
      if (typeof child === "string") entries.push([path, child]);
      else if (child && typeof child === "object") visit(child, path);
    }
  }
  visit(content);
  return entries;
}
export function setAdoptionCopyField(
  content: AdoptionInstructionContent,
  path: string,
  value: string,
): AdoptionInstructionContent {
  const result = structuredClone(content);
  // Paths come from the fixed schema-backed form, never arbitrary server fields.
  if (!fields(content).some(([candidate]) => candidate === path)) return content;
  let node: Record<string, unknown> = result as unknown as Record<string, unknown>;
  const keys = path.split(".");
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  node[keys.at(-1)!] = value;
  return result;
}
function maxLength(path: string) {
  const field = path.split(".").at(-1)!;
  return ["description", "notice", "introduction", "emptyState"].includes(field)
    ? 500
    : field === "eyebrow" || field.endsWith("Label")
      ? 120
      : 180;
}

export function AdoptionInstructionsManagementView(props: Props) {
  const copy = useAdminCopy(adoptionInstructionsCopy);
  const { language } = useAdminLanguage();
  // This editor is deliberately not keyed by query version: refetches must not erase local work.
  const [local, setLocal] = useState<AdoptionInstructionRevision | null>(null);
  const [saved, setSaved] = useState<AdoptionInstructionRevision | null>(null);
  const [editingBase, setEditingBase] = useState<AdoptionInstructionRevision | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [conflict, setConflict] = useState(false);
  const [serverFields, setServerFields] = useState<Record<string, string[]>>({});
  const [historyExtra, setHistoryExtra] = useState<AdoptionInstructionRevisionSummary[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null | undefined>(undefined);
  const [historyPending, setHistoryPending] = useState(false);
  const [historyProblem, setHistoryProblem] = useState<Problem | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<AdoptionInstructionRevision | null>(
    null,
  );
  const [detailPending, setDetailPending] = useState(false);
  const publishKey = useRef<string | null>(null);
  const firstHistory = props.data?.history;
  useEffect(() => {
    setHistoryExtra([]);
    setHistoryCursor(undefined);
    setSelectedRevision(null);
  }, [firstHistory]);
  const allHistory = [
    ...(firstHistory ?? []),
    ...historyExtra.filter((item) => !firstHistory?.some((first) => first.id === item.id)),
  ];
  const nextHistoryCursor =
    historyCursor === undefined ? (props.data?.historyNextCursor ?? null) : historyCursor;
  async function loadMoreHistory() {
    if (!nextHistoryCursor || !props.onLoadHistory || historyPending) return;
    setHistoryPending(true);
    setHistoryProblem(null);
    try {
      const page = await props.onLoadHistory(nextHistoryCursor);
      setHistoryExtra((current) => [
        ...current,
        ...page.items.filter(
          (item) =>
            !current.some((existing) => existing.id === item.id) &&
            !firstHistory?.some((first) => first.id === item.id),
        ),
      ]);
      setHistoryCursor(page.nextCursor);
    } catch (error) {
      setHistoryProblem({ code: "history_failed", cause: error });
    } finally {
      setHistoryPending(false);
    }
  }
  async function openRevision(revisionId: string) {
    if (!props.onLoadRevision || detailPending) return;
    setDetailPending(true);
    setHistoryProblem(null);
    try {
      setSelectedRevision(await props.onLoadRevision(revisionId));
    } catch (error) {
      setHistoryProblem({ code: "revision_failed", cause: error });
    } finally {
      setDetailPending(false);
    }
  }
  const revision = local ?? props.data?.draft ?? props.data?.published;
  const base = saved ?? editingBase ?? props.data?.draft ?? props.data?.published;
  const content = revision?.content;
  const dirty = Boolean(local && JSON.stringify(local.content) !== JSON.stringify(base?.content));
  const validation = content ? adoptionInstructionContentSchema.safeParse(content) : null;
  const issues: Record<string, string[]> = { ...serverFields };
  if (validation && !validation.success)
    for (const issue of validation.error.issues)
      (issues[issue.path.join(".")] ??= []).push(copy.invalidText);
  const draft = Boolean(props.data?.draft);
  const canEdit = props.role === "admin" || props.role === "staff";
  const blocked = pending || conflict || !draft || !canEdit;
  const valid = validation?.success && !Object.keys(issues).length;
  const onDirtyChange = props.onDirtyChange;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useImperativeHandle(props.editorRef, () => ({
    saveDraft: () =>
      dirty && !blocked && valid && content && revision
        ? run({ action: "save", expectedVersion: revision.version, content })
        : Promise.resolve(false),
  }));
  async function run(operation: Operation): Promise<boolean> {
    if (!props.onMutation || pending) return false;
    setPending(true);
    setProblem(null);
    setServerFields({});
    try {
      const result = await props.onMutation(operation);
      if (operation.action === "publish" || operation.action === "archive") {
        setLocal(null);
        setSaved(null);
        setEditingBase(null);
        publishKey.current = null;
      } else {
        setLocal(result);
        setSaved(result);
        setEditingBase(result);
        publishKey.current = null;
      }
      return true;
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 409) {
        setConflict(true);
        await props.onRefresh?.().catch(() => undefined);
        setProblem({ code: "server_updated" });
      } else setProblem({ code: "action_failed", cause: error });
      if (error instanceof AdminApiError && error.fields)
        setServerFields(
          Object.fromEntries(
            Object.entries(error.fields).map(([key, value]) => [
              key.replace(/^content\./, ""),
              value,
            ]),
          ),
        );
      return false;
    } finally {
      setPending(false);
    }
  }
  const problemText = problem
    ? (adminErrorMessage(problem.cause, language) ?? copy.problems[problem.code])
    : null;
  const historyProblemText = historyProblem
    ? (adminErrorMessage(historyProblem.cause, language) ?? copy.problems[historyProblem.code])
    : null;
  if (props.loading && !props.data) return <p role="status">{copy.loading}</p>;
  if (!props.data || !content || !revision)
    return <p role="alert">{props.error ?? copy.notLoaded}</p>;
  return (
    <section className="space-y-5 p-6">
      <h2 className="text-xl font-bold">{copy.heading}</h2>
      <p>
        {copy.introBefore}
        <a href="/admin/content/adoption-guides" className="underline">
          {copy.introLink}
        </a>
        {copy.introAfter}
      </p>
      <p role="status">
        {copy.statusLine(
          props.data.published?.revisionNumber ?? null,
          draft ? revision.version : null,
          dirty,
        )}
      </p>
      <p className="text-sm">{copy.lastUpdated(revision.updatedAt, revision.updatedBy)}</p>
      {(problemText || props.error) && <p role="alert">{problemText ?? props.error}</p>}
      {conflict && (
        <div role="alert">
          <p>{copy.conflict.intro(props.data.draft?.version ?? null)}</p>
          {props.data.draft && content && (
            <details>
              <summary>{copy.conflict.summary}</summary>
              <dl>
                {fields(content)
                  .filter(([path, value]) =>
                    fields(props.data!.draft!.content).some(
                      ([serverPath, serverValue]) => serverPath === path && serverValue !== value,
                    ),
                  )
                  .map(([path, value]) => (
                    <div key={path} className="my-2 border-b pb-2">
                      <dt>{path}</dt>
                      <dd>
                        {copy.conflict.local}
                        {value}
                      </dd>
                      <dd>
                        {copy.conflict.server}
                        {fields(props.data!.draft!.content).find(([key]) => key === path)?.[1]}
                      </dd>
                    </div>
                  ))}
              </dl>
            </details>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await props.onReload?.();
              } catch (error) {
                setProblem({ code: "reload_failed", cause: error });
              } finally {
                setPending(false);
              }
            }}
          >
            {copy.conflict.useServer}
          </button>
        </div>
      )}
      {!draft && canEdit && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            void run({ action: "create", expectedPageVersion: props.data!.page.version })
          }
        >
          {copy.createDraft}
        </button>
      )}
      <fieldset disabled={blocked} className="grid gap-4 md:grid-cols-2">
        <legend className="sr-only">{copy.fieldsLegend}</legend>
        {fields(content).map(([path, value]) => (
          <label key={path} className="grid gap-1 text-sm">
            <span>
              {path
                .split(".")
                .map((key) => copy.fieldLabels[key] ?? key)
                .join(" / ")}
            </span>
            <textarea
              name={path}
              value={value}
              maxLength={maxLength(path)}
              aria-invalid={Boolean(issues[path])}
              aria-describedby={issues[path] ? path + "-error" : undefined}
              className="min-h-11 rounded border border-[var(--color-border)] p-2"
              onChange={(event) => {
                if (!local) setEditingBase(base ?? revision);
                setLocal({
                  ...revision,
                  content: setAdoptionCopyField(content, path, event.target.value),
                });
                setServerFields({});
              }}
            />
            {issues[path] && (
              <span id={path + "-error"} role="alert">
                {copy.issueLine(path, issues[path].join(" "))}
              </span>
            )}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={blocked || !valid || !dirty}
          onClick={() => void run({ action: "save", expectedVersion: revision.version, content })}
        >
          {copy.saveDraft}
        </button>
        <a
          href="/admin/content/adoption-preview"
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={blocked || dirty || !valid}
          onClick={(event) => {
            if (blocked || dirty || !valid) event.preventDefault();
          }}
        >
          {copy.previewDraft}
        </a>
        {props.role === "admin" && (
          <button
            type="button"
            disabled={blocked || !valid || dirty}
            onClick={() => {
              publishKey.current ??= crypto.randomUUID();
              void run({
                action: "publish",
                expectedVersion: revision.version,
                idempotencyKey: publishKey.current,
              });
            }}
          >
            {copy.publish}
          </button>
        )}
      </div>
      {props.role === "admin" && draft && (
        <button
          type="button"
          disabled={pending || conflict || dirty}
          onClick={() => void run({ action: "archive", expectedVersion: revision.version })}
        >
          {copy.archiveDraft}
        </button>
      )}
      {dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setLocal(null);
            setSaved(null);
            setEditingBase(null);
            setServerFields({});
          }}
        >
          {copy.discardChanges}
        </button>
      )}
      <h3 className="font-bold">{copy.history.heading}</h3>
      {draft && props.role === "admin" && <p>{copy.history.restoreBlocked}</p>}
      <ul>
        {allHistory
          .filter((item) => item.state !== "draft")
          .map((item) => (
            <li key={item.id} className="flex gap-3 py-2">
              {copy.history.item(
                item.revisionNumber,
                item.state === "published" ? "published" : "archived",
                item.publishedAt,
              )}
              <button
                type="button"
                disabled={detailPending}
                onClick={() => void openRevision(item.id)}
              >
                {copy.history.view}
              </button>
              {props.role === "admin" && (
                <button
                  type="button"
                  disabled={pending || draft || dirty || conflict}
                  onClick={() => void run({ action: "restore", revisionId: item.id })}
                >
                  {copy.history.restore}
                </button>
              )}
            </li>
          ))}
      </ul>
      {historyProblemText && <p role="alert">{historyProblemText}</p>}
      {nextHistoryCursor && props.onLoadHistory && (
        <button type="button" disabled={historyPending} onClick={() => void loadMoreHistory()}>
          {historyPending ? copy.history.loading : copy.history.more}
        </button>
      )}
      {selectedRevision && (
        <section
          aria-label={copy.history.revisionContent(selectedRevision.revisionNumber)}
          className="space-y-2"
        >
          <h4 className="font-semibold">
            {copy.history.revisionContent(selectedRevision.revisionNumber)}
          </h4>
          <dl className="space-y-2">
            {fields(selectedRevision.content).map(([path, value]) => (
              <div key={path}>
                <dt className="font-semibold">{path}</dt>
                <dd className="whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </section>
  );
}
