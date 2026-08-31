import { describe, expect, test } from "bun:test";

import {
  SubmissionValidationError,
  parseAdoptionSubmission,
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
  failUpdateTable?: string;
  supporterId?: string | null;
  storageObjects?: Array<{ fileName: string; sizeBytes: number; mimeType: string }>;
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
      failUpdateTable?: string;
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
        : this.action === "update" && this.state.failUpdateTable === this.table
          ? { data: null, error: new Error(`update failed: ${this.table}`) }
          : { data: this.mutationPayload, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

const DEFAULT_STORAGE_OBJECTS = [{ fileName: "home.jpg", sizeBytes: 10, mimeType: "image/jpeg" }];

function createFakeClient(options: FakeClientOptions = {}) {
  const state = {
    calls: [] as QueryCall[],
    storageCalls: [] as StorageCall[],
    failInsertTable: options.failInsertTable,
    failUpdateTable: options.failUpdateTable,
    supporterId: options.supporterId === undefined ? "supporter-1" : options.supporterId,
    storageObjects: options.storageObjects ?? DEFAULT_STORAGE_OBJECTS,
  };

  const client = {
    from(table: string) {
      return new FakeQuery(state, table);
    },
    storage: {
      from(bucket: string) {
        return {
          async list(folder: string, opts?: { search?: string }) {
            state.storageCalls.push({ bucket, method: "list", path: folder, options: opts });
            const match = state.storageObjects.find((object) => object.fileName === opts?.search);
            return {
              data: match
                ? [
                    {
                      name: match.fileName,
                      metadata: { size: match.sizeBytes, mimetype: match.mimeType },
                    },
                  ]
                : [],
              error: null,
            };
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
      dogTimeWindows: ["weekend_afternoon"],
      catTimeWindows: ["weekend_morning"],
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

function photoRef(
  category: string,
  fileName: string,
  overrides: Partial<{ mimeType: string; sizeBytes: number; storagePath: string | undefined }> = {},
) {
  const descriptor: Record<string, unknown> = {
    category,
    fileName,
    mimeType: overrides.mimeType ?? "image/jpeg",
    sizeBytes: overrides.sizeBytes ?? 10,
  };
  if (!("storagePath" in overrides) || overrides.storagePath !== undefined) {
    descriptor.storagePath = overrides.storagePath ?? `${applicationId}/${category}/${fileName}`;
  }
  return descriptor;
}

function submissionBody(
  payload: Record<string, unknown> = validPayload(),
  photos: Record<string, unknown>[] = [photoRef("home", "home.jpg")],
  overrides: Record<string, unknown> = {},
) {
  // The real request body carries `turnstileToken` as a top-level sibling of
  // `payload` (see `parseAdoptionSubmission`, which reads `raw.turnstileToken`
  // rather than `raw.payload.turnstileToken`) — hoist it out of the test
  // payload builder's convenience field so submissionBody() matches that shape.
  return {
    payload,
    applicationId,
    photos,
    turnstileToken: typeof payload.turnstileToken === "string" ? payload.turnstileToken : undefined,
    ...overrides,
  };
}

function parsedSubmission(): ParsedAdoptionMultipart & { applicationId: string } {
  return parseAdoptionSubmission(submissionBody());
}

function coordinatorService(queryCalls?: QueryCall[]) {
  const calls: unknown[] = [];
  return {
    calls,
    service: {
      async createCaseFromPublicApplication(input: unknown) {
        calls.push(input);
        queryCalls?.push({
          table: "coordinator",
          method: "createCaseFromPublicApplication",
          payload: input,
        });
        return { id: caseId };
      },
    },
  };
}

function callsFor(calls: QueryCall[], table: string, method: string) {
  return calls.filter((call) => call.table === table && call.method === method);
}

function callIndex(calls: QueryCall[], table: string, method: string) {
  return calls.findIndex((call) => call.table === table && call.method === method);
}

describe("parseAdoptionSubmission", () => {
  test("parses expanded payload, turnstile token, applicationId, and photo descriptors", () => {
    const parsed = parseAdoptionSubmission(submissionBody());

    expect(parsed.applicationId).toBe(applicationId);
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
        storagePath: `${applicationId}/home/home.jpg`,
      }),
    ]);
  });

  test("requires one to six photos", () => {
    expect(() => parseAdoptionSubmission(submissionBody(validPayload(), []))).toThrow(
      "At least one adoption photo is required",
    );

    expect(() =>
      parseAdoptionSubmission(
        submissionBody(validPayload(), [
          photoRef("home", "1.jpg"),
          photoRef("home", "2.jpg"),
          photoRef("home", "3.jpg"),
          photoRef("home", "4.jpg"),
          photoRef("home", "5.jpg"),
          photoRef("home", "6.jpg"),
          photoRef("home", "7.jpg"),
        ]),
      ),
    ).toThrow("No more than 6 adoption photos can be uploaded");
  });

  test("rejects a body missing applicationId", () => {
    const body = submissionBody();
    delete (body as { applicationId?: unknown }).applicationId;

    expect(() => parseAdoptionSubmission(body)).toThrow("Missing adoption application id");
  });

  test("rejects a photo entry missing storagePath", () => {
    const body = submissionBody(validPayload(), [
      photoRef("home", "home.jpg", { storagePath: undefined }),
    ]);

    expect(() => parseAdoptionSubmission(body)).toThrow(
      "Missing storage path for an adoption photo",
    );
  });

  test("accepts a valid body and returns the expected shape", () => {
    const parsed = parseAdoptionSubmission(submissionBody());

    expect(parsed).toEqual({
      applicationId,
      payload: expect.objectContaining({ turnstileToken: "turnstile-token" }),
      photos: [
        {
          category: "home",
          fileName: "home.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 10,
          storagePath: `${applicationId}/home/home.jpg`,
        },
      ],
    });
  });
});

describe("persistPublicAdoptionJourney", () => {
  test("persists the expanded journey, private photos, status token, and coordinator case", async () => {
    const { client, state } = createFakeClient();
    const coordinator = coordinatorService(state.calls);

    const result = await persistPublicAdoptionJourney({
      client,
      parsed: parsedSubmission(),
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
        method: "list",
        path: `${applicationId}/home`,
        options: { search: "home.jpg" },
      }),
    );
    expect(state.calls).toContainEqual({
      table: "adoption_applications",
      method: "insert",
      payload: expect.objectContaining({ id: applicationId }),
      options: undefined,
    });
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
      table: "adoption_application_visit_preference",
      method: "insert",
      payload: expect.objectContaining({
        dog_time_windows: ["weekend_afternoon"],
        cat_time_windows: ["weekend_morning"],
        preferred_time_windows: ["weekend_morning", "weekend_afternoon"],
      }),
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
        adoption_case_id: null,
        lane: "new_adoption_application",
        urgency: "normal",
      }),
      options: undefined,
    });
    expect(state.calls).toContainEqual({
      table: "adoption_intake_item",
      method: "update",
      payload: { adoption_case_id: caseId },
    });
    expect(callIndex(state.calls, "public_status_token", "insert")).toBeLessThan(
      callIndex(state.calls, "coordinator", "createCaseFromPublicApplication"),
    );
    expect(callIndex(state.calls, "adoption_intake_item", "insert")).toBeLessThan(
      callIndex(state.calls, "coordinator", "createCaseFromPublicApplication"),
    );
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
            dogTimeWindows: ["weekend_afternoon"],
            catTimeWindows: ["weekend_morning"],
          },
        },
      },
    });
  });

  test("throws SubmissionValidationError and never inserts the application when an uploaded photo is missing from storage", async () => {
    const { client, state } = createFakeClient({ storageObjects: [] });
    const coordinator = coordinatorService();

    await expect(
      persistPublicAdoptionJourney({
        client,
        parsed: parsedSubmission(),
        coordinatorService: coordinator.service,
        now: () => new Date("2026-07-02T00:00:00.000Z"),
        createStatusTokenPair: () => ({
          rawToken: "raw-status-token",
          tokenHash: "hashed-status-token",
        }),
        appUrl: "https://example.test",
        logger: { error() {} },
      }),
    ).rejects.toThrow(SubmissionValidationError);

    expect(callsFor(state.calls, "adoption_applications", "insert")).toHaveLength(0);
    expect(coordinator.calls).toHaveLength(0);
  });

  test("removes the compatibility row when a later insert fails", async () => {
    const { client, state } = createFakeClient({
      failInsertTable: "adoption_application_detail",
    });
    const coordinator = coordinatorService();

    await expect(
      persistPublicAdoptionJourney({
        client,
        parsed: parsedSubmission(),
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

    expect(state.storageCalls.filter((call) => call.method === "remove")).toHaveLength(0);
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

  test("does not create a coordinator case if status token persistence fails", async () => {
    const { client, state } = createFakeClient({
      failInsertTable: "public_status_token",
    });
    const coordinator = coordinatorService();

    await expect(
      persistPublicAdoptionJourney({
        client,
        parsed: parsedSubmission(),
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

    expect(coordinator.calls).toHaveLength(0);
    expect(callsFor(state.calls, "public_status_token", "delete")).toHaveLength(1);
    expect(state.calls).toContainEqual({
      table: "public_status_token",
      method: "eq",
      payload: { column: "entity_id", value: applicationId },
    });
  });

  test("does not fail after creating the coordinator case when intake link update fails", async () => {
    const { client, state } = createFakeClient({
      failUpdateTable: "adoption_intake_item",
    });
    const coordinator = coordinatorService();

    await expect(
      persistPublicAdoptionJourney({
        client,
        parsed: parsedSubmission(),
        coordinatorService: coordinator.service,
        now: () => new Date("2026-07-02T00:00:00.000Z"),
        createStatusTokenPair: () => ({
          rawToken: "raw-status-token",
          tokenHash: "hashed-status-token",
        }),
        appUrl: "https://example.test",
        logger: { error() {} },
      }),
    ).resolves.toMatchObject({
      applicationId,
      caseId,
      statusUrl: "https://example.test/adoption/status/raw-status-token",
    });

    expect(coordinator.calls).toHaveLength(1);
    expect(state.calls).toContainEqual({
      table: "adoption_intake_item",
      method: "update",
      payload: { adoption_case_id: caseId },
    });
    expect(callsFor(state.calls, "adoption_applications", "delete")).toHaveLength(0);
    expect(state.storageCalls.filter((call) => call.method === "remove")).toHaveLength(0);
  });
});

describe("sendAdoptionConfirmationEmail", () => {
  test("queues a confirmation message and leaves it queued when Resend has no API key", async () => {
    const { client, state } = createFakeClient();
    const parsed = parsedSubmission();

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
    const messageInsert = callsFor(state.calls, "message", "insert")[0]!;
    const persistedMessagePayload = (messageInsert.payload as { payload: Record<string, unknown> })
      .payload;
    expect(persistedMessagePayload).not.toHaveProperty("statusUrl");
    expect(JSON.stringify(persistedMessagePayload)).not.toContain("raw-status-token");
  });
});
