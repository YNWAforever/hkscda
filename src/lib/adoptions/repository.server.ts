import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AdoptionCoordinatorRepository,
  AdopterSearch,
  CaseFromPublicApplicationInput,
  CoordinatorExportPage,
  CoordinatorTaskInput,
  CoordinatorTaskUpdate,
  StatusUpdate,
  TaskListSearch,
} from "./service";
import { hongKongDayBounds } from "./tasks";
import type {
  AdoptionCaseDetail,
  AdoptionCaseSummary,
  AdopterSummary,
  AnimalMatchSummary,
  CoordinatorAdopterExportRow,
  CoordinatorAnimalExportRow,
  CoordinatorCaseExportRow,
  CoordinatorStatus,
  CoordinatorTask,
  CoordinatorSuccessfulAdoptionExportRow,
  CoordinatorTaskExportRow,
  SuccessfulAdoption,
} from "./types";

export { hongKongDayBounds } from "./tasks";

type StatusRow = {
  id: string;
  category: CoordinatorStatus["category"];
  key: string;
  label_zh: string;
  label_en: string;
  sort_order: number;
  color: string;
  is_active: boolean;
  is_system: boolean;
  is_closing: boolean;
  is_final: boolean;
};

type AdoptionCaseRow = {
  id: string;
  status_id: string;
  requested_animal_id: string | null;
  animal_type: string;
  applicant_name: string;
  applicant_phone: string;
  applicant_email: string | null;
  applicant_address: string | null;
  housing_type: string | null;
  family_size: number | null;
  existing_pets: string | null;
  reason: string | null;
  supporter_id: string | null;
  adopter_profile_id: string | null;
  assessment: Record<string, unknown>;
  preferences: Record<string, unknown>;
  closed_at: string | null;
  created_at: string;
};

type AnimalRow = {
  id: string;
  name: string;
  name_en: string | null;
};

type AnimalExportAnimalRow = AnimalRow & {
  type: string;
  status: string;
};

type AnimalInternalProfileRow = {
  animal_id: string;
  internal_code: string | null;
  current_position_id: string | null;
  arrival_source_id: string | null;
  is_adoptable: boolean | null;
  is_inside_support_pool: boolean | null;
  adopted_at: string | null;
  deceased_at: string | null;
};

type AnimalPositionRow = {
  id: string;
  name: string;
};

type ArrivalSourceRow = {
  id: string;
  name_zh: string | null;
  name_en: string | null;
};

type AnimalMatchRow = {
  id: string;
  adoption_case_id: string;
  animal_id: string;
  status_id: string;
  is_approved: boolean;
  notes: string | null;
};

type FollowupRow = {
  id: string;
  adoption_case_id: string | null;
  adopter_profile_id: string | null;
  animal_id: string | null;
  status_id: string;
  title: string;
  task_type: string;
  priority: string;
  due_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  volunteer: string | null;
  contact_channel: string | null;
  outcome: string | null;
  next_step_at: string | null;
  remarks: string | null;
  has_window_net: boolean | null;
  environment: string | null;
  score: string | null;
  created_at: string;
  updated_at: string;
};

type TaskCaseRow = {
  id: string;
  applicant_name: string;
  animal_type: string;
};

type TaskAdopterRow = {
  id: string;
  supporter_id: string | null;
  is_blacklisted: boolean | null;
  supporter:
    | {
        name: string | null;
      }
    | Array<{
        name: string | null;
      }>
    | null;
};

type TaskAnimalRow = {
  id: string;
  name: string;
  name_en: string | null;
  type: string;
  status: string;
};

type SuccessfulAdoptionRow = {
  id: string;
  adoption_case_id: string;
  animal_id: string;
  supporter_id: string;
  adopter_profile_id: string;
  case_number: string;
  adoption_fee_cents: number | null;
  approval_date: string;
  pickup_date: string | null;
};

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function sanitizeOrLikeValue(value: string) {
  // PostgREST .or() uses comma and parentheses for grammar, so keep search terms literal.
  return escapeLike(
    value
      .replace(/[(),]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s+([%_])/g, "$1"),
  );
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

export function mapStatus(row: StatusRow): CoordinatorStatus {
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    labelZh: row.label_zh,
    labelEn: row.label_en,
    sortOrder: row.sort_order,
    color: row.color,
    isActive: row.is_active,
    isSystem: row.is_system,
    isClosing: row.is_closing,
    isFinal: row.is_final,
  };
}

function statusLabel(status: CoordinatorStatus) {
  return status.labelEn || status.labelZh || status.key;
}

function animalName(row: AnimalRow | undefined) {
  if (!row) return null;
  return row.name_en ? `${row.name} / ${row.name_en}` : row.name;
}

async function loadStatusesByIds(client: SupabaseClient, ids: string[]) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, CoordinatorStatus>();

  const { data, error } = await client.from("coordinator_status").select("*").in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as StatusRow[]).map((row) => [row.id, mapStatus(row)]));
}

async function loadAnimalsByIds(client: SupabaseClient, ids: string[]) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, AnimalRow>();

  const { data, error } = await client
    .from("animals")
    .select("id,name,name_en")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as AnimalRow[]).map((row) => [row.id, row]));
}

async function loadTaskCasesByIds(client: SupabaseClient, ids: Array<string | null | undefined>) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, TaskCaseRow>();

  const { data, error } = await client
    .from("adoption_case")
    .select("id,applicant_name,animal_type")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as TaskCaseRow[]).map((row) => [row.id, row]));
}

async function loadTaskAdoptersByIds(
  client: SupabaseClient,
  ids: Array<string | null | undefined>,
) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, TaskAdopterRow>();

  const { data, error } = await client
    .from("adopter_profile")
    .select("id,supporter_id,is_blacklisted,supporter:supporter_id(name)")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as TaskAdopterRow[]).map((row) => [row.id, row]));
}

async function loadTaskAnimalsByIds(client: SupabaseClient, ids: Array<string | null | undefined>) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, TaskAnimalRow>();

  const { data, error } = await client
    .from("animals")
    .select("id,name,name_en,type,status")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as TaskAnimalRow[]).map((row) => [row.id, row]));
}

