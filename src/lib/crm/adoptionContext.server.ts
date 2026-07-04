import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SupporterAdopterProfileSummary,
  SupporterAdoptionCaseSummary,
  SupporterAdoptionContext,
  SupporterAdoptionFollowupSummary,
  SupporterAdoptionStatusSummary,
  SupporterSuccessfulAdoptionSummary,
} from "./types";

type QueryResult = {
  data: unknown[] | null;
  error: unknown;
};

type AdopterProfileRow = {
  id: string;
  supporter_id: string;
  name_english: string | null;
  name_chinese: string | null;
  birthday: string | null;
  address: string | null;
  household_size: string | null;
  is_blacklisted: boolean | null;
  blacklist_reason: string | null;
  created_at: string;
  updated_at: string;
  supporter: RelatedSupporter | RelatedSupporter[] | null;
  living_area: RelatedLivingArea | RelatedLivingArea[] | null;
};

type RelatedSupporter = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type RelatedLivingArea = {
  name_zh?: string | null;
  name_en?: string | null;
};

type AdoptionCaseRow = {
  id: string;
  supporter_id: string | null;
  adopter_profile_id: string | null;
  status_id: string;
  requested_animal_id: string | null;
  animal_type: string;
  applicant_name: string;
  applicant_phone: string;
  applicant_email: string | null;
  closed_at: string | null;
  created_at: string;
};

type AdoptionFollowupRow = {
  id: string;
  adoption_case_id: string | null;
  adopter_profile_id: string | null;
  status_id: string;
  title: string;
  task_type: string;
  priority: string;
  due_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  volunteer: string | null;
  contact_channel: string | null;
  created_at: string;
  updated_at: string;
};

type SuccessfulAdoptionRow = {
  id: string;
  adoption_case_id: string;
  supporter_id: string;
  adopter_profile_id: string;
  case_number: string;
  animal_id: string;
  adoption_fee_cents: number | null;
  approval_date: string;
  pickup_date: string | null;
};

type CoordinatorStatusRow = {
  id: string;
  key: string;
  label_zh: string;
  label_en: string;
  color: string;
};

type AnimalRow = {
  id: string;
  name: string | null;
  name_en: string | null;
};

const profileSelectColumns = [
  "id",
  "supporter_id",
  "name_english",
  "name_chinese",
  "birthday",
  "address",
  "household_size",
  "is_blacklisted",
  "blacklist_reason",
  "created_at",
  "updated_at",
  "supporter:supporter_id(id,name,email,phone)",
  "living_area:living_area_id(name_zh,name_en)",
].join(",");

const caseSelectColumns = [
  "id",
  "supporter_id",
  "adopter_profile_id",
  "status_id",
  "requested_animal_id",
  "animal_type",
  "applicant_name",
  "applicant_phone",
  "applicant_email",
  "closed_at",
  "created_at",
].join(",");

const followupSelectColumns = [
  "id",
  "adoption_case_id",
  "adopter_profile_id",
  "status_id",
  "title",
  "task_type",
  "priority",
  "due_at",
  "scheduled_at",
  "completed_at",
  "volunteer",
  "contact_channel",
  "created_at",
  "updated_at",
].join(",");

const successfulAdoptionSelectColumns = [
  "id",
  "adoption_case_id",
  "supporter_id",
  "adopter_profile_id",
  "case_number",
  "animal_id",
  "adoption_fee_cents",
  "approval_date",
  "pickup_date",
].join(",");

export const emptySupporterAdoptionContext: SupporterAdoptionContext = {
  profiles: [],
  cases: [],
  followups: [],
  successfulAdoptions: [],
};

