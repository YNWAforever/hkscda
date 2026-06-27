import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdoptionCoordinatorRepository } from "./repository.server";
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
};

type FakeState = {
  calls: QueryCall[];
  existingSupporter: { id: string } | null;
  existingProfile: { id: string } | null;
  followupRow: Record<string, unknown> | null;
  followupRows: Record<string, unknown>[];
  taskCaseRows: Record<string, unknown>[];
  adopterRows: Record<string, unknown>[];
  animalRows: Record<string, unknown>[];
  caseDetailRow: Record<string, unknown> | null;
  matchRows: Record<string, unknown>[];
  successRow: Record<string, unknown> | null;
};

class FakeQuery {
  private action: "select" | "insert" | "upsert" | "update" | null = null;
  private mutationPayload: unknown;
  private collectionSelect = false;

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  select(columns: string, options?: unknown) {
    this.state.calls.push({ table: this.table, method: "select", payload: columns, options });
    if (!this.action) this.action = "select";
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "eq", payload: { column, value } });
    return this;
  }

  is(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "is", payload: { column, value } });
    return this;
  }

  in(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "in", payload: { column, value } });
    this.collectionSelect = true;
    return this;
  }

  ilike(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "ilike", payload: { column, value } });
    return this;
  }

  or(filters: string, options?: unknown) {
    this.state.calls.push({ table: this.table, method: "or", payload: filters, options });
    return this;
  }

  gte(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "gte", payload: { column, value } });
    return this;
  }

  lt(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "lt", payload: { column, value } });
    return this;
  }

  order(column: string, options?: unknown) {
    this.state.calls.push({ table: this.table, method: "order", payload: column, options });
    return this;
  }

  range(from: number, to: number) {
    this.state.calls.push({ table: this.table, method: "range", payload: { from, to } });
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
    if (this.table === "adopter_profile") return { data: this.state.existingProfile, error: null };
    if (this.table === "adoption_followup") return { data: this.state.followupRow, error: null };
    if (this.table === "adoption_case") return { data: this.state.caseDetailRow, error: null };
    if (this.table === "successful_adoption") return { data: this.state.successRow, error: null };
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
    if (this.table === "coordinator_status") return this.collection([statusRow]);
    if (this.table === "adoption_followup") return this.collection(this.state.followupRows);
    if (this.table === "adoption_case") {
      return this.collection(this.collectionSelect ? this.state.taskCaseRows : []);
    }
    if (this.table === "adopter_profile") return this.collection(this.state.adopterRows);
    if (this.table === "animals") return this.collection(this.state.animalRows);
    if (this.table === "animal_match") return this.collection(this.state.matchRows);
    return this.executeMaybeSingle();
  }

  private collection(rows: Record<string, unknown>[]) {
    return { data: rows, error: null, count: rows.length };
  }
}

function createFakeClient(
  options: {
    existingSupporter?: { id: string } | null;
    existingProfile?: { id: string } | null;
    followupRow?: Record<string, unknown> | null;
    followupRows?: Record<string, unknown>[];
    taskCaseRows?: Record<string, unknown>[];
    adopterRows?: Record<string, unknown>[];
    animalRows?: Record<string, unknown>[];
    caseDetailRow?: Record<string, unknown> | null;
    matchRows?: Record<string, unknown>[];
    successRow?: Record<string, unknown> | null;
  } = {},
) {
  const state: FakeState = {
    calls: [],
    existingSupporter: options.existingSupporter ?? null,
    existingProfile: options.existingProfile ?? null,
    followupRow: options.followupRow ?? null,
    followupRows: options.followupRows ?? [],
    taskCaseRows: options.taskCaseRows ?? [],
    adopterRows: options.adopterRows ?? [],
    animalRows: options.animalRows ?? [],
    caseDetailRow: options.caseDetailRow ?? null,
    matchRows: options.matchRows ?? [],
    successRow: options.successRow ?? null,
  };

  const client = {
    from(table: string) {
      state.calls.push({ table, method: "from" });
      return new FakeQuery(state, table);
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    calls: state.calls,
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
    preferences: { animalName: "Mochi" },
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
    is_blacklisted: false,
    supporter: { name: "Ada" },
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
    supporter_id: linkedSupporterId,
    adopter_profile_id: existingProfileId,
    assessment: {},
    preferences: {},
    closed_at: null,
    created_at: "2026-06-27T08:00:00.000Z",
    ...overrides,
  };
}

function callsFor(calls: QueryCall[], table: string, method: string) {
  return calls.filter((call) => call.table === table && call.method === method);
}

function caseInsertPayload(calls: QueryCall[]) {
  return calls.find((call) => call.table === "adoption_case" && call.method === "insert")?.payload;
}

describe("createSupabaseAdoptionCoordinatorRepository", () => {
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
      preferences: { animalName: "Mochi" },
    });
  });

  test("links an existing supporter and adopter profile without overwriting CRM data", async () => {
    const { client, calls } = createFakeClient({
      existingSupporter: { id: existingSupporterId },
      existingProfile: { id: existingProfileId },
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
});
