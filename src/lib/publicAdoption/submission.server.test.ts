import { describe, expect, test } from "bun:test";

import {
  parseAdoptionMultipart,
  persistPublicAdoptionJourney,
  sendAdoptionConfirmationEmail,
  type ParsedAdoptionMultipart,
  type PublicAdoptionSupabaseClient,
} from "./submission.server";

const applicationId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const caseId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const primaryAnimalId = "11111111-2222-4333-8444-555555555555";
const secondAnimalId = "22222222-3333-4333-8444-555555555555";

type QueryCall = {
  table: string;
  method: string;
  payload?: unknown;
  options?: unknown;
};

type StorageCall = {
  bucket: string;
  method: string;
  path?: string;
  paths?: string[];
  options?: unknown;
};

type FakeClientOptions = {
  failInsertTable?: string;
  supporterId?: string | null;
};

class FakeQuery {
  private action: "insert" | "select" | "delete" | "update" | null = null;
  private selectedColumns: string | null = null;
  private mutationPayload: unknown;
  private eqFilters: Array<{ column: string; value: unknown }> = [];

  constructor(
    private readonly state: {
      calls: QueryCall[];
      failInsertTable?: string;
      supporterId: string | null;
    },
    private readonly table: string,
  ) {}

  insert(payload: unknown, options?: unknown) {
    this.state.calls.push({ table: this.table, method: "insert", payload, options });
    this.action = "insert";
    this.mutationPayload = payload;
    return this;
  }

  select(columns: string) {
    this.state.calls.push({ table: this.table, method: "select", payload: columns });
    if (!this.action) this.action = "select";
    this.selectedColumns = columns;
    return this;
  }

  update(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "update", payload });
    this.action = "update";
    this.mutationPayload = payload;
    return this;
  }

  delete() {
    this.state.calls.push({ table: this.table, method: "delete" });
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "eq", payload: { column, value } });
    this.eqFilters.push({ column, value });
    return this;
  }

  async single() {
    this.state.calls.push({ table: this.table, method: "single" });
    if (this.action === "insert" && this.state.failInsertTable === this.table) {
      return { data: null, error: new Error(`insert failed: ${this.table}`) };
    }
    if (this.table === "adoption_applications") return { data: { id: applicationId }, error: null };
    if (this.table === "message") return { data: { id: "message-1" }, error: null };
    return { data: this.mutationPayload ?? { id: `${this.table}-id` }, error: null };
  }

  async maybeSingle() {
    this.state.calls.push({ table: this.table, method: "maybeSingle" });
    if (this.table === "adoption_case") {
      return { data: { supporter_id: this.state.supporterId }, error: null };
    }
    return { data: null, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const result =
      this.action === "insert" && this.state.failInsertTable === this.table
        ? { data: null, error: new Error(`insert failed: ${this.table}`) }
        : { data: this.mutationPayload, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

function createFakeClient(options: FakeClientOptions = {}) {
  const state = {
    calls: [] as QueryCall[],
    storageCalls: [] as StorageCall[],
    failInsertTable: options.failInsertTable,
    supporterId: options.supporterId === undefined ? "supporter-1" : options.supporterId,
  };

  const client = {
    from(table: string) {
      return new FakeQuery(state, table);
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, _file: File, options?: unknown) {
            state.storageCalls.push({ bucket, method: "upload", path, options });
            return { data: { path }, error: null };
          },
          async remove(paths: string[]) {
            state.storageCalls.push({ bucket, method: "remove", paths });
            return { data: paths, error: null };
          },
        };
      },
    },
  };

  return {
    state,
    client: client as unknown as PublicAdoptionSupabaseClient,
  };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    language: "en",
    animalPreferences: [
      {
        rank: 2,
        animalId: secondAnimalId,
        animalName: "Biscuit",
        animalType: "dog",
      },
      {
        rank: 1,
        animalId: primaryAnimalId,
        animalName: "Mochi",
        animalType: "cat",
      },
    ],
    contact: {
      applicantName: "Ada",
      phone: "9123 4567",
      email: "ada@example.com",
      address: "HK Island",
      preferredContactMethod: "whatsapp",
      householdSize: 3,
    },
    home: {
      housingType: "私人樓宇",
      landlordRestrictions: "",
      windowDoorSafety: "Window nets installed",
      indoorSpaceNotes: "Quiet home",
      homeModificationsPossible: true,
    },
    readiness: {
      currentPets: "",
      petCareExperience: "Previous adopter",
      householdAgreement: "Everyone agrees",
      dailySchedule: "Home evenings",
      monthlyBudgetHkd: 1200,
      emergencyCarePlan: "Family backup",
      reason: "I can provide a safe and stable home.",
    },
    visit: {
      dateRangeStart: "2026-07-10",
      dateRangeEnd: "2026-07-12",
      preferredTimeWindows: ["weekend_morning"],
      notes: "Call first",
    },
    terms: {
      agreed: true,
      version: "adoption-terms-2026-07",
    },
    sourceMetadata: {
      source: "wizard",
    },
    turnstileToken: "turnstile-token",
    ...overrides,
  };
}