async function queryRows<T>(query: PromiseLike<QueryResult>) {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function dedupeById<T extends { id: string }>(rows: T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function byNewestDate<T>(dateKey: keyof T) {
  return (left: T, right: T) =>
    String(right[dateKey] ?? "").localeCompare(String(left[dateKey] ?? ""));
}

function animalName(row: AnimalRow | undefined) {
  return row?.name ?? row?.name_en ?? null;
}

function profileDisplayName(row: AdopterProfileRow) {
  const names = [row.name_chinese, row.name_english].filter(Boolean);
  if (names.length > 0) return names.join(" / ");
  return firstRelated(row.supporter)?.name ?? row.id;
}

function fallbackStatus(): SupporterAdoptionStatusSummary {
  return {
    key: "unknown",
    labelZh: "未知",
    labelEn: "Unknown",
    color: "slate",
  };
}

function statusSummary(statuses: Map<string, SupporterAdoptionStatusSummary>, statusId: string) {
  return statuses.get(statusId) ?? fallbackStatus();
}

function mapStatus(row: CoordinatorStatusRow): SupporterAdoptionStatusSummary {
  return {
    key: row.key,
    labelZh: row.label_zh,
    labelEn: row.label_en,
    color: row.color,
  };
}

function mapProfile(row: AdopterProfileRow): SupporterAdopterProfileSummary {
  const supporter = firstRelated(row.supporter);
  const livingArea = firstRelated(row.living_area);

  return {
    id: row.id,
    displayName: profileDisplayName(row),
    email: supporter?.email ?? null,
    phone: supporter?.phone ?? null,
    livingArea: livingArea?.name_zh ?? livingArea?.name_en ?? null,
    isBlacklisted: Boolean(row.is_blacklisted),
    birthday: row.birthday,
    address: row.address,
    householdSize: row.household_size,
    blacklistReason: row.blacklist_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCase(
  row: AdoptionCaseRow,
  statuses: Map<string, SupporterAdoptionStatusSummary>,
  animals: Map<string, AnimalRow>,
): SupporterAdoptionCaseSummary {
  return {
    id: row.id,
    adopterProfileId: row.adopter_profile_id,
    applicantName: row.applicant_name,
    animalType: row.animal_type,
    status: statusSummary(statuses, row.status_id),
    requestedAnimalName: row.requested_animal_id
      ? animalName(animals.get(row.requested_animal_id))
      : null,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

function priority(value: string): SupporterAdoptionFollowupSummary["priority"] {
  if (value === "low" || value === "normal" || value === "high" || value === "urgent") {
    return value;
  }
  return "normal";
}

function contactChannel(value: string | null): SupporterAdoptionFollowupSummary["contactChannel"] {
  if (
    value === "phone" ||
    value === "whatsapp" ||
    value === "email" ||
    value === "in_person" ||
    value === "internal"
  ) {
    return value;
  }
  return null;
}

function mapFollowup(
  row: AdoptionFollowupRow,
  statuses: Map<string, SupporterAdoptionStatusSummary>,
): SupporterAdoptionFollowupSummary {
  return {
    id: row.id,
    adoptionCaseId: row.adoption_case_id,
    adopterProfileId: row.adopter_profile_id,
    title: row.title,
    taskType: row.task_type,
    status: statusSummary(statuses, row.status_id),
    priority: priority(row.priority),
    dueAt: row.due_at,
    scheduledAt: row.scheduled_at,
    completedAt: row.completed_at,
    volunteer: row.volunteer,
    contactChannel: contactChannel(row.contact_channel),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSuccessfulAdoption(
  row: SuccessfulAdoptionRow,
  animals: Map<string, AnimalRow>,
): SupporterSuccessfulAdoptionSummary {
  return {
    id: row.id,
    adoptionCaseId: row.adoption_case_id,
    adopterProfileId: row.adopter_profile_id,
    supporterId: row.supporter_id,
    caseNumber: row.case_number,
    animalId: row.animal_id,
    animalName: animalName(animals.get(row.animal_id)),
    adoptionFeeCents: row.adoption_fee_cents,
    approvalDate: row.approval_date,
    pickupDate: row.pickup_date,
  };
}

async function loadById<T extends { id: string }>(
  client: SupabaseClient,
  table: string,
  selectColumns: string,
  ids: Array<string | null | undefined>,
) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, T>();

  const rows = await queryRows<T>(client.from(table).select(selectColumns).in("id", uniqueIds));
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadRowsByColumn<T>(
  client: SupabaseClient,
  table: string,
  selectColumns: string,
  column: string,
  ids: Array<string | null | undefined>,
  orderColumn?: string,
) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return [];

  let query = client.from(table).select(selectColumns).in(column, uniqueIds);
  if (orderColumn) query = query.order(orderColumn, { ascending: false });
  return queryRows<T>(query);
}

async function loadStatuses(
  client: SupabaseClient,
  rows: Array<AdoptionCaseRow | AdoptionFollowupRow>,
) {
  const statuses = await loadById<CoordinatorStatusRow>(
    client,
    "coordinator_status",
    "id,key,label_zh,label_en,color",
    rows.map((row) => row.status_id),
  );

  return new Map([...statuses].map(([id, row]) => [id, mapStatus(row)]));
}

async function loadAnimals(
  client: SupabaseClient,
  cases: AdoptionCaseRow[],
  successfulAdoptions: SuccessfulAdoptionRow[],
) {
  return loadById<AnimalRow>(client, "animals", "id,name,name_en", [
    ...cases.map((row) => row.requested_animal_id),
    ...successfulAdoptions.map((row) => row.animal_id),
  ]);
}

export async function loadSupporterAdoptionContext(
  client: SupabaseClient,
  supporterId: string,
): Promise<SupporterAdoptionContext> {
  const profiles = await queryRows<AdopterProfileRow>(
    client
      .from("adopter_profile")
      .select(profileSelectColumns)
      .eq("supporter_id", supporterId)
      .order("created_at", { ascending: false }),
  );
  const profileIds = profiles.map((row) => row.id);

  const cases = dedupeById([
    ...(await queryRows<AdoptionCaseRow>(
      client
        .from("adoption_case")
        .select(caseSelectColumns)
        .eq("supporter_id", supporterId)
        .order("created_at", { ascending: false }),
    )),
    ...(await loadRowsByColumn<AdoptionCaseRow>(
      client,
      "adoption_case",
      caseSelectColumns,
      "adopter_profile_id",
      profileIds,
      "created_at",
    )),
  ]).sort(byNewestDate("created_at"));
  const caseIds = cases.map((row) => row.id);

  const followups = dedupeById([
    ...(await loadRowsByColumn<AdoptionFollowupRow>(
      client,
      "adoption_followup",
      followupSelectColumns,
      "adoption_case_id",
      caseIds,
      "created_at",
    )),
    ...(await loadRowsByColumn<AdoptionFollowupRow>(
      client,
      "adoption_followup",
      followupSelectColumns,
      "adopter_profile_id",
      profileIds,
      "created_at",
    )),
  ]).sort(byNewestDate("created_at"));

  const successfulAdoptions = dedupeById([
    ...(await queryRows<SuccessfulAdoptionRow>(
      client
        .from("successful_adoption")
        .select(successfulAdoptionSelectColumns)
        .eq("supporter_id", supporterId)
        .order("approval_date", { ascending: false }),
    )),
    ...(await loadRowsByColumn<SuccessfulAdoptionRow>(
      client,
      "successful_adoption",
      successfulAdoptionSelectColumns,
      "adopter_profile_id",
      profileIds,
      "approval_date",
    )),
  ]).sort(byNewestDate("approval_date"));

  const [statuses, animals] = await Promise.all([
    loadStatuses(client, [...cases, ...followups]),
    loadAnimals(client, cases, successfulAdoptions),
  ]);

  return {
    profiles: profiles.map(mapProfile),
    cases: cases.map((row) => mapCase(row, statuses, animals)),
    followups: followups.map((row) => mapFollowup(row, statuses)),
    successfulAdoptions: successfulAdoptions.map((row) => mapSuccessfulAdoption(row, animals)),
  };
}
