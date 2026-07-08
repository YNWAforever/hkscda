import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createSupabaseAdoptionCoordinatorRepository,
  hongKongDayBounds,
} from "./repository.server";
import type { CaseFromPublicApplicationInput } from "./service";

const statusId = "33333333-4444-4333-8444-555555555555";
const createdSupporterId = "11111111-2222-4333-8444-555555555555";
const existingSupporterId = "22222222-3333-4333-8444-555555555555";
const createdProfileId = "44444444-5555-4333-8444-555555555555";
const existingProfileId = "55555555-6666-4333-8444-555555555555";
const adoptionCaseId = "66666666-7777-4333-8444-555555555555";
const publicApplicationId = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const animalId = "77777777-8888-4333-8444-555555555555";
const followupId = "aaaaaaaa-bbbb-4333-8444-555555555555";
const linkedSupporterId = "supporter-1";
const existingCaseId = adoptionCaseId;
const existingTaskId = followupId;
const secondProfileId = "bbbbbbbb-cccc-4333-8444-555555555555";
const secondSupporterId = "supporter-2";
const secondCaseId = "cccccccc-dddd-4333-8444-555555555555";
const caseLinkedTaskId = "dddddddd-eeee-4333-8444-555555555555";
const unknownProfileId = "eeeeeeee-ffff-4333-8444-555555555555";
const animalPositionId = "12345678-aaaa-4333-8444-555555555555";
const arrivalSourceId = "87654321-bbbb-4333-8444-555555555555";

const statusRow = {
  id: statusId,
  category: "followup",
  key: "scheduled",
  label_zh: "已安排",
  label_en: "Scheduled",
  sort_order: 20,
  color: "coral",
  is_active: true,
  is_system: true,
  is_closing: false,
  is_final: false,
};

type QueryCall = {
  table: string;
  method: string;
  payload?: unknown;
  options?: unknown;
  schema?: string;
};

type SummaryCounts = {
  publicIntakeCases: number;
  manualIntakeCases: number;
  successfulAdoptions: number;
  openCases: number;
  overdueTasks: number;
  exportsRun: number;
};

type FakeState = {
  calls: QueryCall[];
  existingSupporter: { id: string } | null;
  existingProfile: Record<string, unknown> | null;
  supporterRows: Record<string, unknown>[];
  auditRows: Record<string, unknown>[];
  rpcResult: Record<string, unknown> | null;
  summaryCounts: SummaryCounts;
  followupRow: Record<string, unknown> | null;
  followupRows: Record<string, unknown>[];
  caseRows: Record<string, unknown>[];
  taskCaseRows: Record<string, unknown>[];
  adopterRows: Record<string, unknown>[];
  consentRows: Record<string, unknown>[];
  animalRows: Record<string, unknown>[];
  internalProfileRows: Record<string, unknown>[];
  animalPositionRows: Record<string, unknown>[];
  arrivalSourceRows: Record<string, unknown>[];
  caseDetailRow: Record<string, unknown> | null;
  matchRows: Record<string, unknown>[];
  successRow: Record<string, unknown> | null;
  successRows: Record<string, unknown>[];
  publicDetailRow: Record<string, unknown> | null;
  preferenceRows: Record<string, unknown>[];
  visitPreferenceRow: Record<string, unknown> | null;
  photoRows: Record<string, unknown>[];
  statusTokenRows: Record<string, unknown>[];
  intakeRows: Record<string, unknown>[];
};

class FakeQuery {
  private action: "select" | "insert" | "upsert" | "update" | null = null;
  private mutationPayload: unknown;
  private selectedColumns: string | null = null;
  private selectedOptions: { count?: string; head?: boolean } | null = null;
  private eqFilters: Array<{ column: string; value: unknown }> = [];
  private inFilters: Array<{ column: string; value: unknown[] }> = [];
  private isFilters: Array<{ column: string; value: unknown }> = [];
  private notFilters: Array<{ column: string; operator: string; value: unknown }> = [];
  private gteFilters: Array<{ column: string; value: unknown }> = [];
  private ltFilters: Array<{ column: string; value: unknown }> = [];
  private orFilters: string[] = [];
  private rangeBounds: { from: number; to: number } | null = null;

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  select(columns: string, options?: unknown) {
    this.state.calls.push({ table: this.table, method: "select", payload: columns, options });
    if (!this.action) this.action = "select";
    this.selectedColumns = columns;
    this.selectedOptions = (options as { count?: string; head?: boolean } | undefined) ?? null;
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "eq", payload: { column, value } });
    this.eqFilters.push({ column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "is", payload: { column, value } });
    this.isFilters.push({ column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "not", payload: { column, operator, value } });
    this.notFilters.push({ column, operator, value });
    return this;
  }

  in(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "in", payload: { column, value } });
    if (!Array.isArray(value)) {
      throw new Error("FakeQuery.in expected an array value");
    }
    this.inFilters.push({ column, value });
    return this;
  }

  ilike(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "ilike", payload: { column, value } });
    return this;
  }

  or(filters: string, options?: unknown) {
    this.state.calls.push({ table: this.table, method: "or", payload: filters, options });
    this.orFilters.push(filters);
    return this;
  }

  gte(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "gte", payload: { column, value } });
    this.gteFilters.push({ column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "lt", payload: { column, value } });
    this.ltFilters.push({ column, value });
    return this;
  }

  order(column: string, options?: unknown) {
    this.state.calls.push({ table: this.table, method: "order", payload: column, options });
    return this;
  }

  range(from: number, to: number) {
    this.state.calls.push({ table: this.table, method: "range", payload: { from, to } });
    this.rangeBounds = { from, to };
    return this;
  }

  limit(count: number) {
    this.state.calls.push({ table: this.table, method: "limit", payload: count });
    this.rangeBounds = { from: 0, to: count - 1 };
    return this;
  }

  insert(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "insert", payload });
    this.action = "insert";
    this.mutationPayload = payload;
    return this;
  }

  upsert(payload: unknown, options?: unknown) {
    this.state.calls.push({ table: this.table, method: "upsert", payload, options });
    this.action = "upsert";
    this.mutationPayload = payload;
    return this;
  }

  update(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "update", payload });
    this.action = "update";
    this.mutationPayload = payload;
    return this;
  }

  async maybeSingle() {
    this.state.calls.push({ table: this.table, method: "maybeSingle" });
    return this.executeMaybeSingle();
  }

  async single() {
    this.state.calls.push({ table: this.table, method: "single" });
    return this.executeSingle();
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private executeMaybeSingle() {
    if (this.table === "coordinator_status") return { data: { id: statusId }, error: null };
    if (this.table === "supporter") return { data: this.state.existingSupporter, error: null };
    if (this.table === "adopter_profile") {
      const rows =
        this.state.adopterRows.length > 0
          ? this.state.adopterRows
          : this.state.existingProfile
            ? [this.state.existingProfile]
            : [];
      return { data: this.applyFilters(rows)[0] ?? null, error: null };
    }
    if (this.table === "adoption_followup") return { data: this.state.followupRow, error: null };
    if (this.table === "adoption_case") return { data: this.state.caseDetailRow, error: null };
    if (this.table === "successful_adoption") return { data: this.state.successRow, error: null };
    if (this.table === "adoption_application_detail") {
      return { data: this.state.publicDetailRow, error: null };
    }
    if (this.table === "adoption_application_visit_preference") {
      return { data: this.state.visitPreferenceRow, error: null };
    }
    if (this.table === "public_status_token") {
      return { data: this.applyFilters(this.state.statusTokenRows)[0] ?? null, error: null };
    }
    if (this.table === "audit_log") {
      return { data: this.applyFilters(this.state.auditRows)[0] ?? null, error: null };
    }
    return { data: null, error: null };
  }

  private executeSingle() {
    if (this.table === "supporter") return { data: { id: createdSupporterId }, error: null };
    if (this.table === "adopter_profile") return { data: { id: createdProfileId }, error: null };
    if (this.table === "adoption_case") return { data: { id: adoptionCaseId }, error: null };
    if (this.table === "adoption_followup") return { data: { id: followupId }, error: null };
    return { data: this.mutationPayload, error: null };
  }

  private execute() {
    if (this.table === "supporter_role") return { error: null };
    if (this.action === "select") return this.executeSelect();
    return { data: this.mutationPayload, error: null };
  }

  private executeSelect() {
    if (this.selectedOptions?.head) return this.headCount();
    if (this.table === "coordinator_status") return this.collection([statusRow]);
    if (this.table === "adoption_followup") return this.collection(this.state.followupRows);
    if (this.table === "adoption_case") {
      if (this.selectedColumns === "id,applicant_name,animal_type") {
        return this.collection(this.state.taskCaseRows);
      }
      return this.collection(this.state.caseRows);
    }
    if (this.table === "supporter") return this.collection(this.state.supporterRows);
    if (this.table === "consent") return this.collection(this.state.consentRows);
    if (this.table === "adopter_profile") return this.collection(this.state.adopterRows);
    if (this.table === "animals") return this.collection(this.state.animalRows);
    if (this.table === "animal_profile_internal") {
      return this.collection(this.state.internalProfileRows);
    }
    if (this.table === "animal_position") return this.collection(this.state.animalPositionRows);
    if (this.table === "arrival_source") return this.collection(this.state.arrivalSourceRows);
    if (this.table === "animal_match") return this.collection(this.state.matchRows);
    if (this.table === "successful_adoption") return this.collection(this.state.successRows);
    if (this.table === "audit_log") return this.collection(this.state.auditRows);
    if (this.table === "adoption_application_animal_preference") {
      return this.collection(this.state.preferenceRows);
    }
    if (this.table === "adoption_application_photo") return this.collection(this.state.photoRows);
    if (this.table === "public_status_token") return this.collection(this.state.statusTokenRows);
    if (this.table === "adoption_intake_item") return this.collection(this.state.intakeRows);
    return this.executeMaybeSingle();
  }

  private headCount() {
    return { data: null, error: null, count: this.summaryCount() };
  }

  private hasEq(column: string, value: unknown) {
    return this.eqFilters.some((filter) => filter.column === column && filter.value === value);
  }

  private hasIs(column: string, value: unknown) {
    return this.isFilters.some((filter) => filter.column === column && filter.value === value);
  }

  private summaryCount() {
    const rows = this.rowsForCount();
    if (rows.length > 0) return this.applyFilters(rows).length;

    if (this.table === "adoption_case") {
      if (this.hasEq("source", "public_form")) return this.state.summaryCounts.publicIntakeCases;
      if (this.hasEq("source", "manual_intake")) return this.state.summaryCounts.manualIntakeCases;
      if (this.hasIs("closed_at", null)) return this.state.summaryCounts.openCases;
    }
    if (this.table === "successful_adoption") return this.state.summaryCounts.successfulAdoptions;
    if (this.table === "adoption_followup") return this.state.summaryCounts.overdueTasks;
    if (this.table === "audit_log") return this.state.summaryCounts.exportsRun;
    return this.applyFilters([]).length;
  }

  private rowsForCount() {
    if (this.table === "adoption_case") return this.state.caseRows;
    if (this.table === "successful_adoption") return this.state.successRows;
    if (this.table === "adoption_followup") return this.state.followupRows;
    if (this.table === "audit_log") return this.state.auditRows;
    if (this.table === "adoption_intake_item") return this.state.intakeRows;
    return [];
  }

  private collection(rows: Record<string, unknown>[]) {
    const filtered = this.applyFilters(rows);
    const count = filtered.length;
    const ranged = this.rangeBounds
      ? filtered.slice(this.rangeBounds.from, this.rangeBounds.to + 1)
      : filtered;
    return { data: ranged, error: null, count };
  }

  private applyFilters(rows: Record<string, unknown>[]) {
    return rows
      .filter((row) =>
        this.eqFilters.every((filter) => fieldValue(row, filter.column) === filter.value),
      )
      .filter((row) => this.inFilters.every((filter) => filter.value.includes(row[filter.column])))
      .filter((row) =>
        this.isFilters.every((filter) => fieldValue(row, filter.column) === filter.value),
      )
      .filter((row) =>
        this.gteFilters.every((filter) => compareField(row, filter.column, filter.value) >= 0),
      )
      .filter((row) =>
        this.ltFilters.every((filter) => compareField(row, filter.column, filter.value) < 0),
      )
      .filter((row) => this.orFilters.every((filter) => matchesOrFilter(row, filter)))
      .filter((row) => this.notFilters.every((filter) => matchesNotFilter(row, filter)));
  }
}

