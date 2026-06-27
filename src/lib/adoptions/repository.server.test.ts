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
};

type FakeState = {
  calls: QueryCall[];
  existingSupporter: { id: string } | null;
  existingProfile: Record<string, unknown> | null;
  supporterRows: Record<string, unknown>[];
  followupRow: Record<string, unknown> | null;
  followupRows: Record<string, unknown>[];
  caseRows: Record<string, unknown>[];
  taskCaseRows: Record<string, unknown>[];
  adopterRows: Record<string, unknown>[];
  animalRows: Record<string, unknown>[];
  internalProfileRows: Record<string, unknown>[];
  animalPositionRows: Record<string, unknown>[];
  arrivalSourceRows: Record<string, unknown>[];
  caseDetailRow: Record<string, unknown> | null;
  matchRows: Record<string, unknown>[];
  successRow: Record<string, unknown> | null;
  successRows: Record<string, unknown>[];
};

class FakeQuery {
  private action: "select" | "insert" | "upsert" | "update" | null = null;
  private mutationPayload: unknown;
  private selectedColumns: string | null = null;
  private eqFilters: Array<{ column: string; value: unknown }> = [];
  private inFilters: Array<{ column: string; value: unknown[] }> = [];
  private isFilters: Array<{ column: string; value: unknown }> = [];
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

  in(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "in", payload: { column, value } });
    this.inFilters.push({ column, value: Array.isArray(value) ? value : [] });
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
    this.rangeBounds = { from, to };
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
      if (this.selectedColumns === "id,applicant_name,animal_type") {
        return this.collection(this.state.taskCaseRows);
      }
      return this.collection(this.state.caseRows);
    }
    if (this.table === "supporter") return this.collection(this.state.supporterRows);
    if (this.table === "adopter_profile") return this.collection(this.state.adopterRows);
    if (this.table === "animals") return this.collection(this.state.animalRows);
    if (this.table === "animal_profile_internal") {
      return this.collection(this.state.internalProfileRows);
    }
    if (this.table === "animal_position") return this.collection(this.state.animalPositionRows);
    if (this.table === "arrival_source") return this.collection(this.state.arrivalSourceRows);
    if (this.table === "animal_match") return this.collection(this.state.matchRows);
    if (this.table === "successful_adoption") return this.collection(this.state.successRows);
    return this.executeMaybeSingle();
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
      .filter((row) => this.eqFilters.every((filter) => row[filter.column] === filter.value))
      .filter((row) => this.inFilters.every((filter) => filter.value.includes(row[filter.column])))
      .filter((row) => this.isFilters.every((filter) => row[filter.column] === filter.value))
      .filter((row) => this.orFilters.every((filter) => matchesOrFilter(row, filter)));
  }
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

function createFakeClient(
  options: {
    existingSupporter?: { id: string } | null;
    existingProfile?: Record<string, unknown> | null;
    supporterRows?: Record<string, unknown>[];
    followupRow?: Record<string, unknown> | null;
    followupRows?: Record<string, unknown>[];
    caseRows?: Record<string, unknown>[];
    taskCaseRows?: Record<string, unknown>[];
    adopterRows?: Record<string, unknown>[];
    animalRows?: Record<string, unknown>[];
    internalProfileRows?: Record<string, unknown>[];
    animalPositionRows?: Record<string, unknown>[];
    arrivalSourceRows?: Record<string, unknown>[];
    caseDetailRow?: Record<string, unknown> | null;
    matchRows?: Record<string, unknown>[];
    successRow?: Record<string, unknown> | null;
    successRows?: Record<string, unknown>[];
  } = {},
) {
  const state: FakeState = {
    calls: [],
    existingSupporter: options.existingSupporter ?? null,
    existingProfile: options.existingProfile ?? null,
    supporterRows: options.supporterRows ?? [],
    followupRow: options.followupRow ?? null,
    followupRows: options.followupRows ?? [],
    caseRows: options.caseRows ?? [],
    taskCaseRows: options.taskCaseRows ?? [],
    adopterRows: options.adopterRows ?? [],
    animalRows: options.animalRows ?? [],
    internalProfileRows: options.internalProfileRows ?? [],
    animalPositionRows: options.animalPositionRows ?? [],
    arrivalSourceRows: options.arrivalSourceRows ?? [],
    caseDetailRow: options.caseDetailRow ?? null,
    matchRows: options.matchRows ?? [],
    successRow: options.successRow ?? null,
    successRows: options.successRows ?? [],
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
        {
          id: existingCaseId,
          adopter_profile_id: existingProfileId,
          closed_at: null,
          created_at: "2026-06-27T08:00:00.000Z",
        },
      ],
      followupRows: [
        {
          id: existingTaskId,
          adopter_profile_id: existingProfileId,
          completed_at: null,
        },
      ],
      successRows: [],
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

    const rows = await repo.listAnimalExportRows();

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
    expect(callsFor(calls, "animal_profile_internal", "select")).toHaveLength(1);
    expect(callsFor(calls, "animal_position", "select")).toHaveLength(1);
    expect(callsFor(calls, "arrival_source", "select")).toHaveLength(1);
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
      taskCaseRows: [taskCaseRow()],
      animalRows: [animalRow()],
    });

    const detail = await repo.getAdopterDetail(existingProfileId);

    expect(detail).toMatchObject({
      id: existingProfileId,
      cases: [expect.objectContaining({ id: existingCaseId })],
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
      preferences: { animalName: "Mochi" },
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
});