async function loadTaskLinks(client: SupabaseClient, rows: FollowupRow[]) {
  const [cases, adopters, animals] = await Promise.all([
    loadTaskCasesByIds(
      client,
      rows.map((row) => row.adoption_case_id),
    ),
    loadTaskAdoptersByIds(
      client,
      rows.map((row) => row.adopter_profile_id),
    ),
    loadTaskAnimalsByIds(
      client,
      rows.map((row) => row.animal_id),
    ),
  ]);

  return { cases, adopters, animals };
}

async function searchCaseIds(client: SupabaseClient, q: string) {
  const like = `%${escapeLike(q)}%`;
  const columns = ["applicant_name", "applicant_phone", "applicant_email"] as const;
  const results = await Promise.all(
    columns.map((column) => client.from("adoption_case").select("id").ilike(column, like)),
  );

  for (const result of results) {
    if (result.error) throw result.error;
  }

  return unique(
    results.flatMap((result) => (result.data ?? []).map((row) => (row as { id: string }).id)),
  );
}

function requireStatus(statuses: Map<string, CoordinatorStatus>, id: string) {
  const status = statuses.get(id);
  if (!status) throw new Error(`Missing coordinator status ${id}`);
  return status;
}

function mapCaseSummary(
  row: AdoptionCaseRow,
  statuses: Map<string, CoordinatorStatus>,
  animals: Map<string, AnimalRow>,
): AdoptionCaseSummary {
  return {
    id: row.id,
    applicantName: row.applicant_name,
    applicantPhone: row.applicant_phone,
    applicantEmail: row.applicant_email,
    animalType: row.animal_type,
    requestedAnimalName: row.requested_animal_id
      ? animalName(animals.get(row.requested_animal_id))
      : null,
    status: requireStatus(statuses, row.status_id),
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

function mapMatchSummary(
  row: AnimalMatchRow,
  statuses: Map<string, CoordinatorStatus>,
  animals: Map<string, AnimalRow>,
): AnimalMatchSummary {
  return {
    id: row.id,
    animalId: row.animal_id,
    animalName: animalName(animals.get(row.animal_id)) ?? "",
    status: requireStatus(statuses, row.status_id),
    isApproved: row.is_approved,
    notes: row.notes,
  };
}

type TaskLinks = Awaited<ReturnType<typeof loadTaskLinks>>;

function supporterName(row: TaskAdopterRow | undefined) {
  if (!row) return null;
  const supporter = Array.isArray(row.supporter) ? row.supporter[0] : row.supporter;
  return supporter?.name ?? null;
}

function mapCoordinatorTask(
  row: FollowupRow,
  statuses: Map<string, CoordinatorStatus>,
  links?: TaskLinks,
): CoordinatorTask {
  const adoptionCase = row.adoption_case_id ? links?.cases.get(row.adoption_case_id) : undefined;
  const adopterProfile = row.adopter_profile_id
    ? links?.adopters.get(row.adopter_profile_id)
    : undefined;
  const animal = row.animal_id ? links?.animals.get(row.animal_id) : undefined;

  return {
    id: row.id,
    title: row.title,
    status: requireStatus(statuses, row.status_id),
    taskType: row.task_type,
    priority: row.priority as CoordinatorTask["priority"],
    dueAt: row.due_at,
    scheduledAt: row.scheduled_at,
    completedAt: row.completed_at,
    assignedTo: row.assigned_to,
    volunteer: row.volunteer,
    contactChannel: row.contact_channel as CoordinatorTask["contactChannel"],
    outcome: row.outcome,
    nextStepAt: row.next_step_at,
    remarks: row.remarks,
    hasWindowNet: row.has_window_net,
    environment: row.environment,
    score: row.score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    adoptionCase: row.adoption_case_id
      ? {
          id: row.adoption_case_id,
          applicantName: adoptionCase?.applicant_name ?? row.adoption_case_id,
          animalType: adoptionCase?.animal_type ?? "",
        }
      : null,
    adopterProfile: row.adopter_profile_id
      ? {
          id: row.adopter_profile_id,
          supporterId: adopterProfile?.supporter_id ?? null,
          displayName: supporterName(adopterProfile) ?? row.adopter_profile_id,
          isBlacklisted: adopterProfile?.is_blacklisted ?? false,
        }
      : null,
    animal: row.animal_id
      ? {
          id: row.animal_id,
          name: animal?.name ?? row.animal_id,
          nameEn: animal?.name_en ?? null,
          type: animal?.type ?? "",
          status: animal?.status ?? "",
        }
      : null,
  };
}

function mapSuccessfulAdoption(row: SuccessfulAdoptionRow | null): SuccessfulAdoption | null {
  if (!row) return null;
  return {
    id: row.id,
    caseNumber: row.case_number,
    animalId: row.animal_id,
    supporterId: row.supporter_id,
    adopterProfileId: row.adopter_profile_id,
    adoptionFeeCents: row.adoption_fee_cents,
    approvalDate: row.approval_date,
    pickupDate: row.pickup_date,
  };
}

function toStatusUpdatePayload(input: StatusUpdate) {
  const payload: Record<string, unknown> = {};
  if (input.category !== undefined) payload.category = input.category;
  if (input.key !== undefined) payload.key = input.key;
  if (input.labelZh !== undefined) payload.label_zh = input.labelZh;
  if (input.labelEn !== undefined) payload.label_en = input.labelEn;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  if (input.color !== undefined) payload.color = input.color;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.isClosing !== undefined) payload.is_closing = input.isClosing;
  if (input.isFinal !== undefined) payload.is_final = input.isFinal;
  return payload;
}

function toTaskInsertPayload(input: CoordinatorTaskInput & { createdBy: string }) {
  return {
    adoption_case_id: input.adoptionCaseId ?? null,
    adopter_profile_id: input.adopterProfileId ?? null,
    animal_id: input.animalId ?? null,
    status_id: input.statusId,
    title: input.title,
    task_type: input.taskType,
    priority: input.priority,
    due_at: input.dueAt ?? null,
    scheduled_at: input.scheduledAt ?? null,
    completed_at: input.completedAt ?? null,
    assigned_to: input.assignedTo ?? null,
    volunteer: input.volunteer ?? null,
    contact_channel: input.contactChannel ?? null,
    outcome: input.outcome ?? null,
    next_step_at: input.nextStepAt ?? null,
    remarks: input.remarks ?? null,
    has_window_net: input.hasWindowNet ?? null,
    environment: input.environment ?? null,
    score: input.score ?? null,
    created_by: input.createdBy,
    updated_by: input.createdBy,
  };
}

function assignTaskUpdate(
  payload: Record<string, unknown>,
  column: string,
  value: string | boolean | null | undefined,
) {
  if (value !== undefined) payload[column] = value;
}

function toTaskUpdatePayload(input: CoordinatorTaskUpdate & { updatedBy: string }) {
  const payload: Record<string, unknown> = {};
  assignTaskUpdate(payload, "title", input.title);
  assignTaskUpdate(payload, "status_id", input.statusId);
  assignTaskUpdate(payload, "adoption_case_id", input.adoptionCaseId);
  assignTaskUpdate(payload, "adopter_profile_id", input.adopterProfileId);
  assignTaskUpdate(payload, "animal_id", input.animalId);
  assignTaskUpdate(payload, "task_type", input.taskType);
  assignTaskUpdate(payload, "priority", input.priority);
  assignTaskUpdate(payload, "due_at", input.dueAt);
  assignTaskUpdate(payload, "scheduled_at", input.scheduledAt);
  assignTaskUpdate(payload, "completed_at", input.completedAt);
  assignTaskUpdate(payload, "assigned_to", input.assignedTo);
  assignTaskUpdate(payload, "volunteer", input.volunteer);
  assignTaskUpdate(payload, "contact_channel", input.contactChannel);
  assignTaskUpdate(payload, "outcome", input.outcome);
  assignTaskUpdate(payload, "next_step_at", input.nextStepAt);
  assignTaskUpdate(payload, "remarks", input.remarks);
  assignTaskUpdate(payload, "has_window_net", input.hasWindowNet);
  assignTaskUpdate(payload, "environment", input.environment);
  assignTaskUpdate(payload, "score", input.score);
  payload.updated_by = input.updatedBy;
  return payload;
}

const taskSelectColumns = [
  "id",
  "adoption_case_id",
  "adopter_profile_id",
  "animal_id",
  "status_id",
  "title",
  "task_type",
  "priority",
  "due_at",
  "scheduled_at",
  "completed_at",
  "assigned_to",
  "volunteer",
  "contact_channel",
  "outcome",
  "next_step_at",
  "remarks",
  "has_window_net",
  "environment",
  "score",
  "created_at",
  "updated_at",
].join(",");

async function loadNewAdoptionCaseStatusId(client: SupabaseClient) {
  const { data, error } = await client
    .from("coordinator_status")
    .select("id")
    .eq("category", "adoption_case")
    .eq("key", "new")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Missing adoption_case/new coordinator status");
  return (data as { id: string }).id;
}

async function findActiveSupporterByEmail(client: SupabaseClient, email: string) {
  const { data, error } = await client
    .from("supporter")
    .select("id")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: (data as { id: string }).id } : null;
}