function fieldValue(row: Record<string, unknown>, column: string) {
  if (column.startsWith("detail->>")) {
    const detailKey = column.slice("detail->>".length);
    const detail = row.detail as Record<string, unknown> | null | undefined;
    return detail?.[detailKey];
  }
  return row[column];
}

function compareField(row: Record<string, unknown>, column: string, value: unknown) {
  const actual = fieldValue(row, column);
  if (actual === null || actual === undefined) return -1;
  if (typeof actual === "number" && typeof value === "number") return actual - value;
  return String(actual).localeCompare(String(value));
}

function matchesLike(value: unknown, pattern: string) {
  if (value === null || value === undefined) return false;
  const needle = pattern
    .replace(/^%/, "")
    .replace(/%$/, "")
    .replaceAll("\\%", "%")
    .replaceAll("\\_", "_")
    .toLowerCase();
  return String(value).toLowerCase().includes(needle);
}

function matchesOrFilter(row: Record<string, unknown>, filter: string) {
  return filter.split(",").some((part) => {
    const [column, pattern] = part.split(".ilike.");
    if (!column || !pattern || column.includes(".")) return false;
    return matchesLike(row[column], pattern);
  });
}

function matchesNotFilter(
  row: Record<string, unknown>,
  filter: { column: string; operator: string; value: unknown },
) {
  if (filter.operator === "in" && typeof filter.value === "string") {
    const ids = filter.value.replace(/^\(/, "").replace(/\)$/, "").split(",").filter(Boolean);
    return !ids.includes(String(row[filter.column]));
  }
  if (filter.operator === "is" && filter.value === null) {
    return fieldValue(row, filter.column) !== null;
  }
  return true;
}

function createFakeClient(
  options: {
    existingSupporter?: { id: string } | null;
    existingProfile?: Record<string, unknown> | null;
    supporterRows?: Record<string, unknown>[];
    auditRows?: Record<string, unknown>[];
    rpcResult?: Record<string, unknown> | null;
    summaryCounts?: Partial<SummaryCounts>;
    followupRow?: Record<string, unknown> | null;
    followupRows?: Record<string, unknown>[];
    caseRows?: Record<string, unknown>[];
    taskCaseRows?: Record<string, unknown>[];
    adopterRows?: Record<string, unknown>[];
    consentRows?: Record<string, unknown>[];
    animalRows?: Record<string, unknown>[];
    internalProfileRows?: Record<string, unknown>[];
    animalPositionRows?: Record<string, unknown>[];
    arrivalSourceRows?: Record<string, unknown>[];
    caseDetailRow?: Record<string, unknown> | null;
    matchRows?: Record<string, unknown>[];
    successRow?: Record<string, unknown> | null;
    successRows?: Record<string, unknown>[];
    publicDetailRow?: Record<string, unknown> | null;
    preferenceRows?: Record<string, unknown>[];
    visitPreferenceRow?: Record<string, unknown> | null;
    photoRows?: Record<string, unknown>[];
    statusTokenRows?: Record<string, unknown>[];
    intakeRows?: Record<string, unknown>[];
  } = {},
) {
  const state: FakeState = {
    calls: [],
    existingSupporter: options.existingSupporter ?? null,
    existingProfile: options.existingProfile ?? null,
    supporterRows: options.supporterRows ?? [],
    auditRows: options.auditRows ?? [],
    rpcResult: options.rpcResult ?? null,
    summaryCounts: {
      publicIntakeCases: 0,
      manualIntakeCases: 0,
      successfulAdoptions: 0,
      openCases: 0,
      overdueTasks: 0,
      exportsRun: 0,
      ...options.summaryCounts,
    },
    followupRow: options.followupRow ?? null,
    followupRows: options.followupRows ?? [],
    caseRows: options.caseRows ?? [],
    taskCaseRows: options.taskCaseRows ?? [],
    adopterRows: options.adopterRows ?? [],
    consentRows: options.consentRows ?? [],
    animalRows: options.animalRows ?? [],
    internalProfileRows: options.internalProfileRows ?? [],
    animalPositionRows: options.animalPositionRows ?? [],
    arrivalSourceRows: options.arrivalSourceRows ?? [],
    caseDetailRow: options.caseDetailRow ?? null,
    matchRows: options.matchRows ?? [],
    successRow: options.successRow ?? null,
    successRows: options.successRows ?? [],
    publicDetailRow: options.publicDetailRow ?? null,
    preferenceRows: options.preferenceRows ?? [],
    visitPreferenceRow: options.visitPreferenceRow ?? null,
    photoRows: options.photoRows ?? [],
    statusTokenRows: options.statusTokenRows ?? [],
    intakeRows: options.intakeRows ?? [],
  };

  const client = {
    from(table: string) {
      state.calls.push({ table, method: "from" });
      return new FakeQuery(state, table);
    },
    rpc(functionName: string, payload: unknown) {
      state.calls.push({ table: "rpc", method: functionName, payload });
      return Promise.resolve({ data: state.rpcResult, error: null });
    },
    schema(schemaName: string) {
      return {
        rpc(functionName: string, payload: unknown) {
          state.calls.push({ table: "rpc", method: functionName, payload, schema: schemaName });
          return Promise.resolve({ data: state.rpcResult, error: null });
        },
      };
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    calls: state.calls,
  };
}

function setupRepository(options: Parameters<typeof createFakeClient>[0] = {}) {
  const { client, calls } = createFakeClient(options);
  return {
    repo: createSupabaseAdoptionCoordinatorRepository(client),
    calls,
  };
}

function publicCaseInput(overrides: Partial<CaseFromPublicApplicationInput> = {}) {
  return {
    publicApplicationId,
    requestedAnimalId: animalId,
    animalType: "cat",
    applicantName: "Ada",
    applicantPhone: "9123 4567",
    applicantEmail: "ada@example.com",
    applicantAddress: "HK Island",
    housingType: "私人樓宇",
    familySize: 3,
    existingPets: null,
    reason: "I can provide a safe home.",
    preferences: {
      animalName: "Mochi",
      language: "en",
      rankedAnimals: [{ animalName: "Mochi", rank: 1 }],
    },
    ...overrides,
  } satisfies CaseFromPublicApplicationInput;
}

function followupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: followupId,
    adoption_case_id: adoptionCaseId,
    adopter_profile_id: existingProfileId,
    animal_id: animalId,
    status_id: statusId,
    title: "Post-adoption call",
    task_type: "followup",
    priority: "high",
    due_at: "2026-06-26T10:00:00.000Z",
    scheduled_at: null,
    completed_at: null,
    assigned_to: "Ada",
    volunteer: null,
    contact_channel: null,
    outcome: "Left message",
    next_step_at: null,
    remarks: "Needs another call",
    has_window_net: null,
    environment: null,
    score: null,
    created_at: "2026-06-27T08:00:00.000Z",
    updated_at: "2026-06-27T08:00:00.000Z",
    ...overrides,
  };
}

function taskCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: adoptionCaseId,
    applicant_name: "Ada",
    animal_type: "cat",
    ...overrides,
  };
}

function adopterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: existingProfileId,
    supporter_id: linkedSupporterId,
    name_english: "Ada",
    name_chinese: null,
    gender: null,
    birthday: null,
    occupation: null,
    facebook: null,
    household_size: null,
    monthly_household_income: null,
    address: null,
    floor_area: null,
    is_blacklisted: false,
    blacklist_reason: null,
    supporter: { name: "Ada" },
    living_area: null,
    ...overrides,
  };
}

function animalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: animalId,
    name: "Mochi",
    name_en: "Mochi",
    type: "cat",
    status: "available",
    ...overrides,
  };
}

function caseDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: adoptionCaseId,
    status_id: statusId,
    requested_animal_id: animalId,
    animal_type: "cat",
    applicant_name: "Ada",
    applicant_phone: "9123 4567",
    applicant_email: "ada@example.com",
    applicant_address: "HK Island",
    housing_type: "私人樓宇",
    family_size: 3,
    existing_pets: null,
    reason: "I can provide a safe home.",
    public_application_id: publicApplicationId,
    supporter_id: linkedSupporterId,
    adopter_profile_id: existingProfileId,
    assessment: {},
    preferences: {},
    closed_at: null,
    created_at: "2026-06-27T08:00:00.000Z",
    ...overrides,
  };
}

function caseRow(overrides: Record<string, unknown> = {}) {
  return caseDetailRow(overrides);
}

function successfulAdoptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "successful-adoption-1",
    adoption_case_id: adoptionCaseId,
    animal_id: animalId,
    supporter_id: existingSupporterId,
    adopter_profile_id: existingProfileId,
    case_number: "AC-2026-001",
    adoption_fee_cents: 80000,
    approval_date: "2026-06-28",
    pickup_date: null,
    ...overrides,
  };
}

function publicDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "public-detail-1",
    public_application_id: publicApplicationId,
    language: "zh-HK",
    preferred_contact_method: "whatsapp",
    terms_version: "2026-06",
    questionnaire: {
      contact: { applicantName: "Ada" },
      home: { windowDoorSafety: "Installed" },
      readiness: { monthlyBudgetHkd: 1000 },
    },
    ...overrides,
  };
}

function animalPreferenceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "preference-1",
    public_application_id: publicApplicationId,
    rank: 1,
    animal_id: animalId,
    animal_name_snapshot: "Mochi",
    animal_type_snapshot: "cat",
    ...overrides,
  };
}

function visitPreferenceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "visit-1",
    public_application_id: publicApplicationId,
    date_range_start: "2026-07-05",
    date_range_end: "2026-07-07",
    preferred_time_windows: ["weekday_evening"],
    notes: "After work",
    ...overrides,
  };
}

function photoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    public_application_id: publicApplicationId,
    storage_bucket: "adoption-application-photos",
    storage_path: `${publicApplicationId}/home/home.jpg`,
    file_name: "home.jpg",
    mime_type: "image/jpeg",
    size_bytes: 123456,
    photo_category: "home",
    uploaded_at: "2026-06-27T08:05:00.000Z",
    ...overrides,
  };
}

function statusTokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "status-token-1",
    entity_type: "adoption_application",
    entity_id: publicApplicationId,
    expires_at: "2026-07-04T08:00:00.000Z",
    revoked_at: null,
    last_viewed_at: "2026-06-28T08:00:00.000Z",
    created_at: "2026-06-27T08:00:00.000Z",
    ...overrides,
  };
}

function intakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "intake-1",
    public_application_id: publicApplicationId,
    adoption_case_id: adoptionCaseId,
    lane: "photos_to_review",
    urgency: "high",
    summary: {
      applicantName: "Ada",
      rankedAnimals: [{ rank: 1, animalName: "Mochi", animalType: "cat" }],
      photoCount: 2,
    },
    due_at: "2026-06-28T08:00:00.000Z",
    resolved_at: null,
    created_at: "2026-06-27T08:00:00.000Z",
    ...overrides,
  };
}

function callsFor(calls: QueryCall[], table: string, method: string) {
  return calls.filter((call) => call.table === table && call.method === method);
}

function callPayloads(calls: QueryCall[], table: string, method: string) {
  return callsFor(calls, table, method).map((call) => call.payload);
}

function caseInsertPayload(calls: QueryCall[]) {
  return calls.find((call) => call.table === "adoption_case" && call.method === "insert")?.payload;
}

async function withFixedDate<T>(iso: string, run: () => Promise<T>) {
  const RealDate = globalThis.Date;
  const fixedTime = new RealDate(iso).getTime();

  class FixedDate extends RealDate {
    constructor(value?: string | number | Date) {
      super(value ?? fixedTime);
    }

    static now() {
      return fixedTime;
    }
  }

  globalThis.Date = FixedDate as DateConstructor;
  try {
    return await run();
  } finally {
    globalThis.Date = RealDate;
  }
}