function multipartRequest(payload = validPayload(), photos: File[] = [photo("home.jpg")]) {
  const formData = new FormData();
  formData.set("payload", JSON.stringify(payload));
  photos.forEach((file, index) => {
    const category = index % 2 === 0 ? "home" : "window";
    formData.append(`photo:${category}`, file);
  });
  return new Request("https://example.test/api/adoption/applications", {
    method: "POST",
    body: formData,
  });
}

function photo(name: string, type = "image/jpeg") {
  return new File(["fake-image"], name, { type });
}

async function parsedMultipart(): Promise<ParsedAdoptionMultipart> {
  return parseAdoptionMultipart(multipartRequest());
}

function coordinatorService() {
  const calls: unknown[] = [];
  return {
    calls,
    service: {
      async createCaseFromPublicApplication(input: unknown) {
        calls.push(input);
        return { id: caseId };
      },
    },
  };
}

describe("parseAdoptionMultipart", () => {
  test("parses expanded payload, turnstile token, and photo descriptors", async () => {
    const parsed = await parseAdoptionMultipart(multipartRequest());

    expect(parsed.payload.turnstileToken).toBe("turnstile-token");
    expect(parsed.payload.animalPreferences.map((animal) => animal.animalName)).toEqual([
      "Mochi",
      "Biscuit",
    ]);
    expect(parsed.photos).toEqual([
      expect.objectContaining({
        category: "home",
        fileName: "home.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
      }),
    ]);
  });

  test("requires one to six photos", async () => {
    await expect(parseAdoptionMultipart(multipartRequest(validPayload(), []))).rejects.toThrow(
      "At least one adoption photo is required",
    );

    await expect(
      parseAdoptionMultipart(
        multipartRequest(validPayload(), [
          photo("1.jpg"),
          photo("2.jpg"),
          photo("3.jpg"),
          photo("4.jpg"),
          photo("5.jpg"),
          photo("6.jpg"),
          photo("7.jpg"),
        ]),
      ),
    ).rejects.toThrow("No more than 6 adoption photos can be uploaded");
  });
});

