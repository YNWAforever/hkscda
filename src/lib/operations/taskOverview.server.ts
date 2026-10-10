import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRole } from "../admin/access";
import { taskCardText, type TaskKey } from "./taskCardText";

export type { TaskKey };

export type TaskMetric =
  | { state: "ready"; count: number; oldestAt: string | null }
  | { state: "unavailable" };

export type TaskCard = {
  key: TaskKey;
  label: string;
  guidance: string;
  href: string;
  metric: TaskMetric;
};

type TaskDefinition = Pick<TaskCard, "key" | "label" | "guidance" | "href">;
export type TaskRepository = {
  count(key: TaskKey): Promise<{ count: number; oldestAt: string | null }>;
};

const hrefs: Record<TaskKey, string> = {
  adoption_unassigned: "/admin/coordinator/inbox",
  followup_overdue: "/admin/coordinator/tasks",
  volunteer_pending: "/admin/volunteers",
  animal_missing_photo: "/admin?section=cat",
  sponsorship_proof_pending: "/admin/sponsorships?proof=pending",
  sponsorship_followup: "/admin/sponsorships?status=needs_followup",
  payment_pending: "/admin?section=payments",
  delivery_attention: "/admin?section=payments#delivery-jobs",
  content_drafts: "/admin/content",
  content_expired: "/admin/content?quality=expired",
  media_failed: "/admin?section=cat",
};

// The text is zh-HK, as it always was: the admin screen looks up the English text by key.
function definitionFor(key: TaskKey): TaskDefinition {
  return { key, ...taskCardText(key), href: hrefs[key] };
}

const roleKeys: Record<AdminRole, TaskKey[]> = {
  staff: [
    "adoption_unassigned",
    "followup_overdue",
    "volunteer_pending",
    "animal_missing_photo",
    "sponsorship_proof_pending",
  ],
  treasurer: [
    "payment_pending",
    "delivery_attention",
    "sponsorship_proof_pending",
    "sponsorship_followup",
  ],
  admin: [
    "content_drafts",
    "content_expired",
    "media_failed",
    "adoption_unassigned",
    "delivery_attention",
  ],
};

export function selectTaskDefinitions(role: AdminRole): TaskDefinition[] {
  return roleKeys[role].map(definitionFor);
}

export async function readTaskOverview(
  role: AdminRole,
  repository: TaskRepository,
): Promise<TaskCard[]> {
  const selected = selectTaskDefinitions(role);
  const settled = await Promise.allSettled(selected.map((card) => repository.count(card.key)));
  return selected.map((card, index) => {
    const result = settled[index];
    const metric: TaskMetric =
      result.status === "fulfilled" &&
      Number.isSafeInteger(result.value.count) &&
      result.value.count >= 0
        ? { state: "ready", count: result.value.count, oldestAt: result.value.oldestAt }
        : { state: "unavailable" };
    return { ...card, metric };
  });
}

type Filter = { op: "eq" | "is" | "lt" | "or"; column: string; value: string | null };
type CountSpec = { table: string; oldest: string; filters: Filter[] };
function specFor(key: Exclude<TaskKey, "media_failed">, now: string): CountSpec {
  switch (key) {
    case "adoption_unassigned":
      return {
        table: "adoption_case",
        oldest: "created_at",
        filters: [
          { op: "is", column: "assigned_to", value: null },
          { op: "is", column: "closed_at", value: null },
        ],
      };
    case "followup_overdue":
      return {
        table: "adoption_followup",
        oldest: "due_at",
        filters: [
          { op: "is", column: "completed_at", value: null },
          { op: "lt", column: "due_at", value: now },
        ],
      };
    case "volunteer_pending":
      return {
        table: "volunteer_registration",
        oldest: "created_at",
        filters: [{ op: "eq", column: "status", value: "pending" }],
      };
    case "animal_missing_photo":
      return {
        table: "animals",
        oldest: "created_at",
        filters: [
          { op: "or", column: "", value: "image_url.is.null,image_url.eq." },
          { op: "is", column: "retired_at", value: null },
        ],
      };
    case "sponsorship_proof_pending":
      return {
        table: "sponsorship_payment_proof",
        oldest: "created_at",
        filters: [{ op: "eq", column: "review_status", value: "pending" }],
      };
    case "sponsorship_followup":
      return {
        table: "sponsorship_pledge",
        oldest: "created_at",
        filters: [{ op: "eq", column: "status", value: "needs_followup" }],
      };
    case "payment_pending":
      return {
        table: "payment",
        oldest: "created_at",
        filters: [{ op: "eq", column: "status", value: "pending" }],
      };
    case "delivery_attention":
      return {
        table: "donation_delivery_job",
        oldest: "created_at",
        filters: [
          { op: "or", column: "", value: "status.eq.retryable,status.eq.attention_required" },
        ],
      };
    case "content_drafts":
      return {
        table: "content_item",
        oldest: "created_at",
        filters: [{ op: "eq", column: "status", value: "draft" }],
      };
    case "content_expired":
      return {
        table: "content_item",
        oldest: "effective_until",
        filters: [
          { op: "or", column: "", value: "status.eq.draft,status.eq.published" },
          { op: "lt", column: "effective_until", value: now },
        ],
      };
  }
}

async function countSpec(client: SupabaseClient, spec: CountSpec) {
  let query = client
    .from(spec.table)
    .select(spec.oldest, { count: "exact" })
    .order(spec.oldest, { ascending: true })
    .limit(1);
  for (const filter of spec.filters) {
    if (filter.op === "eq") query = query.eq(filter.column, filter.value);
    if (filter.op === "is") query = query.is(filter.column, null);
    if (filter.op === "lt") query = query.lt(filter.column, filter.value);
    if (filter.op === "or") query = query.or(filter.value ?? "");
  }
  const { data, count, error } = await query;
  if (error || count == null) throw new Error("Task metric unavailable");
  const row: unknown = data?.[0];
  const oldest =
    row && typeof row === "object" && spec.oldest in row
      ? (row as Record<string, unknown>)[spec.oldest]
      : null;
  return { count, oldestAt: typeof oldest === "string" ? oldest : null };
}

export function createSupabaseTaskRepository(
  client: SupabaseClient,
  now = () => new Date(),
): TaskRepository {
  return {
    async count(key) {
      if (key !== "media_failed") return countSpec(client, specFor(key, now().toISOString()));
      const [animal, content] = await Promise.all([
        countSpec(client, {
          table: "animal_publication_media_copy",
          oldest: "created_at",
          filters: [{ op: "eq", column: "repair_status", value: "failed" }],
        }),
        countSpec(client, {
          table: "content_public_asset",
          oldest: "created_at",
          filters: [{ op: "eq", column: "repair_status", value: "failed" }],
        }),
      ]);
      const oldestAt =
        [animal.oldestAt, content.oldestAt].filter((date): date is string => !!date).sort()[0] ??
        null;
      return { count: animal.count + content.count, oldestAt };
    },
  };
}
