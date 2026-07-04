import { describe, expect, test } from "bun:test";

import { loadSupporterAdoptionContext } from "./adoptionContext.server";

type TableName =
  | "adopter_profile"
  | "adoption_case"
  | "adoption_followup"
  | "successful_adoption"
  | "coordinator_status"
  | "animals";

type FakeRows = Record<TableName, Record<string, unknown>[]>;

class FakeQuery {
  private eqFilters: Array<{ column: string; value: unknown }> = [];
  private inFilters: Array<{ column: string; value: unknown[] }> = [];

  constructor(
    private readonly rows: FakeRows,
    private readonly table: TableName,
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.eqFilters.push({ column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.inFilters.push({ column, value });
    return this;
  }

  order() {
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    const filtered = this.rows[this.table]
      .filter((row) => this.eqFilters.every((filter) => row[filter.column] === filter.value))
      .filter((row) =>
        this.inFilters.every((filter) => filter.value.includes(row[filter.column] as never)),
      );
    return { data: filtered, error: null };
  }
}

function fakeClient(rows: Partial<FakeRows>) {
  const allRows: FakeRows = {
    adopter_profile: [],
    adoption_case: [],
    adoption_followup: [],
    successful_adoption: [],
    coordinator_status: [],
    animals: [],
    ...rows,
  };

  return {
    from(table: TableName) {
      return new FakeQuery(allRows, table);
    },
  };
}

function crmClient(rows: Partial<FakeRows>) {
  return fakeClient(rows) as unknown as Parameters<typeof loadSupporterAdoptionContext>[0];
}

describe("loadSupporterAdoptionContext", () => {
  test("loads linked profiles, cases, follow-ups, successful adoptions, statuses, and animals", async () => {
    const context = await loadSupporterAdoptionContext(
      crmClient({
        adopter_profile: [
          {
            id: "profile-1",
            supporter_id: "supporter-1",
            name_english: "Ada Wong",
            name_chinese: "黃雅達",
            birthday: "1990-01-01",
            address: "HK Island",
            household_size: "3",
            is_blacklisted: false,
            blacklist_reason: null,
            created_at: "2026-06-01T10:00:00.000Z",
            updated_at: "2026-06-02T10:00:00.000Z",
            supporter: {
              id: "supporter-1",
              name: "Ada",
              email: "ada@example.com",
              phone: "9123 4567",
            },
            living_area: { name_zh: "香港島", name_en: "Hong Kong Island" },
          },
        ],
        adoption_case: [
          {
            id: "case-1",
            supporter_id: "supporter-1",
            adopter_profile_id: "profile-1",
            status_id: "status-case",
            requested_animal_id: "animal-1",
            animal_type: "cat",
            applicant_name: "Ada",
            applicant_phone: "9123 4567",
            applicant_email: "ada@example.com",
            closed_at: null,
            created_at: "2026-06-03T10:00:00.000Z",
          },
        ],
        adoption_followup: [
          {
            id: "task-1",
            adoption_case_id: "case-1",
            adopter_profile_id: "profile-1",
            status_id: "status-task",
            title: "Home visit",
            task_type: "home_visit",
            priority: "normal",
            due_at: "2026-06-04T10:00:00.000Z",
            scheduled_at: null,
            completed_at: null,
            volunteer: "May",
            contact_channel: "phone",
            created_at: "2026-06-03T12:00:00.000Z",
            updated_at: "2026-06-03T12:00:00.000Z",
          },
        ],
        successful_adoption: [
          {
            id: "success-1",
            adoption_case_id: "case-1",
            supporter_id: "supporter-1",
            adopter_profile_id: "profile-1",
            case_number: "AD-2026-0001",
            animal_id: "animal-1",
            adoption_fee_cents: 80000,
            approval_date: "2026-06-05T10:00:00.000Z",
            pickup_date: null,
          },
        ],
        coordinator_status: [
          {
            id: "status-case",
            key: "screening",
            label_zh: "篩選中",
            label_en: "Screening",
            color: "blue",
          },
          {
            id: "status-task",
            key: "scheduled",
            label_zh: "已安排",
            label_en: "Scheduled",
            color: "coral",
          },
        ],
        animals: [{ id: "animal-1", name: "Mochi", name_en: "Momo" }],
      }),
      "supporter-1",
    );

    expect(context.profiles).toEqual([
      {
        id: "profile-1",
        displayName: "黃雅達 / Ada Wong",
        email: "ada@example.com",
        phone: "9123 4567",
        livingArea: "香港島",
        isBlacklisted: false,
        birthday: "1990-01-01",
        address: "HK Island",
        householdSize: "3",
        blacklistReason: null,
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-02T10:00:00.000Z",
      },
    ]);
    expect(context.cases[0]).toMatchObject({
      id: "case-1",
      requestedAnimalName: "Mochi",
      status: { key: "screening", labelZh: "篩選中", labelEn: "Screening" },
    });
    expect(context.followups[0]).toMatchObject({
      id: "task-1",
      status: { key: "scheduled", labelZh: "已安排", labelEn: "Scheduled" },
    });
    expect(context.successfulAdoptions[0]).toMatchObject({
      id: "success-1",
      animalName: "Mochi",
      adoptionFeeCents: 80000,
    });
  });

  test("loads directly supporter-linked cases when no adopter profile exists", async () => {
    const context = await loadSupporterAdoptionContext(
      crmClient({
        adoption_case: [
          {
            id: "case-1",
            supporter_id: "supporter-1",
            adopter_profile_id: null,
            status_id: "status-case",
            requested_animal_id: null,
            animal_type: "dog",
            applicant_name: "Ada",
            applicant_phone: "9123 4567",
            applicant_email: null,
            closed_at: null,
            created_at: "2026-06-03T10:00:00.000Z",
          },
        ],
        coordinator_status: [
          {
            id: "status-case",
            key: "new",
            label_zh: "新個案",
            label_en: "New",
            color: "amber",
          },
        ],
      }),
      "supporter-1",
    );

    expect(context.profiles).toEqual([]);
    expect(context.cases).toHaveLength(1);
    expect(context.cases[0].adopterProfileId).toBeNull();
  });
});