describe("persistPublicAdoptionJourney", () => {
  test("persists the expanded journey, private photos, status token, and coordinator case", async () => {
    const { client, state } = createFakeClient();
    const coordinator = coordinatorService();

    const result = await persistPublicAdoptionJourney({
      client,
      parsed: await parsedMultipart(),
      coordinatorService: coordinator.service,
      now: () => new Date("2026-07-02T00:00:00.000Z"),
      createStatusTokenPair: () => ({
        rawToken: "raw-status-token",
        tokenHash: "hashed-status-token",
      }),
      appUrl: "https://example.test",
    });

    expect(result).toEqual({
      applicationId,
      caseId,
      reference: "APP-AAAAAAAA",
      statusToken: "raw-status-token",
      statusUrl: "https://example.test/adoption/status/raw-status-token",
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
    expect(state.storageCalls).toContainEqual(
      expect.objectContaining({
        bucket: "adoption-application-photos",
        method: "upload",
        path: `${applicationId}/home/home.jpg`,
      }),
    );
    expect(state.calls).toContainEqual({
      table: "adoption_application_photo",
      method: "insert",
      payload: [
        expect.objectContaining({
          public_application_id: applicationId,
          storage_bucket: "adoption-application-photos",
          storage_path: `${applicationId}/home/home.jpg`,
          photo_category: "home",
        }),
      ],
      options: undefined,
    });
    expect(state.calls).toContainEqual({
      table: "public_status_token",
      method: "insert",
      payload: expect.objectContaining({
        token_hash: "hashed-status-token",
        entity_type: "adoption_application",
        entity_id: applicationId,
        expires_at: "2026-08-01T00:00:00.000Z",
      }),
      options: undefined,
    });
    expect(state.calls).toContainEqual({
      table: "adoption_intake_item",
      method: "insert",
      payload: expect.objectContaining({
        public_application_id: applicationId,
        adoption_case_id: caseId,
        lane: "new_adoption_application",
        urgency: "normal",
      }),
      options: undefined,
    });
    expect(coordinator.calls[0]).toMatchObject({
      publicApplicationId: applicationId,
      input: {
        animal_id: primaryAnimalId,
        animal_name: "Mochi",
        preferences: {
          language: "en",
          rankedAnimals: [
            expect.objectContaining({ animalName: "Mochi", rank: 1 }),
            expect.objectContaining({ animalName: "Biscuit", rank: 2 }),
          ],
          visit: {
            dateRangeStart: "2026-07-10",
            preferredTimeWindows: ["weekend_morning"],
          },
        },
      },
    });
  });

  test("removes uploaded files and compatibility row when a later insert fails", async () => {
    const { client, state } = createFakeClient({
      failInsertTable: "adoption_application_detail",
    });
    const coordinator = coordinatorService();

    await expect(
      persistPublicAdoptionJourney({
        client,
        parsed: await parsedMultipart(),
        coordinatorService: coordinator.service,
        now: () => new Date("2026-07-02T00:00:00.000Z"),
        createStatusTokenPair: () => ({
          rawToken: "raw-status-token",
          tokenHash: "hashed-status-token",
        }),
        appUrl: "https://example.test",
        logger: { error() {} },
      }),
    ).rejects.toThrow("Failed to save adoption application");

    expect(state.storageCalls).toContainEqual({
      bucket: "adoption-application-photos",
      method: "remove",
      paths: [`${applicationId}/home/home.jpg`],
    });
    expect(state.calls).toContainEqual({
      table: "adoption_applications",
      method: "delete",
    });
    expect(state.calls).toContainEqual({
      table: "adoption_applications",
      method: "eq",
      payload: { column: "id", value: applicationId },
    });
  });
});

describe("sendAdoptionConfirmationEmail", () => {
  test("queues a confirmation message and leaves it queued when Resend has no API key", async () => {
    const { client, state } = createFakeClient();
    const parsed = await parsedMultipart();

    await expect(
      sendAdoptionConfirmationEmail(
        client,
        parsed.payload,
        {
          applicationId,
          caseId,
          reference: "APP-AAAAAAAA",
          statusToken: "raw-status-token",
          statusUrl: "https://example.test/adoption/status/raw-status-token",
          expiresAt: "2026-08-01T00:00:00.000Z",
        },
        {
          getEmailConfig: () => ({
            resendApiKey: undefined,
            from: "HKSCDA <noreply@example.test>",
            replyTo: "info@example.test",
            notificationEmail: "info@example.test",
          }),
        },
      ),
    ).resolves.toBe("queued");

    expect(state.calls).toContainEqual({
      table: "message",
      method: "insert",
      payload: expect.objectContaining({
        supporter_id: "supporter-1",
        channel: "email",
        status: "queued",
        payload: expect.objectContaining({
          kind: "adoption_confirmation",
          applicationId,
          reference: "APP-AAAAAAAA",
        }),
      }),
      options: undefined,
    });
  });
});
