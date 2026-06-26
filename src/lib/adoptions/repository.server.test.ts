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
};

class FakeQuery {
  private action: "select" | "insert" | "upsert" | "update" | null = null;
  private mutationPayload: unknown;

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
    return { data: null, error: null };
  }

  private executeSingle() {
    if (this.table === "supporter") return { data: { id: createdSupporterId }, error: null };
    if (this.table === "adopter_profile") return { data: { id: createdProfileId }, error: null };
    if (this.table === "adoption_case") return { data: { id: adoptionCaseId }, error: null };
    return { data: this.mutationPayload, error: null };
  }

  private execute() {
    if (this.action === "select") return this.executeMaybeSingle();
    if (this.table === "supporter_role") return { error: null };
    return { data: this.mutationPayload, error: null };
  }
}

function createFakeClient(
  options: {
    existingSupporter?: { id: string } | null;
    existingProfile?: { id: string } | null;
  } = {},
) {
  const state: FakeState = {
    calls: [],
    existingSupporter: options.existingSupporter ?? null,
    existingProfile: options.existingProfile ?? null,
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
});
