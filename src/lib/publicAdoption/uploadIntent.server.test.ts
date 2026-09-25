import { describe, expect, test } from "bun:test";
import { hashStatusToken } from "./statusToken.server";
import {
  cleanupExpiredAdoptionUploads,
  hasCompletedAdoptionApplication,
  validateAdoptionUploadIntent,
  type AdoptionUploadIntent,
} from "./uploadIntent.server";

const applicationId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const path = `${applicationId}/home/home.jpg`;
const token = "raw-status-token";

function intent(overrides: Partial<AdoptionUploadIntent> = {}): AdoptionUploadIntent {
  return {
    applicationId,
    photoPaths: [path],
    statusTokenHash: hashStatusToken(token),
    expiresAt: "2026-09-26T00:00:00.000Z",
    submittedAt: null,
    ...overrides,
  };
}

describe("adoption upload intents", () => {
  test("binds the token, application ID and exact paths before submission", () => {
    const input = {
      applicationId,
      statusToken: token,
      photoPaths: [path],
    };
    expect(validateAdoptionUploadIntent(intent(), input, new Date("2026-09-25T00:00:00Z"))).toBe(
      true,
    );
    expect(
      validateAdoptionUploadIntent(
        intent(),
        { ...input, statusToken: "other" },
        new Date("2026-09-25T00:00:00Z"),
      ),
    ).toBe(false);
    expect(
      validateAdoptionUploadIntent(
        intent(),
        { ...input, photoPaths: [`${applicationId}/home/other.jpg`] },
        new Date("2026-09-25T00:00:00Z"),
      ),
    ).toBe(false);
    expect(validateAdoptionUploadIntent(intent(), input, new Date("2026-09-27T00:00:00Z"))).toBe(
      false,
    );
  });

  test("requires a coordinator case before treating a retry as completed", async () => {
    const queries: string[] = [];
    const client = {
      from(table: string) {
        queries.push(table);
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      },
    } as never;
    expect(
      await hasCompletedAdoptionApplication(client, applicationId, token, "a".repeat(64)),
    ).toBe("new");
    expect(queries).toEqual(["adoption_case", "adoption_applications"]);
  });

  test("reports a summary-only application as still processing", async () => {
    const queries: string[] = [];
    const client = {
      from(table: string) {
        queries.push(table);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: table === "adoption_applications" ? { id: applicationId } : null,
                error: null,
              }),
            }),
          }),
        };
      },
    } as never;

    expect(
      await hasCompletedAdoptionApplication(client, applicationId, token, "a".repeat(64)),
    ).toBe("processing");
    expect(queries).toEqual(["adoption_case", "adoption_applications"]);
  });

  test("recovers only the original completed application details", async () => {
    const filters: Array<[string, unknown]> = [];
    const client = {
      from(table: string) {
        const query = {
          select() {
            return query;
          },
          eq(column: string, value: unknown) {
            filters.push([column, value]);
            return query;
          },
          async maybeSingle() {
            return {
              data:
                table === "adoption_case"
                  ? { id: "case-1" }
                  : {
                      submission_fingerprint: "a".repeat(64),
                      expires_at: "2099-01-01T00:00:00.000Z",
                      revoked_at: null,
                    },
              error: null,
            };
          },
        };
        return query;
      },
    } as never;
    expect(
      await hasCompletedAdoptionApplication(client, applicationId, token, "a".repeat(64)),
    ).toBe("recovered");
    expect(
      await hasCompletedAdoptionApplication(client, applicationId, token, "b".repeat(64)),
    ).toBe("conflict");
    expect(filters).toContainEqual(["token_hash", hashStatusToken(token)]);
  });

  test("does not recover an expired status token", async () => {
    const client = {
      from(table: string) {
        const query = {
          select() {
            return query;
          },
          eq() {
            return query;
          },
          async maybeSingle() {
            return {
              data:
                table === "adoption_case"
                  ? { id: "case-1" }
                  : {
                      submission_fingerprint: "a".repeat(64),
                      expires_at: "2026-09-24T00:00:00.000Z",
                      revoked_at: null,
                    },
              error: null,
            };
          },
        };
        return query;
      },
    } as never;
    expect(
      await hasCompletedAdoptionApplication(
        client,
        applicationId,
        token,
        "a".repeat(64),
        new Date("2026-09-25T00:00:00.000Z"),
      ),
    ).toBe("expired");
  });

  test("removes expired unsubmitted photos, but preserves an existing application", async () => {
    const removed: string[][] = [];
    const deleted: string[] = [];
    const marked: string[] = [];
    const port = {
      listExpired: async () => [
        intent(),
        intent({
          applicationId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
          photoPaths: ["bbbbbbbb-cccc-4ddd-8eee-ffffffffffff/home/home.jpg"],
        }),
      ],
      hasApplication: async (id: string) => id !== applicationId,
      removePhotos: async (paths: string[]) => {
        removed.push(paths);
      },
      deleteIntent: async (id: string) => {
        deleted.push(id);
      },
      markSubmitted: async (id: string) => {
        marked.push(id);
      },
    };
    const result = await cleanupExpiredAdoptionUploads(port);
    expect(result).toEqual({ removed: 1, preserved: 1, failed: 0 });
    expect(removed).toEqual([[path]]);
    expect(deleted).toEqual([applicationId]);
    expect(marked).toEqual(["bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"]);
  });

  test("keeps an intent for retry if Storage removal fails", async () => {
    const deleted: string[] = [];
    const result = await cleanupExpiredAdoptionUploads(
      {
        listExpired: async () => [intent()],
        hasApplication: async () => false,
        removePhotos: async () => {
          throw new Error("storage unavailable");
        },
        deleteIntent: async (id: string) => {
          deleted.push(id);
        },
        markSubmitted: async () => {},
      },
      { error() {} },
    );
    expect(result).toEqual({ removed: 0, preserved: 0, failed: 1 });
    expect(deleted).toEqual([]);
  });
});
