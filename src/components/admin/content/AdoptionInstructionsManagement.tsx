import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
import { AdminApiError, fetchAdminJson } from "../../../lib/admin/session";
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

export function AdoptionInstructionsManagement() {
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
      error={query.error?.message}
      role={identity.data?.admin.role}
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
};
const labels: Record<string, string> = {
  hero: "頁首",
  fees: "領養費用",
  estates: "可養狗屋苑",
  guides: "領養後指南",
  rules: "領養規則",
  care: "動物照顧須知",
  eyebrow: "引題",
  title: "標題",
  description: "簡介",
  sectionTitle: "章節標題",
  dogTitle: "狗隻標題",
  catTitle: "貓隻標題",
  itemLabel: "項目欄名",
  amountLabel: "費用欄名",
  notice: "費用備註",
  introduction: "介紹",
  estateLabel: "屋苑欄名",
  districtLabel: "地區欄名",
  notesLabel: "備註欄名",
  emptyState: "無資料提示（後接聯絡我們連結）",
  generalTitle: "一般指南標題",
  zhHkActionLabel: "中文下載按鈕",
  enActionLabel: "英文下載按鈕",
  cat: "貓隻",
  dog: "狗隻",
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
  // This editor is deliberately not keyed by query version: refetches must not erase local work.
  const [local, setLocal] = useState<AdoptionInstructionRevision | null>(null);
  const [saved, setSaved] = useState<AdoptionInstructionRevision | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [serverFields, setServerFields] = useState<Record<string, string[]>>({});
  const [historyExtra, setHistoryExtra] = useState<AdoptionInstructionRevisionSummary[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null | undefined>(undefined);
  const [historyPending, setHistoryPending] = useState(false);
  const [historyProblem, setHistoryProblem] = useState<string | null>(null);
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
      setHistoryProblem(error instanceof Error ? error.message : "未能載入更多版本。");
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
      setHistoryProblem(error instanceof Error ? error.message : "未能載入版本內容。");
    } finally {
      setDetailPending(false);
    }
  }
  const revision = local ?? props.data?.draft ?? props.data?.published;
  const base = saved ?? props.data?.draft ?? props.data?.published;
  const content = revision?.content;
  const dirty = Boolean(local && JSON.stringify(local.content) !== JSON.stringify(base?.content));
  const validation = content ? adoptionInstructionContentSchema.safeParse(content) : null;
  const issues: Record<string, string[]> = { ...serverFields };
  if (validation && !validation.success)
    for (const issue of validation.error.issues)
      (issues[issue.path.join(".")] ??= []).push("請填寫有效的純文字，並遵守字數限制。");
  const draft = Boolean(props.data?.draft);
  const canEdit = props.role === "admin" || props.role === "staff";
  const blocked = pending || conflict || !draft || !canEdit;
  const valid = validation?.success && !Object.keys(issues).length;
  async function run(operation: Operation) {
    if (!props.onMutation || pending) return;
    setPending(true);
    setProblem(null);
    setServerFields({});
    try {
      const result = await props.onMutation(operation);
      if (operation.action === "publish" || operation.action === "archive") {
        setLocal(null);
        setSaved(null);
        publishKey.current = null;
      } else {
        setLocal(result);
        setSaved(result);
        publishKey.current = null;
      }
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 409) {
        setConflict(true);
        await props.onRefresh?.().catch(() => undefined);
        setProblem("伺服器版本已更新；你的輸入已保留。請複製需要保留的文字，再重新載入。");
      } else setProblem(error instanceof Error ? error.message : "未能完成操作，請稍後再試。");
      if (error instanceof AdminApiError && error.fields)
        setServerFields(
          Object.fromEntries(
            Object.entries(error.fields).map(([key, value]) => [
              key.replace(/^content\./, ""),
              value,
            ]),
          ),
        );
    } finally {
      setPending(false);
    }
  }
  if (props.loading && !props.data) return <p role="status">正在載入頁面內容…</p>;
  if (!props.data || !content || !revision)
    return <p role="alert">{props.error ?? "未能載入頁面內容。請確認頁面內容資料已建立。"}</p>;
  return (
    <section className="space-y-5 p-6">
      <h2 className="text-xl font-bold">頁面內容</h2>
      <p>
        編輯中文頁面標題及說明。領養規則及照顧須知的雙語內容，請使用各自的分頁；文件請到
        <a href="/admin/content/adoption-guides" className="underline">
          領養後指南版本
        </a>
        管理。
      </p>
      <p role="status">
        已發布修訂 {props.data.published?.revisionNumber ?? "—"} ·{" "}
        {draft ? `草稿版本 ${revision.version}` : "尚未建立草稿"}
        {dirty ? " · 尚未儲存" : ""}
      </p>
      <p className="text-sm">
        最後更新：{revision.updatedAt} · {revision.updatedBy ?? "系統"}
      </p>
      {(problem || props.error) && <p role="alert">{problem ?? props.error}</p>}
      {conflict && (
        <div role="alert">
          伺服器草稿版本 {props.data.draft?.version ?? "—"}
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await props.onReload?.();
              } catch (error) {
                setProblem(error instanceof Error ? error.message : "未能重新載入。");
              } finally {
                setPending(false);
              }
            }}
          >
            放棄本機修改並重新載入
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
          建立草稿
        </button>
      )}
      <fieldset disabled={blocked} className="grid gap-4 md:grid-cols-2">
        <legend className="sr-only">中文頁面文字</legend>
        {fields(content).map(([path, value]) => (
          <label key={path} className="grid gap-1 text-sm">
            <span>
              {path
                .split(".")
                .map((key) => labels[key] ?? key)
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
                setLocal({
                  ...revision,
                  content: setAdoptionCopyField(content, path, event.target.value),
                });
                setServerFields({});
              }}
            />
            {issues[path] && (
              <span id={path + "-error"} role="alert">
                {path}：{issues[path].join(" ")}
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
          儲存草稿
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
          預覽已儲存草稿
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
            發布頁面
          </button>
        )}
      </div>
      {props.role === "admin" && draft && (
        <button
          type="button"
          disabled={pending || conflict || dirty}
          onClick={() => void run({ action: "archive", expectedVersion: revision.version })}
        >
          封存草稿（不發布）
        </button>
      )}
      {dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setLocal(saved);
            setServerFields({});
          }}
        >
          放棄未儲存修改
        </button>
      )}
      <h3 className="font-bold">版本紀錄</h3>
      {draft && props.role === "admin" && (
        <p>請先封存或發布目前草稿，才可將歷史版本還原為新草稿。</p>
      )}
      <ul>
        {allHistory
          .filter((item) => item.state !== "draft")
          .map((item) => (
            <li key={item.id} className="flex gap-3 py-2">
              修訂 {item.revisionNumber} · {item.state === "published" ? "已發布" : "已封存"} ·{" "}
              {item.publishedAt}
              <button
                type="button"
                disabled={detailPending}
                onClick={() => void openRevision(item.id)}
              >
                查看內容
              </button>
              {props.role === "admin" && (
                <button
                  type="button"
                  disabled={pending || draft || dirty || conflict}
                  onClick={() => void run({ action: "restore", revisionId: item.id })}
                >
                  還原此版本
                </button>
              )}
            </li>
          ))}
      </ul>
      {historyProblem && <p role="alert">{historyProblem}</p>}
      {nextHistoryCursor && props.onLoadHistory && (
        <button type="button" disabled={historyPending} onClick={() => void loadMoreHistory()}>
          {historyPending ? "載入版本中…" : "查看更多版本"}
        </button>
      )}
      {selectedRevision && (
        <section
          aria-label={"修訂 " + selectedRevision.revisionNumber + " 內容"}
          className="space-y-2"
        >
          <h4 className="font-semibold">修訂 {selectedRevision.revisionNumber} 內容</h4>
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
