import { describe, expect, test } from "bun:test";

import {
  persistSubmittedApplication,
  sendSubmittedApplicationNotificationSafely,
} from "./submit-application.functions";

const publicApplicationId = "99999999-aaaa-4bbb-8ccc-dddddddddddd";

const validApplication = {
  animal_id: "77777777-8888-4333-8444-555555555555",
  animal_name: "Mochi",
  animal_type: "cat",
  applicant_name: "Ada",
  phone: "9123 4567",
  email: "ada@example.com",
  address: "HK Island",
  housing_type: "私人樓宇" as const,
  family_size: 3,
  existing_pets: "",
  reason: "I can provide a safe home.",
};

function createApplicationClient(options: { deleteError?: unknown } = {}) {
  const calls: Array<{ name: string; payload?: unknown }> = [];
  const client = {
    from(table: string) {
      calls.push({ name: "from", payload: table });
      return {
        insert(payload: unknown) {
          calls.push({ name: "insert", payload });
          return {
            select(columns: string) {
              calls.push({ name: "select", payload: columns });
              return {
                async single() {
                  calls.push({ name: "single" });
                  return { data: { id: publicApplicationId }, error: null };
                },
              };
            },
          };
        },
        delete() {
          calls.push({ name: "delete" });
          return {
            async eq(column: string, value: string) {
              calls.push({ name: "delete.eq", payload: { column, value } });
              return { error: options.deleteError ?? null };
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

describe("persistSubmittedApplication", () => {
  test("inserts the public application through the service client and bridges the returned id", async () => {
    const { client, calls } = createApplicationClient();
    const repo = { name: "repo" };
    let repositoryClient: unknown;
    let serviceRepo: unknown;
    const bridgeCalls: unknown[] = [];

    await expect(
      persistSubmittedApplication(validApplication, {
        hasServiceRoleKey: () => true,
        createServiceClient: () => client,
        createCoordinatorRepository(serviceClient) {
          repositoryClient = serviceClient;
          return repo;
        },
        createCoordinatorService({ repo: createdRepo }) {
          serviceRepo = createdRepo;
          return {
            async createCaseFromPublicApplication(input) {
              bridgeCalls.push(input);
              return { id: "case-1" };
            },
          };
        },
      }),
    ).resolves.toEqual({ id: publicApplicationId });

    expect(repositoryClient).toBe(client);
    expect(serviceRepo).toBe(repo);
    expect(calls).toEqual([
      { name: "from", payload: "adoption_applications" },
      {
        name: "insert",
        payload: {
          animal_id: validApplication.animal_id,
          animal_name: validApplication.animal_name,
          animal_type: validApplication.animal_type,
          applicant_name: validApplication.applicant_name,
          phone: validApplication.phone,
          email: validApplication.email,
          address: validApplication.address,
          housing_type: validApplication.housing_type,
          family_size: validApplication.family_size,
          existing_pets: validApplication.existing_pets,
          reason: validApplication.reason,
        },
      },
      { name: "select", payload: "id" },
      { name: "single" },
    ]);
    expect(bridgeCalls).toEqual([
      {
        publicApplicationId,
        input: validApplication,
      },
    ]);
  });

  test("maps missing service role configuration to the public save error before DB writes", async () => {
    let createdClient = false;
    const logs: unknown[][] = [];

    await expect(
      persistSubmittedApplication(validApplication, {
        hasServiceRoleKey: () => false,
        createServiceClient() {
          createdClient = true;
          return createApplicationClient().client;
        },
        createCoordinatorRepository() {
          throw new Error("should not create repository");
        },
        createCoordinatorService() {
          throw new Error("should not create service");
        },
        logger: {
          error(...args: unknown[]) {
            logs.push(args);
          },
        },
      }),
    ).rejects.toThrow("Failed to save application");

    expect(createdClient).toBe(false);
    expect(logs[0]?.[0]).toBe(
      "Missing SUPABASE_SERVICE_ROLE_KEY; cannot save adoption application.",
    );
  });

  test("cleans up the public application if coordinator case creation fails", async () => {
    const { client, calls } = createApplicationClient();
    const caseError = new Error("case insert failed");
    const logs: unknown[][] = [];

    await expect(
      persistSubmittedApplication(validApplication, {
        hasServiceRoleKey: () => true,
        createServiceClient: () => client,
        createCoordinatorRepository() {
          return {};
        },
        createCoordinatorService() {
          return {
            async createCaseFromPublicApplication() {
              throw caseError;
            },
          };
        },
        logger: {
          error(...args: unknown[]) {
            logs.push(args);
          },
        },
      }),
    ).rejects.toThrow("Failed to save application");

    expect(calls).toContainEqual({ name: "delete" });
    expect(calls).toContainEqual({
      name: "delete.eq",
      payload: { column: "id", value: publicApplicationId },
    });
    expect(logs[0]).toEqual([
      "Failed to create adoption coordinator case from public application",
      caseError,
    ]);
  });

  test("logs cleanup failures while preserving the public save error", async () => {
    const cleanupError = new Error("delete failed");
    const { client } = createApplicationClient({ deleteError: cleanupError });
    const logs: unknown[][] = [];

    await expect(
      persistSubmittedApplication(validApplication, {
        hasServiceRoleKey: () => true,
        createServiceClient: () => client,
        createCoordinatorRepository() {
          return {};
        },
        createCoordinatorService() {
          return {
            async createCaseFromPublicApplication() {
              throw new Error("case insert failed");
            },
          };
        },
        logger: {
          error(...args: unknown[]) {
            logs.push(args);
          },
        },
      }),
    ).rejects.toThrow("Failed to save application");

    expect(logs).toContainEqual([
      "Failed to clean up public adoption application after coordinator case failure",
      cleanupError,
    ]);
  });

  test("logs notification failures without rejecting after persistence succeeds", async () => {
    const module = await import("./submit-application.functions");
    const sendError = new Error("resend unavailable");
    const sentPayloads: unknown[] = [];
    const logs: unknown[][] = [];

    await expect(
      module.sendSubmittedApplicationNotification(validApplication, {
        emails: {
          async send(payload: unknown) {
            sentPayloads.push(payload);
            throw sendError;
          },
        },
        logger: {
          error(...args: unknown[]) {
            logs.push(args);
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(sentPayloads[0]).toMatchObject({
      from: "HKSCDA <noreply@hkscda.com>",
      to: "adoption@hkscda.com",
      subject: `新領養申請：${validApplication.animal_name}（${validApplication.applicant_name}）`,
    });
    expect(logs).toEqual([["Failed to send adoption application notification", sendError]]);
  });

  test("logs notification setup failures without rejecting after persistence succeeds", async () => {
    const setupError = new Error("missing resend api key");
    const logs: unknown[][] = [];

    await expect(
      sendSubmittedApplicationNotificationSafely(validApplication, {
        createEmails() {
          throw setupError;
        },
        logger: {
          error(...args: unknown[]) {
            logs.push(args);
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(logs).toEqual([["Failed to prepare adoption application notification", setupError]]);
  });
});