describe("createSupabaseAdoptionCoordinatorRepository", () => {
  test("fake Supabase rejects malformed in filters", () => {
    const { client } = createFakeClient();

    expect(() =>
      client
        .from("animals")
        .select("id")
        .in("id", "not-an-array" as never),
    ).toThrow("FakeQuery.in expected an array value");
  });

  test("computes Hong Kong day bounds across local midnight", () => {
    expect(hongKongDayBounds(new Date("2026-06-27T15:59:59.000Z"))).toEqual({
      start: "2026-06-26T16:00:00.000Z",
      end: "2026-06-27T16:00:00.000Z",
    });
    expect(hongKongDayBounds(new Date("2026-06-27T16:00:00.000Z"))).toEqual({
      start: "2026-06-27T16:00:00.000Z",
      end: "2026-06-28T16:00:00.000Z",
    });
  });

  test("searches manual intake identity candidates across adopters and supporters", async () => {
    const { repo, calls } = setupRepository({
      adopterRows: [
        adopterRow({
          supporter: {
            id: existingSupporterId,
            name: "Ada",
            email: "ada@example.test",
            phone: "61234567",
          },
        }),
      ],
      supporterRows: [
        { id: secondSupporterId, name: "Ben", email: "ben@example.test", phone: "69876543" },
      ],
    });

    const result = await repo.searchManualCaseIdentity({
      q: "Ada",
      page: 1,
      pageSize: 10,
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "adopter",
        adopterProfileId: existingProfileId,
        displayName: "Ada",
      }),
    ]);
    expect(callsFor(calls, "adopter_profile", "or")).toHaveLength(1);
    expect(callsFor(calls, "supporter", "or")).toHaveLength(1);
  });

  test("creates manual cases through the transactional RPC", async () => {
    const { repo, calls } = setupRepository({
      rpcResult: {
        caseId: adoptionCaseId,
        supporterId: existingSupporterId,
        adopterProfileId: existingProfileId,
        taskId: followupId,
      },
    });

    await expect(
      repo.createManualCase({
        actorUserId: createdSupporterId,
        identity: { kind: "existing_adopter", adopterProfileId: existingProfileId },
        case: {
          source: "manual_intake",
          initialStatusId: statusId,
          animalType: "cat",
          applicantName: "Ada",
          applicantPhone: "9123 4567",
          preferences: {},
        },
        initialTask: {
          statusId,
          title: "Call back",
          taskType: "followup",
          priority: "normal",
        },
      }),
    ).resolves.toEqual({
      caseId: adoptionCaseId,
      supporterId: existingSupporterId,
      adopterProfileId: existingProfileId,
      taskId: followupId,
    });

    expect(calls).toContainEqual({
      table: "rpc",
      method: "create_manual_adoption_case",
      schema: "private",
      payload: expect.objectContaining({
        p_actor_user_id: createdSupporterId,
      }),
    });
  });

  test("lists open intake items by lane", async () => {
    const { repo, calls } = setupRepository({
      intakeRows: [
        intakeRow(),
        intakeRow({
          id: "intake-2",
          lane: "new_adoption_application",
          resolved_at: null,
        }),
        intakeRow({
          id: "intake-3",
          lane: "photos_to_review",
          resolved_at: "2026-06-29T08:00:00.000Z",
        }),
      ],
    });

    await expect(
      repo.listIntakeItems({ lane: "photos_to_review", openOnly: true }),
    ).resolves.toEqual({
      items: [
        {
          id: "intake-1",
          publicApplicationId,
          adoptionCaseId,
          lane: "photos_to_review",
          urgency: "high",
          dueAt: "2026-06-28T08:00:00.000Z",
          createdAt: "2026-06-27T08:00:00.000Z",
          resolvedAt: null,
          summary: {
            applicantName: "Ada",
            rankedAnimals: [{ rank: 1, animalName: "Mochi", animalType: "cat" }],
            photoCount: 2,
          },
        },
      ],
    });

    expect(calls).toContainEqual({
      table: "adoption_intake_item",
      method: "eq",
      payload: { column: "lane", value: "photos_to_review" },
    });
    expect(calls).toContainEqual({
      table: "adoption_intake_item",
      method: "is",
      payload: { column: "resolved_at", value: null },
    });
    expect(calls).toContainEqual({
      table: "adoption_intake_item",
      method: "range",
      payload: { from: 0, to: 99 },
    });
  });

  test("lists coordinator export history from audit log details", async () => {
    const { repo } = setupRepository({
      auditRows: [
        {
          id: "aaaaaaaa-bbbb-4333-8444-555555555555",
          actor_user_id: createdSupporterId,
          action: "coordinator_export.cases",
          entity: "coordinator_export",
          entity_id: "cases",
          timestamp: "2026-06-28T01:00:00.000Z",
          detail: {
            kind: "cases",
            filters: { openOnly: true },
            rowCount: 12,
            sourceRoute: "/api/admin/adoptions/exports/cases.csv",
          },
        },
      ],
    });

    await expect(
      repo.listCoordinatorExportHistory({
        month: "2026-06",
        kind: "cases",
        page: 1,
        pageSize: 25,
      }),
    ).resolves.toMatchObject({
      total: 1,
      exports: [
        {
          kind: "cases",
          rowCount: 12,
          filters: { openOnly: true },
        },
      ],
    });
  });

  test("maps and filters original export history rows without detail kind", async () => {
    const { repo } = setupRepository({
      auditRows: [
        {
          id: "aaaaaaaa-bbbb-4333-8444-555555555555",
          actor_user_id: createdSupporterId,
          action: "coordinator_export.cases",
          entity: "coordinator_export",
          entity_id: "cases",
          timestamp: "2026-06-28T01:00:00.000Z",
          detail: {
            filters: { openOnly: true },
            rowCount: 12,
          },
        },
        {
          id: "bbbbbbbb-cccc-4333-8444-555555555555",
          actor_user_id: createdSupporterId,
          action: "coordinator_export.adopters",
          entity: "coordinator_export",
          entity_id: "adopters",
          timestamp: "2026-06-28T02:00:00.000Z",
          detail: {
            filters: {},
            rowCount: 3,
          },
        },
      ],
    });

    await expect(
      repo.listCoordinatorExportHistory({
        month: "2026-06",
        kind: "cases",
        page: 1,
        pageSize: 25,
      }),
    ).resolves.toMatchObject({
      total: 1,
      exports: [
        {
          kind: "cases",
          rowCount: 12,
          filters: { openOnly: true },
        },
      ],
    });
  });

  test("uses exact UUID actor filtering for export history", async () => {
    const { repo, calls } = setupRepository({
      auditRows: [
        {
          id: "aaaaaaaa-bbbb-4333-8444-555555555555",
          actor_user_id: createdSupporterId,
          action: "coordinator_export.cases",
          entity: "coordinator_export",
          entity_id: "cases",
          timestamp: "2026-06-28T01:00:00.000Z",
          detail: {
            filters: {},
            rowCount: 12,
          },
        },
      ],
    });

    await expect(
      repo.listCoordinatorExportHistory({
        month: "2026-06",
        actor: createdSupporterId,
        page: 1,
        pageSize: 25,
      }),
    ).resolves.toMatchObject({ total: 1 });

    expect(calls).toContainEqual({
      table: "audit_log",
      method: "eq",
      payload: { column: "actor_user_id", value: createdSupporterId },
    });
    expect(
      callsFor(calls, "audit_log", "ilike").some(
        (call) => (call.payload as { column?: string }).column === "actor_user_id",
      ),
    ).toBe(false);
  });

  test("ignores non-UUID actor export history filters without UUID ilike", async () => {
    const { repo, calls } = setupRepository({
      auditRows: [
        {
          id: "aaaaaaaa-bbbb-4333-8444-555555555555",
          actor_user_id: createdSupporterId,
          action: "coordinator_export.cases",
          entity: "coordinator_export",
          entity_id: "cases",
          timestamp: "2026-06-28T01:00:00.000Z",
          detail: {
            filters: {},
            rowCount: 12,
          },
        },
      ],
    });

    await expect(
      repo.listCoordinatorExportHistory({
        month: "2026-06",
        actor: "Ada",
        page: 1,
        pageSize: 25,
      }),
    ).resolves.toEqual({ exports: [], total: 0 });

    expect(callsFor(calls, "audit_log", "ilike")).toHaveLength(0);
  });

  test("returns null for non-export audit rows before mapping export metadata", async () => {
    const { repo } = setupRepository({
      auditRows: [
        {
          id: "aaaaaaaa-bbbb-4333-8444-555555555555",
          actor_user_id: createdSupporterId,
          action: "coordinator_status.update",
          entity: "coordinator_status",
          entity_id: statusId,
          timestamp: "2026-06-28T01:00:00.000Z",
          detail: {
            key: "scheduled",
          },
        },
      ],
    });

    await expect(
      repo.getCoordinatorExportAuditRow("aaaaaaaa-bbbb-4333-8444-555555555555"),
    ).resolves.toBeNull();
  });

  test("returns monthly coordinator summary counts", async () => {
    const { repo } = setupRepository({
      summaryCounts: {
        publicIntakeCases: 2,
        manualIntakeCases: 3,
        successfulAdoptions: 4,
        openCases: 5,
        overdueTasks: 6,
        exportsRun: 7,
      },
    });

    await expect(repo.getCoordinatorMonthlySummary({ month: "2026-06" })).resolves.toEqual({
      month: "2026-06",
      publicIntakeCases: 2,
      manualIntakeCases: 3,
      successfulAdoptions: 4,
      openCases: 5,
      overdueTasks: 6,
      exportsRun: 7,
    });
  });

  test("caps overdue task summary counts at now within the selected month", async () => {
    const { repo, calls } = setupRepository({
      summaryCounts: {
        overdueTasks: 99,
      },
      followupRows: [
        followupRow({
          id: "past-overdue-task",
          due_at: "2026-06-10T00:00:00.000Z",
          completed_at: null,
        }),
        followupRow({
          id: "future-task",
          due_at: "2026-06-20T00:00:00.000Z",
          completed_at: null,
        }),
        followupRow({
          id: "completed-task",
          due_at: "2026-06-09T00:00:00.000Z",
          completed_at: "2026-06-09T02:00:00.000Z",
        }),
      ],
    });

    const result = await withFixedDate("2026-06-15T00:00:00.000Z", () =>
      repo.getCoordinatorMonthlySummary({ month: "2026-06" }),
    );

    expect(result.overdueTasks).toBe(1);
    expect(calls).toContainEqual({
      table: "adoption_followup",
      method: "lt",
      payload: { column: "due_at", value: "2026-06-15T00:00:00.000Z" },
    });
  });

  test("lists adopters with aggregate counts and supporter identity", async () => {
    const { repo } = setupRepository({
      adopterRows: [
        {
          id: existingProfileId,
          supporter_id: existingSupporterId,
          name_english: "Ada",
          name_chinese: null,
          is_blacklisted: false,
          living_area_id: null,
          supporter: {
            id: existingSupporterId,
            name: "Ada",
            email: "ada@example.test",
            phone: "61234567",
          },
        },
      ],
      caseRows: [
        caseRow({
          id: existingCaseId,
          adopter_profile_id: existingProfileId,
          requested_animal_id: animalId,
          animal_type: "cat",
          applicant_name: "Ada",
          closed_at: null,
          created_at: "2026-06-27T08:00:00.000Z",
        }),
      ],
      followupRows: [
        {
          id: existingTaskId,
          adopter_profile_id: existingProfileId,
          completed_at: null,
        },
      ],
      successRows: [],
      animalRows: [animalRow({ name_en: null })],
    });

    const result = await repo.listAdopters({
      q: "Ada",
      blacklisted: "all",
      hasOpenCases: true,
      hasOpenTasks: true,
      page: 1,
      pageSize: 25,
    });

    expect(result.adopters).toEqual([
      expect.objectContaining({
        id: existingProfileId,
        supporterId: existingSupporterId,
        displayName: "Ada",
        email: "ada@example.test",
        phone: "61234567",
        openCaseCount: 1,
        successfulAdoptionCount: 0,
        openTaskCount: 1,
        latestCaseAt: "2026-06-27T08:00:00.000Z",
        latestCase: expect.objectContaining({
          id: existingCaseId,
          applicantName: "Ada",
          animalType: "cat",
          requestedAnimalName: "Mochi",
          status: expect.objectContaining({ id: statusId }),
          createdAt: "2026-06-27T08:00:00.000Z",
        }),
      }),
    ]);
  });

  test("searches adopters by supporter identity without cross-table or filters", async () => {
    const { repo, calls } = setupRepository({
      supporterRows: [
        { id: existingSupporterId, name: "Ada", email: "ada@example.test", phone: "61234567" },
        { id: secondSupporterId, name: "Grace", email: "grace@example.test", phone: "69876543" },
      ],
      adopterRows: [
        adopterRow({
          name_english: null,
          name_chinese: null,
          address: null,
          supporter_id: existingSupporterId,
          supporter: {
            id: existingSupporterId,
            name: "Ada",
            email: "ada@example.test",
            phone: "61234567",
          },
        }),
        adopterRow({
          id: secondProfileId,
          supporter_id: secondSupporterId,
          name_english: "Grace",
          name_chinese: null,
          address: null,
          supporter: {
            id: secondSupporterId,
            name: "Grace",
            email: "grace@example.test",
            phone: "69876543",
          },
        }),
      ],
    });

    const result = await repo.listAdopters({
      q: "ada@example.test",
      blacklisted: "all",
      hasOpenCases: false,
      hasOpenTasks: false,
      page: 1,
      pageSize: 25,
    });

    expect(result).toMatchObject({
      total: 1,
      adopters: [
        expect.objectContaining({
          id: existingProfileId,
          email: "ada@example.test",
        }),
      ],
    });
    expect(
      callsFor(calls, "adopter_profile", "or").some((call) =>
        String(call.payload).includes("supporter."),
      ),
    ).toBe(false);
    expect(calls).toContainEqual({
      table: "supporter",
      method: "or",
      payload:
        "name.ilike.%ada@example.test%,email.ilike.%ada@example.test%,phone.ilike.%ada@example.test%",
      options: undefined,
    });
    expect(calls).toContainEqual({
      table: "adopter_profile",
      method: "in",
      payload: { column: "supporter_id", value: [existingSupporterId] },
    });
    expect(calls).toContainEqual({
      table: "adopter_profile",
      method: "in",
      payload: { column: "id", value: [existingProfileId] },
    });
    expect(calls).toContainEqual({
      table: "adopter_profile",
      method: "range",
      payload: { from: 0, to: 24 },
    });
  });

  test("keeps aggregate-filtered adopter lists bounded by candidate ids and range", async () => {
    const { repo, calls } = setupRepository({
      adopterRows: [
        adopterRow({ id: existingProfileId, supporter_id: existingSupporterId }),
        adopterRow({ id: secondProfileId, supporter_id: secondSupporterId }),
      ],
      caseRows: [
        caseRow({
          id: secondCaseId,
          adopter_profile_id: secondProfileId,
          closed_at: null,
        }),
      ],
    });

    const result = await repo.listAdopters({
      blacklisted: "all",
      hasOpenCases: true,
      hasOpenTasks: false,
      page: 1,
      pageSize: 1,
    });

    expect(result).toMatchObject({
      total: 1,
      adopters: [expect.objectContaining({ id: secondProfileId, openCaseCount: 1 })],
    });
    expect(calls).toContainEqual({
      table: "adopter_profile",
      method: "in",
      payload: { column: "id", value: [secondProfileId] },
    });
    expect(calls).toContainEqual({
      table: "adopter_profile",
      method: "range",
      payload: { from: 0, to: 0 },
    });
  });

  test("filters open-case adopters before paginating list results", async () => {
    const { repo } = setupRepository({
      adopterRows: [
        adopterRow({ id: existingProfileId, supporter_id: existingSupporterId }),
        adopterRow({ id: secondProfileId, supporter_id: secondSupporterId }),
      ],
      caseRows: [
        caseRow({
          id: secondCaseId,
          adopter_profile_id: secondProfileId,
          closed_at: null,
        }),
      ],
    });

    const result = await repo.listAdopters({
      blacklisted: "all",
      hasOpenCases: true,
      hasOpenTasks: false,
      page: 1,
      pageSize: 1,
    });

    expect(result).toMatchObject({
      total: 1,
      adopters: [expect.objectContaining({ id: secondProfileId, openCaseCount: 1 })],
    });
  });

  test("filters open-task adopters before paginating list results", async () => {
    const { repo } = setupRepository({
      adopterRows: [
        adopterRow({ id: existingProfileId, supporter_id: existingSupporterId }),
        adopterRow({ id: secondProfileId, supporter_id: secondSupporterId }),
      ],
      followupRows: [
        followupRow({
          id: "second-open-task",
          adopter_profile_id: secondProfileId,
          completed_at: null,
        }),
      ],
    });

    const result = await repo.listAdopters({
      blacklisted: "all",
      hasOpenCases: false,
      hasOpenTasks: true,
      page: 1,
      pageSize: 1,
    });

    expect(result).toMatchObject({
      total: 1,
      adopters: [expect.objectContaining({ id: secondProfileId, openTaskCount: 1 })],
    });
  });

  test("rejects oversized adopter candidate filters before building a large in query", async () => {
    const { repo, calls } = setupRepository({
      caseRows: Array.from({ length: 1001 }, (_, index) =>
        caseRow({
          id: `case-${index}`,
          adopter_profile_id: `profile-${index}`,
          closed_at: null,
        }),
      ),
    });

    await expect(
      repo.listAdopters({
        blacklisted: "all",
        hasOpenCases: true,
        hasOpenTasks: false,
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toThrow("Adopter filters match too many records");
    expect(
      callsFor(calls, "adopter_profile", "in").some(
        (call) =>
          (call.payload as { column?: string; value?: unknown[] }).column === "id" &&
          ((call.payload as { value?: unknown[] }).value?.length ?? 0) > 1000,
      ),
    ).toBe(false);
  });

  test("rejects broad supporter identity searches before building a large supporter id query", async () => {
    const { repo, calls } = setupRepository({
      supporterRows: Array.from({ length: 1001 }, (_, index) => ({
        id: `supporter-${index}`,
        name: `Ada ${index}`,
        email: `ada-${index}@example.test`,
        phone: `6000${index}`,
      })),
    });

    await expect(
      repo.listAdopters({
        q: "Ada",
        blacklisted: "all",
        hasOpenCases: false,
        hasOpenTasks: false,
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toThrow("Adopter filters match too many records");
    expect(
      callsFor(calls, "adopter_profile", "in").some(
        (call) =>
          (call.payload as { column?: string; value?: unknown[] }).column === "supporter_id" &&
          ((call.payload as { value?: unknown[] }).value?.length ?? 0) > 1000,
      ),
    ).toBe(false);
  });

  test("rejects broad case-linked task filters before building a large case id query", async () => {
    const { repo, calls } = setupRepository({
      followupRows: Array.from({ length: 1001 }, (_, index) =>
        followupRow({
          id: `task-${index}`,
          adoption_case_id: `case-${index}`,
          adopter_profile_id: null,
          completed_at: null,
        }),
      ),
    });

    await expect(
      repo.listAdopters({
        blacklisted: "all",
        hasOpenCases: false,
        hasOpenTasks: true,
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toThrow("Adopter filters match too many records");
    expect(
      callsFor(calls, "adoption_case", "in").some(
        (call) =>
          (call.payload as { column?: string; value?: unknown[] }).column === "id" &&
          ((call.payload as { value?: unknown[] }).value?.length ?? 0) > 1000,
      ),
    ).toBe(false);
  });

  test("counts open tasks linked through an adopter case", async () => {
    const { repo } = setupRepository({
      adopterRows: [adopterRow()],
      caseRows: [caseRow({ id: existingCaseId, adopter_profile_id: existingProfileId })],
      followupRows: [
        followupRow({
          id: caseLinkedTaskId,
          adoption_case_id: existingCaseId,
          adopter_profile_id: null,
          completed_at: null,
        }),
      ],
    });

    const result = await repo.listAdopters({
      blacklisted: "all",
      hasOpenCases: false,
      hasOpenTasks: false,
      page: 1,
      pageSize: 25,
    });

    expect(result.adopters).toEqual([
      expect.objectContaining({
        id: existingProfileId,
        openTaskCount: 1,
      }),
    ]);
  });

  test("exports adopters by supporter identity without cross-table or filters", async () => {
    const { repo, calls } = setupRepository({
      supporterRows: [
        { id: existingSupporterId, name: "Ada", email: "ada@example.test", phone: "61234567" },
      ],
      adopterRows: [
        adopterRow({
          supporter_id: existingSupporterId,
          name_english: null,
          name_chinese: null,
          supporter: {
            id: existingSupporterId,
            name: "Ada",
            email: "ada@example.test",
            phone: "61234567",
          },
        }),
      ],
      caseRows: [
        caseRow({
          id: existingCaseId,
          adopter_profile_id: existingProfileId,
          closed_at: null,
          created_at: "2026-06-27T08:00:00.000Z",
        }),
      ],
      followupRows: [],
      successRows: [successfulAdoptionRow({ adopter_profile_id: existingProfileId })],
    });

    const rows = await repo.listAdopterExportRows({
      q: "ada@example.test",
      blacklisted: "all",
      hasOpenCases: false,
      hasOpenTasks: false,
      page: 1,
      pageSize: 25,
    });

    expect(rows).toEqual([
      {
        adopterProfileId: existingProfileId,
        supporterId: existingSupporterId,
        displayName: "Ada",
        email: "ada@example.test",
        phone: "61234567",
        livingArea: null,
        isBlacklisted: false,
        openCaseCount: 1,
        successfulAdoptionCount: 1,
        openTaskCount: 0,
        latestCaseAt: "2026-06-27T08:00:00.000Z",
      },
    ]);
    expect(
      callsFor(calls, "adopter_profile", "or").some((call) =>
        String(call.payload).includes("supporter."),
      ),
    ).toBe(false);
    expect(calls).toContainEqual({
      table: "supporter",
      method: "or",
      payload:
        "name.ilike.%ada@example.test%,email.ilike.%ada@example.test%,phone.ilike.%ada@example.test%",
      options: undefined,
    });
    expect(calls).toContainEqual({
      table: "adopter_profile",
      method: "range",
      payload: { from: 0, to: 24 },
    });
  });

  test("adopter export counts open tasks linked through adopter cases", async () => {
    const { repo } = setupRepository({
      adopterRows: [adopterRow()],
      caseRows: [caseRow({ id: existingCaseId, adopter_profile_id: existingProfileId })],
      followupRows: [
        followupRow({
          id: caseLinkedTaskId,
          adoption_case_id: existingCaseId,
          adopter_profile_id: null,
          completed_at: null,
        }),
      ],
    });

    const rows = await repo.listAdopterExportRows({
      blacklisted: "all",
      hasOpenCases: false,
      hasOpenTasks: false,
      page: 1,
      pageSize: 25,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        adopterProfileId: existingProfileId,
        openTaskCount: 1,
      }),
    ]);
  });

  test("exports animals with internal profile and lookup labels", async () => {
    const { repo, calls } = setupRepository({
      animalRows: [
        animalRow({
          type: "cat",
          status: "fostered",
        }),
      ],
      internalProfileRows: [
        {
          animal_id: animalId,
          internal_code: "CAT-204",
          arrival_source_id: arrivalSourceId,
          current_position_id: animalPositionId,
          is_adoptable: false,
          is_inside_support_pool: true,
          adopted_at: null,
          deceased_at: null,
        },
      ],
      animalPositionRows: [{ id: animalPositionId, name: "Foster home" }],
      arrivalSourceRows: [{ id: arrivalSourceId, name_zh: "街上救援", name_en: "Street rescue" }],
    });

    const rows = await repo.listAnimalExportRows({ page: 1, pageSize: 1000 });

    expect(rows).toEqual([
      {
        animalId,
        type: "cat",
        name: "Mochi",
        nameEn: "Mochi",
        status: "fostered",
        internalCode: "CAT-204",
        currentPosition: "Foster home",
        arrivalSource: "街上救援",
        isAdoptable: false,
        isInsideSupportPool: true,
        adoptedAt: null,
        deceasedAt: null,
      },
    ]);
    expect(calls).toContainEqual({
      table: "animals",
      method: "range",
      payload: { from: 0, to: 999 },
    });
    expect(callsFor(calls, "animal_profile_internal", "select")).toHaveLength(1);
    expect(callsFor(calls, "animal_position", "select")).toHaveLength(1);
    expect(callsFor(calls, "arrival_source", "select")).toHaveLength(1);
  });

  test("lists paginated animal pipeline rows with selected columns and page profiles", async () => {
    const { repo, calls } = setupRepository({
      animalRows: [
        animalRow({
          id: animalId,
          gender: "female",
          age: "2 years",
          image_url: "https://example.test/mochi.jpg",
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-20T00:00:00.000Z",
        }),
      ],
      internalProfileRows: [
        {
          animal_id: animalId,
          internal_code: "CAT-204",
          arrival_date: "2026-06-01",
          arrival_source_id: arrivalSourceId,
          current_position_id: animalPositionId,
          cage: "A-12",
          has_chip: true,
          chip_remarks: "Chip scanned",
          is_desexed: false,
          desexed_at: null,
          desex_remarks: null,
          is_adoptable: false,
          is_inside_support_pool: true,
          adopted_at: null,
          deceased_at: null,
          internal_remarks: "Needs quiet home",
        },
      ],
      animalPositionRows: [{ id: animalPositionId, name: "Foster home", type: "foster" }],
      arrivalSourceRows: [{ id: arrivalSourceId, name_zh: "Street rescue", name_en: "Street" }],
    });

    const result = await repo.listAnimalPipeline({
      status: "all",
      type: "all",
      adoptable: "all",
      supportPool: "all",
      positionId: "all",
      page: 1,
      pageSize: 25,
    });

    expect(result).toEqual({
      animals: [
        expect.objectContaining({
          id: animalId,
          name: "Mochi",
          profile: expect.objectContaining({
            animal_id: animalId,
            internal_code: "CAT-204",
            is_adoptable: false,
            is_inside_support_pool: true,
          }),
          currentPosition: { id: animalPositionId, name: "Foster home", type: "foster" },
          arrivalSource: { id: arrivalSourceId, name_zh: "Street rescue", name_en: "Street" },
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    });
    expect(calls).toContainEqual({
      table: "animals",
      method: "select",
      payload: "id,type,name,name_en,gender,age,status,image_url,created_at,updated_at",
      options: { count: "exact" },
    });
    expect(calls).toContainEqual({
      table: "animals",
      method: "range",
      payload: { from: 0, to: 24 },
    });
    expect(callsFor(calls, "animal_profile_internal", "select")).toHaveLength(1);
  });

  test("applies animal pipeline filters before paginating animal rows", async () => {
    const { repo, calls } = setupRepository({
      animalRows: [
        animalRow({ id: animalId, type: "cat", status: "available" }),
        animalRow({ id: "99999999-aaaa-4bbb-8ccc-dddddddddddd", type: "dog", status: "available" }),
      ],
      internalProfileRows: [
        {
          animal_id: animalId,
          internal_code: "CAT-204",
          arrival_date: null,
          arrival_source_id: null,
          current_position_id: animalPositionId,
          cage: "A-12",
          has_chip: null,
          chip_remarks: null,
          is_desexed: null,
          desexed_at: null,
          desex_remarks: null,
          is_adoptable: false,
          is_inside_support_pool: true,
          adopted_at: null,
          deceased_at: null,
          internal_remarks: null,
        },
      ],
    });

    await repo.listAnimalPipeline({
      q: "CAT",
      status: "available",
      type: "cat",
      adoptable: "not_adoptable",
      supportPool: "inside",
      positionId: animalPositionId,
      page: 2,
      pageSize: 10,
    });

    expect(callPayloads(calls, "animals", "eq")).toEqual(
      expect.arrayContaining([
        { column: "status", value: "available" },
        { column: "type", value: "cat" },
      ]),
    );
    expect(callPayloads(calls, "animal_profile_internal", "eq")).toEqual(
      expect.arrayContaining([
        { column: "is_adoptable", value: false },
        { column: "is_inside_support_pool", value: true },
        { column: "current_position_id", value: animalPositionId },
      ]),
    );
    expect(calls).toContainEqual({
      table: "animals",
      method: "range",
      payload: { from: 10, to: 19 },
    });
  });

  test("successful adoption export caps rows before mapping", async () => {
    const { repo, calls } = setupRepository({
      successRows: [successfulAdoptionRow()],
      animalRows: [animalRow()],
    });

    await repo.listSuccessfulAdoptionExportRows({ page: 1, pageSize: 1000 });

    expect(calls).toContainEqual({
      table: "successful_adoption",
      method: "range",
      payload: { from: 0, to: 999 },
    });
  });

  test("includes tasks linked through adopter cases in adopter detail", async () => {
    const { repo } = setupRepository({
      adopterRows: [adopterRow()],
      caseRows: [caseRow({ id: existingCaseId, adopter_profile_id: existingProfileId })],
      followupRows: [
        followupRow({
          id: caseLinkedTaskId,
          adoption_case_id: existingCaseId,
          adopter_profile_id: null,
        }),
      ],
      taskCaseRows: [taskCaseRow({ id: existingCaseId })],
      animalRows: [animalRow()],
    });

    const detail = await repo.getAdopterDetail(existingProfileId);

    expect(detail).toMatchObject({
      openTaskCount: 1,
      tasks: [
        expect.objectContaining({
          id: caseLinkedTaskId,
          adoptionCase: expect.objectContaining({ id: existingCaseId }),
        }),
      ],
    });
  });

  test("orders direct and case-linked adopter detail tasks by due date", async () => {
    const { repo } = setupRepository({
      adopterRows: [adopterRow()],
      caseRows: [caseRow({ id: existingCaseId, adopter_profile_id: existingProfileId })],
      followupRows: [
        followupRow({
          id: followupId,
          adoption_case_id: null,
          adopter_profile_id: existingProfileId,
          due_at: "2026-06-30T10:00:00.000Z",
        }),
        followupRow({
          id: caseLinkedTaskId,
          adoption_case_id: existingCaseId,
          adopter_profile_id: null,
          due_at: "2026-06-28T10:00:00.000Z",
        }),
      ],
      taskCaseRows: [taskCaseRow({ id: existingCaseId })],
      animalRows: [animalRow()],
    });

    const detail = await repo.getAdopterDetail(existingProfileId);

    expect(detail?.tasks.map((task) => task.id)).toEqual([caseLinkedTaskId, followupId]);
  });

  test("returns adopter detail with cases, successful adoptions, and tasks", async () => {
    const { repo } = setupRepository({
      adopterRows: [adopterRow()],
      caseRows: [caseRow({ adopter_profile_id: existingProfileId })],
      followupRows: [followupRow({ adopter_profile_id: existingProfileId })],
      successRows: [successfulAdoptionRow({ adopter_profile_id: existingProfileId })],
      consentRows: [
        {
          id: "consent-email-old",
          supporter_id: linkedSupporterId,
          channel: "email",
          status: "opt_out",
          source: "manual",
          timestamp: "2026-06-20T08:00:00.000Z",
        },
        {
          id: "consent-email-new",
          supporter_id: linkedSupporterId,
          channel: "email",
          status: "opt_in",
          source: "manual",
          timestamp: "2026-06-27T08:00:00.000Z",
        },
        {
          id: "consent-whatsapp",
          supporter_id: linkedSupporterId,
          channel: "whatsapp",
          status: "opt_out",
          source: "donation_form",
          timestamp: "2026-06-26T08:00:00.000Z",
        },
      ],
      taskCaseRows: [taskCaseRow()],
      animalRows: [animalRow()],
    });

    const detail = await repo.getAdopterDetail(existingProfileId);

    expect(detail).toMatchObject({
      id: existingProfileId,
      cases: [expect.objectContaining({ id: existingCaseId })],
      emailConsent: "opt_in",
      whatsappConsent: "opt_out",
      successfulAdoptions: [expect.objectContaining({ caseNumber: "AC-2026-001" })],
      tasks: [
        expect.objectContaining({
          adopterProfile: expect.objectContaining({ id: existingProfileId }),
        }),
      ],
    });
  });

  test("returns null for missing adopter detail ids", async () => {
    const { repo } = setupRepository({
      adopterRows: [adopterRow()],
    });

    await expect(repo.getAdopterDetail(unknownProfileId)).resolves.toBeNull();
  });

  test("creates a public application case with new supporter and adopter profile records", async () => {
    const { client, calls } = createFakeClient();
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    await expect(repo.createCaseFromPublicApplication(publicCaseInput())).resolves.toEqual({
      id: adoptionCaseId,
    });

    expect(calls).toContainEqual({
      table: "coordinator_status",
      method: "select",
      payload: "id",
      options: undefined,
    });
    expect(calls).toContainEqual({
      table: "supporter",
      method: "select",
      payload: "id",
      options: undefined,
    });
    expect(calls).toContainEqual({
      table: "supporter",
      method: "eq",
      payload: { column: "email", value: "ada@example.com" },
    });
    expect(calls).toContainEqual({
      table: "supporter",
      method: "is",
      payload: { column: "deleted_at", value: null },
    });
    expect(calls).toContainEqual({
      table: "supporter",
      method: "insert",
      payload: {
        name: "Ada",
        email: "ada@example.com",
        phone: "9123 4567",
        language: "zh-HK",
        source: "adoption_form",
      },
    });
    expect(calls).toContainEqual({
      table: "supporter_role",
      method: "upsert",
      payload: { supporter_id: createdSupporterId, role: "adopter" },
      options: { onConflict: "supporter_id,role" },
    });
    expect(calls).toContainEqual({
      table: "adopter_profile",
      method: "select",
      payload: "id",
      options: undefined,
    });
    expect(calls).toContainEqual({
      table: "adopter_profile",
      method: "eq",
      payload: { column: "supporter_id", value: createdSupporterId },
    });
    expect(calls).toContainEqual({
      table: "adopter_profile",
      method: "insert",
      payload: {
        supporter_id: createdSupporterId,
        address: "HK Island",
        household_size: "3",
      },
    });
    expect(callsFor(calls, "supporter", "upsert")).toHaveLength(0);
    expect(callsFor(calls, "adopter_profile", "upsert")).toHaveLength(0);
    expect(caseInsertPayload(calls)).toEqual({
      public_application_id: publicApplicationId,
      status_id: statusId,
      adopter_profile_id: createdProfileId,
      supporter_id: createdSupporterId,
      requested_animal_id: animalId,
      animal_type: "cat",
      applicant_name: "Ada",
      applicant_phone: "9123 4567",
      applicant_email: "ada@example.com",
      applicant_address: "HK Island",
      housing_type: "私人樓宇",
      family_size: 3,
      existing_pets: null,
      reason: "I can provide a safe home.",
      preferences: {
        animalName: "Mochi",
        language: "en",
        rankedAnimals: [{ animalName: "Mochi", rank: 1 }],
      },
    });
  });

  test("links an existing supporter and adopter profile without overwriting CRM data", async () => {
    const { client, calls } = createFakeClient({
      existingSupporter: { id: existingSupporterId },
      existingProfile: { id: existingProfileId, supporter_id: existingSupporterId },
    });
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    await expect(
      repo.createCaseFromPublicApplication(
        publicCaseInput({
          applicantName: "Public Form Name",
          applicantPhone: "0000 0000",
          applicantAddress: "Public form address",
          familySize: 7,
        }),
      ),
    ).resolves.toEqual({ id: adoptionCaseId });

    expect(callsFor(calls, "supporter", "insert")).toHaveLength(0);
    expect(callsFor(calls, "supporter", "upsert")).toHaveLength(0);
    expect(callsFor(calls, "supporter", "update")).toHaveLength(0);
    expect(callsFor(calls, "adopter_profile", "insert")).toHaveLength(0);
    expect(callsFor(calls, "adopter_profile", "upsert")).toHaveLength(0);
    expect(callsFor(calls, "adopter_profile", "update")).toHaveLength(0);
    expect(calls).toContainEqual({
      table: "supporter_role",
      method: "upsert",
      payload: { supporter_id: existingSupporterId, role: "adopter" },
      options: { onConflict: "supporter_id,role" },
    });
    expect(caseInsertPayload(calls)).toMatchObject({
      supporter_id: existingSupporterId,
      adopter_profile_id: existingProfileId,
      applicant_name: "Public Form Name",
      applicant_phone: "0000 0000",
      applicant_address: "Public form address",
      family_size: 7,
    });
  });

  test("creates coordinator tasks with all supported followup columns", async () => {
    const { client, calls } = createFakeClient();
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    await expect(
      repo.createTask({
        title: "Post-adoption call",
        statusId,
        adoptionCaseId,
        adopterProfileId: existingProfileId,
        animalId,
        taskType: "followup",
        priority: "high",
        dueAt: "2026-06-28T10:00:00.000Z",
        scheduledAt: "2026-06-28T09:00:00.000Z",
        completedAt: "2026-06-28T11:00:00.000Z",
        assignedTo: "Ada",
        volunteer: "Ben",
        contactChannel: "phone",
        outcome: "Reached adopter",
        nextStepAt: "2026-07-01T10:00:00.000Z",
        remarks: "Call notes",
        hasWindowNet: true,
        environment: "Flat",
        score: "A",
        createdBy: createdSupporterId,
      }),
    ).resolves.toEqual({ id: followupId });

    expect(calls).toContainEqual({
      table: "adoption_followup",
      method: "insert",
      payload: {
        adoption_case_id: adoptionCaseId,
        adopter_profile_id: existingProfileId,
        animal_id: animalId,
        status_id: statusId,
        title: "Post-adoption call",
        task_type: "followup",
        priority: "high",
        due_at: "2026-06-28T10:00:00.000Z",
        scheduled_at: "2026-06-28T09:00:00.000Z",
        completed_at: "2026-06-28T11:00:00.000Z",
        assigned_to: "Ada",
        volunteer: "Ben",
        contact_channel: "phone",
        outcome: "Reached adopter",
        next_step_at: "2026-07-01T10:00:00.000Z",
        remarks: "Call notes",
        has_window_net: true,
        environment: "Flat",
        score: "A",
        created_by: createdSupporterId,
        updated_by: createdSupporterId,
      },
    });
  });

  test("updates coordinator tasks with changed followup columns", async () => {
    const { client, calls } = createFakeClient();
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    await expect(
      repo.updateTask({
        taskId: followupId,
        statusId,
        priority: "urgent",
        dueAt: null,
        assignedTo: null,
        outcome: "Completed",
        updatedBy: existingSupporterId,
      }),
    ).resolves.toEqual({ id: followupId });

    expect(calls).toContainEqual({
      table: "adoption_followup",
      method: "update",
      payload: {
        status_id: statusId,
        priority: "urgent",
        due_at: null,
        assigned_to: null,
        outcome: "Completed",
        updated_by: existingSupporterId,
      },
    });
    expect(calls).toContainEqual({
      table: "adoption_followup",
      method: "eq",
      payload: { column: "id", value: followupId },
    });
  });

  test("maps coordinator task linked summaries from followup rows", async () => {
    const { client } = createFakeClient({
      followupRow: followupRow(),
      taskCaseRows: [taskCaseRow()],
      adopterRows: [adopterRow()],
      animalRows: [animalRow()],
    });
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    const task = await repo.getTask(followupId);

    expect(task).toMatchObject({
      id: followupId,
      title: "Post-adoption call",
      priority: "high",
      adoptionCase: { id: adoptionCaseId, applicantName: "Ada", animalType: "cat" },
      adopterProfile: {
        id: existingProfileId,
        supporterId: linkedSupporterId,
        displayName: "Ada",
        isBlacklisted: false,
      },
      animal: { id: animalId, name: "Mochi", nameEn: "Mochi", type: "cat", status: "available" },
    });
  });

  test("maps missing linked summaries to stable id fallbacks", async () => {
    const { client } = createFakeClient({
      followupRow: followupRow(),
    });
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    const task = await repo.getTask(followupId);

    expect(task).toMatchObject({
      adoptionCase: { id: adoptionCaseId, applicantName: adoptionCaseId, animalType: "" },
      adopterProfile: {
        id: existingProfileId,
        supporterId: null,
        displayName: existingProfileId,
        isBlacklisted: false,
      },
      animal: { id: animalId, name: animalId, nameEn: null, type: "", status: "" },
    });
  });

  test("lists open overdue coordinator tasks with assignee search and linked summaries", async () => {
    const { client, calls } = createFakeClient({
      followupRows: [followupRow()],
      taskCaseRows: [taskCaseRow()],
      adopterRows: [adopterRow()],
      animalRows: [animalRow()],
    });
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    const result = await repo.listTasks({
      page: 1,
      pageSize: 10,
      due: "overdue",
      openOnly: true,
      assignedTo: "Ada_%",
    });

    expect(result.total).toBe(1);
    expect(result.tasks[0]).toMatchObject({
      id: followupId,
      adoptionCase: { id: adoptionCaseId, applicantName: "Ada", animalType: "cat" },
      adopterProfile: {
        id: existingProfileId,
        supporterId: linkedSupporterId,
        displayName: "Ada",
        isBlacklisted: false,
      },
      animal: { id: animalId, name: "Mochi", nameEn: "Mochi", type: "cat", status: "available" },
    });
    expect(calls).toContainEqual({
      table: "adoption_followup",
      method: "ilike",
      payload: { column: "assigned_to", value: "%Ada\\_\\%%" },
    });
    expect(calls).toContainEqual({
      table: "adoption_followup",
      method: "is",
      payload: { column: "completed_at", value: null },
    });
    expect(calls.some((call) => call.table === "adoption_followup" && call.method === "lt")).toBe(
      true,
    );
  });

  test("applies coordinator task list equality filters and q search", async () => {
    const { client, calls } = createFakeClient({
      followupRows: [followupRow()],
    });
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    await repo.listTasks({
      page: 2,
      pageSize: 5,
      due: "all",
      openOnly: false,
      statusId,
      priority: "urgent",
      taskType: "handover",
      adoptionCaseId,
      adopterProfileId: existingProfileId,
      animalId,
      q: "call_%",
    });

    expect(callPayloads(calls, "adoption_followup", "eq")).toEqual(
      expect.arrayContaining([
        { column: "status_id", value: statusId },
        { column: "priority", value: "urgent" },
        { column: "task_type", value: "handover" },
        { column: "adoption_case_id", value: adoptionCaseId },
        { column: "adopter_profile_id", value: existingProfileId },
        { column: "animal_id", value: animalId },
      ]),
    );
    expect(calls).toContainEqual({
      table: "adoption_followup",
      method: "or",
      payload: "title.ilike.%call\\_\\%%,remarks.ilike.%call\\_\\%%,outcome.ilike.%call\\_\\%%",
      options: undefined,
    });
    expect(calls).toContainEqual({
      table: "adoption_followup",
      method: "range",
      payload: { from: 5, to: 9 },
    });
  });

  test("sanitizes grammar-sensitive q text before building task search or filters", async () => {
    const { client, calls } = createFakeClient({
      followupRows: [followupRow()],
    });
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    await repo.listTasks({
      page: 1,
      pageSize: 10,
      due: "all",
      openOnly: false,
      q: "Ada, (call)%_",
    });

    const payload = callsFor(calls, "adoption_followup", "or")[0]?.payload as string;

    expect(payload).toBe(
      "title.ilike.%Ada call\\%\\_%,remarks.ilike.%Ada call\\%\\_%,outcome.ilike.%Ada call\\%\\_%",
    );
    expect(payload).not.toContain("Ada,");
    expect(payload).not.toContain("(");
    expect(payload).not.toContain(")");
  });

  test("applies today due filter from now to next Hong Kong midnight", async () => {
    const { client, calls } = createFakeClient({
      followupRows: [followupRow()],
    });
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    await withFixedDate("2026-06-27T03:30:00.000Z", () =>
      repo.listTasks({ page: 1, pageSize: 10, due: "today", openOnly: false }),
    );

    expect(calls).toContainEqual({
      table: "adoption_followup",
      method: "gte",
      payload: { column: "due_at", value: "2026-06-27T03:30:00.000Z" },
    });
    expect(calls).toContainEqual({
      table: "adoption_followup",
      method: "lt",
      payload: { column: "due_at", value: "2026-06-27T16:00:00.000Z" },
    });
    expect(calls).toContainEqual({
      table: "adoption_followup",
      method: "is",
      payload: { column: "completed_at", value: null },
    });
  });

  test("applies upcoming and none due filters", async () => {
    const { client, calls } = createFakeClient({
      followupRows: [followupRow()],
    });
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    await repo.listTasks({ page: 1, pageSize: 10, due: "upcoming", openOnly: false });
    await repo.listTasks({ page: 1, pageSize: 10, due: "none", openOnly: false });

    expect(callsFor(calls, "adoption_followup", "gte")).toHaveLength(1);
    expect(callsFor(calls, "adoption_followup", "lt")).toHaveLength(0);
    expect(callPayloads(calls, "adoption_followup", "is")).toEqual(
      expect.arrayContaining([
        { column: "completed_at", value: null },
        { column: "due_at", value: null },
      ]),
    );
    expect(callsFor(calls, "adoption_followup", "is")).toHaveLength(2);
  });

  test("maps case detail followups with linked task summaries", async () => {
    const { client } = createFakeClient({
      caseDetailRow: caseDetailRow(),
      followupRows: [followupRow()],
      taskCaseRows: [taskCaseRow()],
      adopterRows: [adopterRow()],
      animalRows: [animalRow()],
    });
    const repo = createSupabaseAdoptionCoordinatorRepository(client);

    const detail = await repo.getCaseDetail(adoptionCaseId);

    expect(detail?.followups[0]).toMatchObject({
      id: followupId,
      title: "Post-adoption call",
      adoptionCase: { id: adoptionCaseId, applicantName: "Ada", animalType: "cat" },
      adopterProfile: {
        id: existingProfileId,
        supporterId: linkedSupporterId,
        displayName: "Ada",
        isBlacklisted: false,
      },
      animal: { id: animalId, name: "Mochi", nameEn: "Mochi", type: "cat", status: "available" },
    });
  });

  test("loads public adoption detail for linked public applications", async () => {
    const { repo } = setupRepository({
      caseDetailRow: caseDetailRow(),
      animalRows: [animalRow()],
      publicDetailRow: publicDetailRow(),
      preferenceRows: [animalPreferenceRow()],
      visitPreferenceRow: visitPreferenceRow(),
      photoRows: [photoRow()],
      statusTokenRows: [statusTokenRow()],
    });

    const detail = await repo.getCaseDetail(adoptionCaseId);

    expect(detail?.publicAdoption).toEqual({
      language: "zh-HK",
      preferredContactMethod: "whatsapp",
      termsVersion: "2026-06",
      questionnaire: {
        contact: { applicantName: "Ada" },
        home: { windowDoorSafety: "Installed" },
        readiness: { monthlyBudgetHkd: 1000 },
      },
      animalPreferences: [
        {
          id: "preference-1",
          rank: 1,
          animalId,
          animalNameSnapshot: "Mochi",
          animalTypeSnapshot: "cat",
        },
      ],
      visitPreference: {
        dateRangeStart: "2026-07-05",
        dateRangeEnd: "2026-07-07",
        preferredTimeWindows: ["weekday_evening"],
        notes: "After work",
      },
      photos: [
        {
          id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          publicApplicationId,
          fileName: "home.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 123456,
          photoCategory: "home",
          uploadedAt: "2026-06-27T08:05:00.000Z",
        },
      ],
      statusToken: {
        expiresAt: "2026-07-04T08:00:00.000Z",
        revokedAt: null,
        lastViewedAt: "2026-06-28T08:00:00.000Z",
      },
    });
  });
});