async function createPublicApplicationSupporter(
  client: SupabaseClient,
  input: CaseFromPublicApplicationInput,
) {
  const { data, error } = await client
    .from("supporter")
    .insert({
      name: input.applicantName,
      email: input.applicantEmail,
      phone: input.applicantPhone,
      language: "zh-HK",
      source: "adoption_form",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

async function ensurePublicApplicationSupporter(
  client: SupabaseClient,
  input: CaseFromPublicApplicationInput,
) {
  return (
    (await findActiveSupporterByEmail(client, input.applicantEmail)) ??
    (await createPublicApplicationSupporter(client, input))
  );
}

async function ensureAdopterRole(client: SupabaseClient, supporterId: string) {
  const { error } = await client
    .from("supporter_role")
    .upsert({ supporter_id: supporterId, role: "adopter" }, { onConflict: "supporter_id,role" });
  if (error) throw error;
}

async function findAdopterProfileBySupporterId(client: SupabaseClient, supporterId: string) {
  const { data, error } = await client
    .from("adopter_profile")
    .select("id")
    .eq("supporter_id", supporterId)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: (data as { id: string }).id } : null;
}

async function createAdopterProfile(
  client: SupabaseClient,
  input: CaseFromPublicApplicationInput,
  supporterId: string,
) {
  const { data, error } = await client
    .from("adopter_profile")
    .insert({
      supporter_id: supporterId,
      address: input.applicantAddress,
      household_size: input.familySize === null ? null : String(input.familySize),
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

async function ensureAdopterProfile(
  client: SupabaseClient,
  input: CaseFromPublicApplicationInput,
  supporterId: string,
) {
  return (
    (await findAdopterProfileBySupporterId(client, supporterId)) ??
    (await createAdopterProfile(client, input, supporterId))
  );
}

type AdopterSupporter = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

function adopterSupporter(row: Record<string, unknown>) {
  const supporter = row.supporter as AdopterSupporter | AdopterSupporter[] | null;
  return Array.isArray(supporter) ? (supporter[0] ?? null) : supporter;
}

function adopterDisplayName(row: Record<string, unknown>) {
  const supporter = adopterSupporter(row);
  return (
    (row.name_english as string | null) ||
    (row.name_chinese as string | null) ||
    supporter?.name ||
    (row.id as string)
  );
}

function countOpenCases(rows: AdoptionCaseRow[], adopterProfileId: string) {
  return rows.filter((row) => row.adopter_profile_id === adopterProfileId && !row.closed_at).length;
}

function caseAdopterProfileMap(rows: AdoptionCaseRow[]) {
  return new Map(rows.map((row) => [row.id, row.adopter_profile_id]));
}

function taskBelongsToAdopter(
  row: FollowupRow,
  adopterProfileId: string,
  caseAdopterProfiles: Map<string, string | null>,
) {
  return (
    row.adopter_profile_id === adopterProfileId ||
    (row.adoption_case_id
      ? caseAdopterProfiles.get(row.adoption_case_id) === adopterProfileId
      : false)
  );
}

function countOpenTasks(
  rows: FollowupRow[],
  adopterProfileId: string,
  caseAdopterProfiles: Map<string, string | null>,
) {
  const openTaskIds = new Set(
    rows
      .filter(
        (row) =>
          !row.completed_at && taskBelongsToAdopter(row, adopterProfileId, caseAdopterProfiles),
      )
      .map((row) => row.id),
  );
  return openTaskIds.size;
}

function mergeFollowupRows(...groups: FollowupRow[][]) {
  const rows = new Map<string, { row: FollowupRow; index: number }>();
  let index = 0;
  for (const group of groups) {
    for (const row of group) {
      if (!rows.has(row.id)) rows.set(row.id, { row, index });
      index += 1;
    }
  }

  return [...rows.values()]
    .sort((left, right) => {
      if (left.row.due_at && right.row.due_at) {
        return left.row.due_at.localeCompare(right.row.due_at) || left.index - right.index;
      }
      if (left.row.due_at) return -1;
      if (right.row.due_at) return 1;
      return left.index - right.index;
    })
    .map(({ row }) => row);
}

async function loadFollowupsByColumn(
  client: SupabaseClient,
  column: "adopter_profile_id" | "adoption_case_id",
  ids: Array<string | null | undefined>,
  columns: string,
) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return [];

  const { data, error } = await client
    .from("adoption_followup")
    .select(columns)
    .in(column, uniqueIds)
    .order("due_at", { ascending: true });
  if (error) throw error;

  return (data ?? []) as unknown as FollowupRow[];
}

async function loadFollowupsForAdopters(
  client: SupabaseClient,
  adopterIds: string[],
  caseRows: AdoptionCaseRow[],
  columns: string,
) {
  const [directRows, caseRowsLinked] = await Promise.all([
    loadFollowupsByColumn(client, "adopter_profile_id", adopterIds, columns),
    loadFollowupsByColumn(
      client,
      "adoption_case_id",
      caseRows.map((row) => row.id),
      columns,
    ),
  ]);

  return mergeFollowupRows(directRows, caseRowsLinked);
}

function intersectCandidateIds(current: Set<string> | null, next: Set<string>) {
  if (!current) return next;
  return new Set([...current].filter((id) => next.has(id)));
}

async function searchAdopterIds(client: SupabaseClient, q: string) {
  const like = `%${sanitizeOrLikeValue(q)}%`;
  const [profileResult, supporterResult] = await Promise.all([
    client
      .from("adopter_profile")
      .select("id")
      .or(`name_english.ilike.${like},name_chinese.ilike.${like},address.ilike.${like}`),
    client
      .from("supporter")
      .select("id")
      .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (supporterResult.error) throw supporterResult.error;

  const profileIds = (profileResult.data ?? []).map((row) => (row as { id: string }).id);
  const supporterIds = unique(
    (supporterResult.data ?? []).map((row) => (row as { id: string }).id),
  );
  if (supporterIds.length === 0) return unique(profileIds);

  const { data, error } = await client
    .from("adopter_profile")
    .select("id")
    .in("supporter_id", supporterIds);
  if (error) throw error;

  return unique([...profileIds, ...(data ?? []).map((row) => (row as { id: string }).id)]);
}

async function loadOpenCaseAdopterIds(client: SupabaseClient) {
  const { data, error } = await client
    .from("adoption_case")
    .select("adopter_profile_id")
    .is("closed_at", null);
  if (error) throw error;

  return unique((data ?? []).map((row) => (row as AdoptionCaseRow).adopter_profile_id));
}

async function loadOpenTaskAdopterIds(client: SupabaseClient) {
  const { data, error } = await client
    .from("adoption_followup")
    .select("id,adopter_profile_id,adoption_case_id")
    .is("completed_at", null);
  if (error) throw error;

  const taskRows = (data ?? []) as unknown as FollowupRow[];
  const caseIds = unique(taskRows.map((row) => row.adoption_case_id));
  let caseAdopterIds: Array<string | null> = [];

  if (caseIds.length > 0) {
    const caseResult = await client
      .from("adoption_case")
      .select("id,adopter_profile_id")
      .in("id", caseIds);
    if (caseResult.error) throw caseResult.error;
    caseAdopterIds = ((caseResult.data ?? []) as AdoptionCaseRow[]).map(
      (row) => row.adopter_profile_id,
    );
  }

  return unique([...taskRows.map((row) => row.adopter_profile_id), ...caseAdopterIds]);
}

async function resolveAdopterCandidateIds(
  client: SupabaseClient,
  input: { q?: string; hasOpenCases: boolean; hasOpenTasks: boolean },
) {
  let candidateIds: Set<string> | null = null;

  if (input.q) {
    candidateIds = intersectCandidateIds(
      candidateIds,
      new Set(await searchAdopterIds(client, input.q)),
    );
  }
  if (input.hasOpenCases) {
    candidateIds = intersectCandidateIds(
      candidateIds,
      new Set(await loadOpenCaseAdopterIds(client)),
    );
  }
  if (input.hasOpenTasks) {
    candidateIds = intersectCandidateIds(
      candidateIds,
      new Set(await loadOpenTaskAdopterIds(client)),
    );
  }

  return candidateIds;
}

async function listAdopterSummaries(client: SupabaseClient, input: AdopterSearch) {
  const from = (input.page - 1) * input.pageSize;
  const candidateIdSet = await resolveAdopterCandidateIds(client, input);
  if (candidateIdSet && candidateIdSet.size === 0) {
    return { adopters: [], total: 0 };
  }

  let query = client
    .from("adopter_profile")
    .select(
      "*,supporter:supporter_id(id,name,email,phone),living_area:living_area_id(name_zh,name_en)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + input.pageSize - 1);

  if (input.blacklisted === "yes") query = query.eq("is_blacklisted", true);
  if (input.blacklisted === "no") query = query.eq("is_blacklisted", false);
  if (candidateIdSet) {
    // TODO(Q1): Move large candidate ID filters to an indexed SQL/RPC search path.
    query = query.in("id", [...candidateIdSet]);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Record<string, unknown>[];
  const adopterIds = rows.map((row) => row.id as string);
  if (adopterIds.length === 0) {
    return { adopters: [], total: count ?? 0 };
  }

  const [caseResult, successResult] = await Promise.all([
    client
      .from("adoption_case")
      .select("id,adopter_profile_id,closed_at,created_at")
      .in("adopter_profile_id", adopterIds),
    client
      .from("successful_adoption")
      .select("id,adopter_profile_id")
      .in("adopter_profile_id", adopterIds),
  ]);
  if (caseResult.error) throw caseResult.error;
  if (successResult.error) throw successResult.error;

  const caseRows = (caseResult.data ?? []) as AdoptionCaseRow[];
  const taskRows = await loadFollowupsForAdopters(
    client,
    adopterIds,
    caseRows,
    "id,adoption_case_id,adopter_profile_id,completed_at",
  );
  const successRows = (successResult.data ?? []) as SuccessfulAdoptionRow[];
  const caseAdopterProfiles = caseAdopterProfileMap(caseRows);

  const adopters: AdopterSummary[] = rows.map((row) => {
    const id = row.id as string;
    const supporter = adopterSupporter(row);
    const livingArea = row.living_area as {
      name_zh?: string | null;
      name_en?: string | null;
    } | null;
    const casesForAdopter = caseRows.filter((caseRow) => caseRow.adopter_profile_id === id);

    return {
      id,
      supporterId: supporter?.id ?? (row.supporter_id as string | null) ?? null,
      displayName: adopterDisplayName(row),
      email: supporter?.email ?? null,
      phone: supporter?.phone ?? null,
      livingArea: livingArea?.name_zh ?? livingArea?.name_en ?? null,
      isBlacklisted: Boolean(row.is_blacklisted),
      openCaseCount: countOpenCases(caseRows, id),
      successfulAdoptionCount: successRows.filter((success) => success.adopter_profile_id === id)
        .length,
      openTaskCount: countOpenTasks(taskRows, id, caseAdopterProfiles),
      latestCaseAt:
        casesForAdopter
          .map((caseRow) => caseRow.created_at)
          .sort()
          .at(-1) ?? null,
    };
  });

  return { adopters, total: count ?? adopters.length };
}

function mapAdopterExportRow(adopter: AdopterSummary): CoordinatorAdopterExportRow {
  return {
    adopterProfileId: adopter.id,
    supporterId: adopter.supporterId,
    displayName: adopter.displayName,
    email: adopter.email,
    phone: adopter.phone,
    livingArea: adopter.livingArea,
    isBlacklisted: adopter.isBlacklisted,
    openCaseCount: adopter.openCaseCount,
    successfulAdoptionCount: adopter.successfulAdoptionCount,
    openTaskCount: adopter.openTaskCount,
    latestCaseAt: adopter.latestCaseAt,
  };
}

async function listCoordinatorTasks(client: SupabaseClient, input: TaskListSearch) {
  const from = (input.page - 1) * input.pageSize;
  let query = client
    .from("adoption_followup")
    .select(taskSelectColumns, { count: "exact" })
    .order("due_at", { ascending: true })
    .order("created_at", { ascending: false })
    .range(from, from + input.pageSize - 1);

  if (input.statusId) query = query.eq("status_id", input.statusId);
  if (input.priority) query = query.eq("priority", input.priority);
  if (input.taskType) query = query.eq("task_type", input.taskType);
  if (input.adoptionCaseId) query = query.eq("adoption_case_id", input.adoptionCaseId);
  if (input.adopterProfileId) query = query.eq("adopter_profile_id", input.adopterProfileId);
  if (input.animalId) query = query.eq("animal_id", input.animalId);
  if (input.assignedTo) query = query.ilike("assigned_to", `%${escapeLike(input.assignedTo)}%`);
  if (input.q) {
    const like = `%${sanitizeOrLikeValue(input.q)}%`;
    query = query.or(`title.ilike.${like},remarks.ilike.${like},outcome.ilike.${like}`);
  }

  let openOnly = input.openOnly;
  if (input.due === "none") {
    query = query.is("due_at", null);
  } else if (input.due === "overdue") {
    query = query.lt("due_at", new Date().toISOString());
    openOnly = true;
  } else if (input.due === "upcoming") {
    const { end } = hongKongDayBounds(new Date());
    query = query.gte("due_at", end);
    openOnly = true;
  } else if (input.due === "today") {
    const now = new Date();
    const { end } = hongKongDayBounds(now);
    query = query.gte("due_at", now.toISOString()).lt("due_at", end);
    openOnly = true;
  }

  if (openOnly) query = query.is("completed_at", null);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as FollowupRow[];
  const [statuses, taskLinks] = await Promise.all([
    loadStatusesByIds(
      client,
      rows.map((row) => row.status_id),
    ),
    loadTaskLinks(client, rows),
  ]);

  return {
    tasks: rows.map((row) => mapCoordinatorTask(row, statuses, taskLinks)),
    total: count ?? 0,
  };
}

function mapTaskExportRow(task: CoordinatorTask): CoordinatorTaskExportRow {
  return {
    taskId: task.id,
    title: task.title,
    status: statusLabel(task.status),
    priority: task.priority,
    dueAt: task.dueAt,
    completedAt: task.completedAt,
    adoptionCaseId: task.adoptionCase?.id ?? null,
    adopterProfileId: task.adopterProfile?.id ?? null,
    animalId: task.animal?.id ?? null,
    assignedTo: task.assignedTo,
    volunteer: task.volunteer,
    contactChannel: task.contactChannel,
    outcome: task.outcome,
    remarks: task.remarks,
  };
}

export function createSupabaseAdoptionCoordinatorRepository(
  client: SupabaseClient,
): AdoptionCoordinatorRepository {
  return {
    async listStatuses(category) {
      let query = client
        .from("coordinator_status")
        .select("*")
        .order("category")
        .order("sort_order", { ascending: true });
      if (category) query = query.eq("category", category);

      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as StatusRow[]).map(mapStatus);
    },

    async getStatus(id) {
      const { data, error } = await client
        .from("coordinator_status")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapStatus(data as StatusRow) : null;
    },

    async createStatus(input) {
      const { data, error } = await client
        .from("coordinator_status")
        .insert({
          category: input.category,
          key: input.key,
          label_zh: input.labelZh,
          label_en: input.labelEn,
          sort_order: input.sortOrder,
          color: input.color,
          is_active: input.isActive,
          is_closing: input.isClosing,
          is_final: input.isFinal,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapStatus(data as StatusRow);
    },

    async updateStatus(id, input) {
      const { data, error } = await client
        .from("coordinator_status")
        .update(toStatusUpdatePayload(input))
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return mapStatus(data as StatusRow);
    },

    async deleteStatus(id) {
      const { error } = await client.from("coordinator_status").delete().eq("id", id);
      if (error) throw error;
    },

    async listCases(input) {
      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("adoption_case")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + input.pageSize - 1);

      if (input.statusId) query = query.eq("status_id", input.statusId);
      if (input.animalType) query = query.eq("animal_type", input.animalType);
      if (input.openOnly) query = query.is("closed_at", null);
      if (input.q) {
        const ids = await searchCaseIds(client, input.q);
        if (ids.length === 0) return { cases: [], total: 0 };
        query = query.in("id", ids);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const rows = (data ?? []) as AdoptionCaseRow[];
      const [statuses, animals] = await Promise.all([
        loadStatusesByIds(
          client,
          rows.map((row) => row.status_id),
        ),
        loadAnimalsByIds(
          client,
          rows.map((row) => row.requested_animal_id ?? ""),
        ),
      ]);

      return {
        cases: rows.map((row) => mapCaseSummary(row, statuses, animals)),
        total: count ?? 0,
      };
    },

    async listCaseExportRows(input) {
      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("adoption_case")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + input.pageSize - 1);

      if (input.statusId) query = query.eq("status_id", input.statusId);
      if (input.animalType) query = query.eq("animal_type", input.animalType);
      if (input.openOnly) query = query.is("closed_at", null);
      if (input.q) {
        const ids = await searchCaseIds(client, input.q);
        if (ids.length === 0) return [];
        query = query.in("id", ids);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as AdoptionCaseRow[];
      const [statuses, animals] = await Promise.all([
        loadStatusesByIds(
          client,
          rows.map((row) => row.status_id),
        ),
        loadAnimalsByIds(
          client,
          rows.map((row) => row.requested_animal_id ?? ""),
        ),
      ]);

      return rows.map(
        (row): CoordinatorCaseExportRow => ({
          caseId: row.id,
          applicantName: row.applicant_name,
          applicantPhone: row.applicant_phone,
          applicantEmail: row.applicant_email,
          status: statusLabel(requireStatus(statuses, row.status_id)),
          animalType: row.animal_type,
          requestedAnimal: row.requested_animal_id
            ? animalName(animals.get(row.requested_animal_id))
            : null,
          adopterProfileId: row.adopter_profile_id,
          supporterId: row.supporter_id,
          createdAt: row.created_at,
          closedAt: row.closed_at,
        }),
      );
    },

    async getCaseDetail(id) {
      const { data: caseData, error: caseError } = await client
        .from("adoption_case")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (caseError) throw caseError;
      if (!caseData) return null;

      const row = caseData as AdoptionCaseRow;
      const [matchesResult, followupsResult, successResult] = await Promise.all([
        client
          .from("animal_match")
          .select("id,adoption_case_id,animal_id,status_id,is_approved,notes")
          .eq("adoption_case_id", id)
          .order("created_at", { ascending: false }),
        client
          .from("adoption_followup")
          .select(taskSelectColumns)
          .eq("adoption_case_id", id)
          .order("scheduled_at", { ascending: false }),
        client.from("successful_adoption").select("*").eq("adoption_case_id", id).maybeSingle(),
      ]);
      if (matchesResult.error) throw matchesResult.error;
      if (followupsResult.error) throw followupsResult.error;
      if (successResult.error) throw successResult.error;

      const matchRows = (matchesResult.data ?? []) as AnimalMatchRow[];
      const followupRows = (followupsResult.data ?? []) as unknown as FollowupRow[];
      const successRow = (successResult.data ?? null) as SuccessfulAdoptionRow | null;

      const [statuses, animals, taskLinks] = await Promise.all([
        loadStatusesByIds(client, [
          row.status_id,
          ...matchRows.map((match) => match.status_id),
          ...followupRows.map((followup) => followup.status_id),
        ]),
        loadAnimalsByIds(client, [
          row.requested_animal_id ?? "",
          ...matchRows.map((match) => match.animal_id),
        ]),
        loadTaskLinks(client, followupRows),
      ]);

      return {
        ...mapCaseSummary(row, statuses, animals),
        applicantAddress: row.applicant_address,
        housingType: row.housing_type,
        familySize: row.family_size,
        existingPets: row.existing_pets,
        reason: row.reason,
        supporterId: row.supporter_id,
        adopterProfileId: row.adopter_profile_id,
        assessment: row.assessment,
        preferences: row.preferences,
        matches: matchRows.map((match) => mapMatchSummary(match, statuses, animals)),
        followups: followupRows.map((followup) =>
          mapCoordinatorTask(followup, statuses, taskLinks),
        ),
        successfulAdoption: mapSuccessfulAdoption(successRow),
      } satisfies AdoptionCaseDetail;
    },

    async listAdopters(input) {
      return listAdopterSummaries(client, input);
    },

    async listAdopterExportRows(input) {
      const { adopters } = await listAdopterSummaries(client, input);
      return adopters.map(mapAdopterExportRow);
    },

    async getAdopterDetail(id) {
      const { data, error } = await client
        .from("adopter_profile")
        .select(
          "*,supporter:supporter_id(id,name,email,phone),living_area:living_area_id(name_zh,name_en)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const [casesResult, successResult] = await Promise.all([
        client
          .from("adoption_case")
          .select("*")
          .eq("adopter_profile_id", id)
          .order("created_at", { ascending: false }),
        client
          .from("successful_adoption")
          .select("*")
          .eq("adopter_profile_id", id)
          .order("approval_date", { ascending: false }),
      ]);
      if (casesResult.error) throw casesResult.error;
      if (successResult.error) throw successResult.error;

      const caseRows = (casesResult.data ?? []) as AdoptionCaseRow[];
      const taskRows = await loadFollowupsForAdopters(client, [id], caseRows, taskSelectColumns);
      const successRows = (successResult.data ?? []) as SuccessfulAdoptionRow[];
      const [statuses, animals, taskLinks] = await Promise.all([
        loadStatusesByIds(client, [
          ...caseRows.map((row) => row.status_id),
          ...taskRows.map((row) => row.status_id),
        ]),
        loadAnimalsByIds(client, [
          ...caseRows.map((row) => row.requested_animal_id ?? ""),
          ...successRows.map((row) => row.animal_id),
        ]),
        loadTaskLinks(client, taskRows),
      ]);

      const row = data as Record<string, unknown>;
      const supporter = adopterSupporter(row);
      const livingArea = row.living_area as {
        name_zh?: string | null;
        name_en?: string | null;
      } | null;
      const caseAdopterProfiles = caseAdopterProfileMap(caseRows);

      return {
        id,
        supporterId: supporter?.id ?? (row.supporter_id as string | null) ?? null,
        displayName: adopterDisplayName(row),
        email: supporter?.email ?? null,
        phone: supporter?.phone ?? null,
        livingArea: livingArea?.name_zh ?? livingArea?.name_en ?? null,
        isBlacklisted: Boolean(row.is_blacklisted),
        openCaseCount: countOpenCases(caseRows, id),
        successfulAdoptionCount: successRows.length,
        openTaskCount: countOpenTasks(taskRows, id, caseAdopterProfiles),
        latestCaseAt:
          caseRows
            .map((caseRow) => caseRow.created_at)
            .sort()
            .at(-1) ?? null,
        nameEnglish: row.name_english as string | null,
        nameChinese: row.name_chinese as string | null,
        gender: row.gender as string | null,
        birthday: row.birthday as string | null,
        occupation: row.occupation as string | null,
        facebook: row.facebook as string | null,
        householdSize: row.household_size as string | null,
        monthlyHouseholdIncome: row.monthly_household_income as string | null,
        address: row.address as string | null,
        floorArea: row.floor_area as string | null,
        blacklistReason: row.blacklist_reason as string | null,
        cases: caseRows.map((caseRow) => ({
          id: caseRow.id,
          applicantName: caseRow.applicant_name,
          animalType: caseRow.animal_type,
          status: requireStatus(statuses, caseRow.status_id),
          requestedAnimalName: caseRow.requested_animal_id
            ? animalName(animals.get(caseRow.requested_animal_id))
            : null,
          createdAt: caseRow.created_at,
          closedAt: caseRow.closed_at,
        })),
        successfulAdoptions: successRows.map((successRow) => ({
          id: successRow.id,
          caseNumber: successRow.case_number,
          animalId: successRow.animal_id,
          animalName: animals.get(successRow.animal_id)?.name ?? null,
          adoptionFeeCents: successRow.adoption_fee_cents,
          approvalDate: successRow.approval_date,
          pickupDate: successRow.pickup_date,
        })),
        tasks: taskRows.map((taskRow) => mapCoordinatorTask(taskRow, statuses, taskLinks)),
      };
    },

    async createCaseFromPublicApplication(input) {
      const statusId = await loadNewAdoptionCaseStatusId(client);
      const supporter = await ensurePublicApplicationSupporter(client, input);
      await ensureAdopterRole(client, supporter.id);
      const adopterProfile = await ensureAdopterProfile(client, input, supporter.id);

      const { data, error } = await client
        .from("adoption_case")
        .insert({
          public_application_id: input.publicApplicationId,
          status_id: statusId,
          adopter_profile_id: adopterProfile.id,
          supporter_id: supporter.id,
          requested_animal_id: input.requestedAnimalId,
          animal_type: input.animalType,
          applicant_name: input.applicantName,
          applicant_phone: input.applicantPhone,
          applicant_email: input.applicantEmail,
          applicant_address: input.applicantAddress,
          housing_type: input.housingType,
          family_size: input.familySize,
          existing_pets: input.existingPets,
          reason: input.reason,
          preferences: input.preferences,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: (data as { id: string }).id };
    },

    async listSuccessfulAdoptionExportRows(input: CoordinatorExportPage) {
      const from = (input.page - 1) * input.pageSize;
      const { data, error } = await client
        .from("successful_adoption")
        .select("*")
        .order("approval_date", { ascending: false })
        .range(from, from + input.pageSize - 1);
      if (error) throw error;

      const rows = (data ?? []) as SuccessfulAdoptionRow[];
      const animals = await loadAnimalsByIds(
        client,
        rows.map((row) => row.animal_id),
      );

      return rows.map(
        (row): CoordinatorSuccessfulAdoptionExportRow => ({
          successfulAdoptionId: row.id,
          caseId: row.adoption_case_id,
          caseNumber: row.case_number,
          adopterProfileId: row.adopter_profile_id,
          supporterId: row.supporter_id,
          animalId: row.animal_id,
          animalName: animals.get(row.animal_id)?.name ?? null,
          adoptionFeeCents: row.adoption_fee_cents,
          approvalDate: row.approval_date,
          pickupDate: row.pickup_date,
        }),
      );
    },

    async listAnimalExportRows(input: CoordinatorExportPage) {
      const from = (input.page - 1) * input.pageSize;
      const { data: animalData, error: animalError } = await client
        .from("animals")
        .select("id,type,name,name_en,status")
        .order("type", { ascending: true })
        .order("name", { ascending: true })
        .range(from, from + input.pageSize - 1);
      if (animalError) throw animalError;

      const animalRows = (animalData ?? []) as AnimalExportAnimalRow[];
      if (animalRows.length === 0) return [];

      const animalIds = animalRows.map((row) => row.id);
      const { data: profileData, error: profileError } = await client
        .from("animal_profile_internal")
        .select(
          [
            "animal_id",
            "internal_code",
            "arrival_source_id",
            "current_position_id",
            "is_adoptable",
            "is_inside_support_pool",
            "adopted_at",
            "deceased_at",
          ].join(","),
        )
        .in("animal_id", animalIds);
      if (profileError) throw profileError;

      const profileRows = (profileData ?? []) as AnimalInternalProfileRow[];
      const positionIds = unique(profileRows.map((row) => row.current_position_id));
      const sourceIds = unique(profileRows.map((row) => row.arrival_source_id));

      let positionRows: AnimalPositionRow[] = [];
      if (positionIds.length > 0) {
        const { data, error } = await client
          .from("animal_position")
          .select("id,name")
          .in("id", positionIds);
        if (error) throw error;
        positionRows = (data ?? []) as AnimalPositionRow[];
      }

      let sourceRows: ArrivalSourceRow[] = [];
      if (sourceIds.length > 0) {
        const { data, error } = await client
          .from("arrival_source")
          .select("id,name_zh,name_en")
          .in("id", sourceIds);
        if (error) throw error;
        sourceRows = (data ?? []) as ArrivalSourceRow[];
      }

      const profilesByAnimalId = new Map(profileRows.map((row) => [row.animal_id, row]));
      const positionsById = new Map(positionRows.map((row) => [row.id, row]));
      const sourcesById = new Map(sourceRows.map((row) => [row.id, row]));

      return animalRows.map((row): CoordinatorAnimalExportRow => {
        const profile = profilesByAnimalId.get(row.id);
        const position = profile?.current_position_id
          ? positionsById.get(profile.current_position_id)
          : undefined;
        const source = profile?.arrival_source_id
          ? sourcesById.get(profile.arrival_source_id)
          : undefined;

        return {
          animalId: row.id,
          type: row.type,
          name: row.name,
          nameEn: row.name_en,
          status: row.status,
          internalCode: profile?.internal_code ?? null,
          currentPosition: position?.name ?? profile?.current_position_id ?? null,
          arrivalSource: source?.name_zh ?? source?.name_en ?? profile?.arrival_source_id ?? null,
          isAdoptable: profile?.is_adoptable ?? true,
          isInsideSupportPool: profile?.is_inside_support_pool ?? false,
          adoptedAt: profile?.adopted_at ?? null,
          deceasedAt: profile?.deceased_at ?? null,
        };
      });
    },

    async listTasks(input) {
      return listCoordinatorTasks(client, input);
    },

    async listTaskExportRows(input) {
      const { tasks } = await listCoordinatorTasks(client, input);
      return tasks.map(mapTaskExportRow);
    },

    async getTask(id) {
      const { data, error } = await client
        .from("adoption_followup")
        .select(taskSelectColumns)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const row = data as unknown as FollowupRow;
      const [statuses, taskLinks] = await Promise.all([
        loadStatusesByIds(client, [row.status_id]),
        loadTaskLinks(client, [row]),
      ]);
      return mapCoordinatorTask(row, statuses, taskLinks);
    },

    async createTask(input) {
      const { data, error } = await client
        .from("adoption_followup")
        .insert(toTaskInsertPayload(input))
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },

    async updateTask(input) {
      const { data, error } = await client
        .from("adoption_followup")
        .update(toTaskUpdatePayload(input))
        .eq("id", input.taskId)
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },

    async changeCaseStatus(input) {
      const { error } = await client.rpc("change_adoption_case_status", {
        p_case_id: input.caseId,
        p_status_id: input.statusId,
        p_actor_user_id: input.actorUserId,
        p_note: input.note,
        p_closed_at: input.closedAt,
      });
      if (error) throw error;
    },

    async insertAuditLog(input) {
      const { error } = await client.from("audit_log").insert({
        actor_user_id: input.actor_user_id,
        action: input.action,
        entity: input.entity,
        entity_id: input.entity_id,
        timestamp: input.timestamp,
        detail: input.detail,
      });
      if (error) throw error;
    },

    async createMatch(input) {
      const { data, error } = await client
        .from("animal_match")
        .insert({
          adoption_case_id: input.adoptionCaseId,
          animal_id: input.animalId,
          status_id: input.statusId,
          is_approved: input.isApproved,
          notes: input.notes ?? null,
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },

    async createFollowup(input) {
      const { data, error } = await client
        .from("adoption_followup")
        .insert({
          adoption_case_id: input.adoptionCaseId,
          status_id: input.statusId,
          title: input.title,
          scheduled_at: input.scheduledAt ?? null,
          completed_at: input.completedAt ?? null,
          has_window_net: input.hasWindowNet ?? null,
          environment: input.environment ?? null,
          score: input.score ?? null,
          volunteer: input.volunteer ?? null,
          remarks: input.remarks ?? null,
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },

    async finalizeAdoption(input) {
      const { data, error } = await client.rpc("finalize_successful_adoption", {
        p_adoption_case_id: input.adoptionCaseId,
        p_match_id: input.matchId,
        p_outcome_status_id: input.outcomeStatusId,
        p_case_number: input.caseNumber,
        p_adoption_fee_cents: input.adoptionFeeCents ?? null,
        p_approval_date: input.approvalDate,
        p_pickup_date: input.pickupDate ?? null,
        p_approved_by: input.approvedBy,
      });
      if (error) throw error;
      return { id: data as string };
    },
  };
}
