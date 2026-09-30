import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRole } from "../admin/access";

export type TaskKey =
  | "adoption_unassigned"
  | "followup_overdue"
  | "volunteer_pending"
  | "animal_missing_photo"
  | "sponsorship_proof_pending"
  | "sponsorship_followup"
  | "payment_pending"
  | "delivery_attention"
  | "content_drafts"
  | "content_expired"
  | "media_failed";

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

const definitions: Record<TaskKey, TaskDefinition> = {
  adoption_unassigned: {
    key: "adoption_unassigned",
    label: "待分派領養個案",
    guidance: "按等候時間檢查未分派個案，先指派跟進人。",
    href: "/admin/coordinator/inbox",
  },
  followup_overdue: {
    key: "followup_overdue",
    label: "逾期待跟進",
    guidance: "檢查到期任務，記錄下一步及跟進日期。",
    href: "/admin/coordinator/tasks",
  },
  volunteer_pending: {
    key: "volunteer_pending",
    label: "待核實義工登記",
    guidance: "核對身份、政策同意及資格，再安排審核。",
    href: "/admin/volunteers",
  },
  animal_missing_photo: {
    key: "animal_missing_photo",
    label: "待補相片動物",
    guidance: "補上已核實的動物相片及資料，再交內容審核。",
    href: "/admin?section=cat",
  },
  sponsorship_proof_pending: {
    key: "sponsorship_proof_pending",
    label: "待核實助養憑證",
    guidance: "檢查憑證與承諾；上載憑證不等於已收款。",
    href: "/admin/sponsorships?proof=pending",
  },
  sponsorship_followup: {
    key: "sponsorship_followup",
    label: "助養待跟進",
    guidance: "核對付款及待跟進承諾，交由職員／管理員安排跟進。",
    href: "/admin/sponsorships?status=needs_followup",
  },
  payment_pending: {
    key: "payment_pending",
    label: "待對帳款項",
    guidance: "核對付款證據及對帳資料，再逐筆確認款項。",
    href: "/admin?section=payments",
  },
  delivery_attention: {
    key: "delivery_attention",
    label: "收條／通知需處理",
    guidance: "核對已收款及收件資料，再逐筆處理失敗工作。",
    href: "/admin?section=payments#delivery-jobs",
  },
  content_drafts: {
    key: "content_drafts",
    label: "待審內容草稿",
    guidance: "核對資料來源及內容預覽，再安排送審。",
    href: "/admin/content",
  },
  content_expired: {
    key: "content_expired",
    label: "已過期內容",
    guidance: "檢查過期內容及公開影響，再安排更新。",
    href: "/admin/content?quality=expired",
  },
  media_failed: {
    key: "media_failed",
    label: "公開媒體修復失敗",
    guidance: "查看失敗媒體，修復後再核對公開相片。",
    href: "/admin?section=cat",
  },
};

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
  return roleKeys[role].map((key) => definitions[key]);
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
