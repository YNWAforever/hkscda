import { describe, expect, test } from "bun:test";
import { AdminApiError } from "../../../lib/admin/session";

import {
  buildAdoptionGuideReleaseSearchParams,
  createAdoptionGuidePublishAttempt,
  fetchAdoptionGuideReleases,
  mutateAdoptionGuideRelease,
  presentAdoptionGuideReadiness,
  resolveMutationError,
  stepForReadinessField,
} from "./adoptionGuideReleaseLogic";

describe("adoptionGuideReleaseLogic", () => {
  test("builds trimmed and capped release search params", () => {
    expect(
      buildAdoptionGuideReleaseSearchParams({
        q: " cat ",
        species: "cat",
        state: "draft",
        page: 2,
      }).toString(),
    ).toBe("q=cat&species=cat&state=draft&page=2&pageSize=25");

    expect(
      buildAdoptionGuideReleaseSearchParams({
        q: `  ${"x".repeat(205)}  `,
        page: Number.POSITIVE_INFINITY,
        pageSize: 99,
      }).toString(),
    ).toBe(`q=${"x".repeat(200)}&page=1&pageSize=50`);
  });

  test("maps readiness fields to the correct editor step", () => {
    expect(stepForReadinessField("zhHkAssetId")).toBe("chinese_pdf");
    expect(stepForReadinessField("enAssetId")).toBe("english_pdf");
    expect(stepForReadinessField("knowledgeShortIntro")).toBe("knowledge");
    expect(stepForReadinessField("assets")).toBe("preview");
  });

  test("presents readiness issues with their editor steps", () => {
    expect(
      presentAdoptionGuideReadiness({
        ready: false,
        issues: [
          {
            field: "enAssetId",
            code: "english_asset_required",
            message: "English PDF is required.",
          },
        ],
      }),
    ).toEqual({
      ready: false,
      issues: [
        {
          field: "enAssetId",
          code: "english_asset_required",
          message: "English PDF is required.",
          step: "english_pdf",
        },
      ],
    });
  });

  test("keeps local values when the server reports a version conflict", () => {
    const localDraft = { topic: "Cat guide", expectedVersion: 3 };
    const conflictResponse = {
      status: 409,
      error: { code: "conflict", message: "Changed elsewhere." },
    };

    expect(resolveMutationError(conflictResponse, localDraft)).toEqual({
      kind: "conflict",
      message: "This release changed elsewhere. Reload before saving again.",
      preservedDraft: localDraft,
    });
  });
  test("keeps local values when fetchAdminJson reports a conflict", () => {
    const localDraft = { topic: "Cat guide", expectedVersion: 3 };

    expect(
      resolveMutationError(
        new AdminApiError({
          status: 409,
          code: "conflict",
          message: "This release changed elsewhere.",
        }),
        localDraft,
      ),
    ).toEqual({
      kind: "conflict",
      message: "This release changed elsewhere. Reload before saving again.",
      preservedDraft: localDraft,
    });
  });

  test("does not classify non-409 AdminApiError conflicts as version conflicts", () => {
    const localDraft = { topic: "Cat guide", expectedVersion: 3 };
    const error = new AdminApiError({
      status: 500,
      code: "conflict",
      message: "A server error occurred.",
    });

    expect(resolveMutationError(error, localDraft)).toEqual({
      kind: "error",
      message: "A server error occurred.",
    });
  });

  test("requires explicit 409 status on structured conflict responses", () => {
    const localDraft = { topic: "Cat guide", expectedVersion: 3 };

    expect(
      resolveMutationError(
        { status: 400, error: { code: "conflict", message: "Invalid request." } },
        localDraft,
      ),
    ).toEqual({
      kind: "error",
      message: "Unable to save this release.",
    });
  });

  test("fetches releases with the exact normalized query URL", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const response = { items: [], total: 0, page: 2, pageSize: 50 };
    const request = async <T>(path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return response as T;
    };

    await fetchAdoptionGuideReleases(
      {
        q: " cat ",
        species: "cat",
        state: "draft",
        page: 2,
        pageSize: 99,
      },
      request,
    ).catch(() => undefined);

    expect(calls).toEqual([
      {
        path: "/api/admin/adoption-guide-releases?q=cat&species=cat&state=draft&page=2&pageSize=50",
        init: undefined,
      },
    ]);
  });

  test("uses encoded IDs and PATCH JSON requests for saves", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const request = async <T>(path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return {} as T;
    };
    const payload = { topic: "Cat guide", expectedVersion: 3 };

    await mutateAdoptionGuideRelease("release/1", "save", payload, request).catch(() => undefined);

    expect(calls).toEqual([
      {
        path: "/api/admin/adoption-guide-releases/release%2F1",
        init: {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      },
    ]);
  });

  test("uses POST JSON requests for workflow transitions", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const request = async <T>(path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return {} as T;
    };
    const payload = { expectedVersion: 3 };
    const operations = ["submit", "withdraw", "return-to-draft"] as const;

    for (const operation of operations) {
      await mutateAdoptionGuideRelease("release 1", operation, payload, request);
    }

    expect(calls).toEqual(
      operations.map((operation) => ({
        path: `/api/admin/adoption-guide-releases/release%201/${operation}`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      })),
    );
  });

  test("reuses one complete publish request across retries", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    let generatedKeys = 0;
    const request = async <T>(path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return {} as T;
    };
    const attempt = createAdoptionGuidePublishAttempt({ expectedVersion: 3 }, () => {
      generatedKeys += 1;
      return "publish-attempt-1";
    });

    await mutateAdoptionGuideRelease("release-1", "publish", attempt.payload, request);
    await mutateAdoptionGuideRelease("release-1", "publish", attempt.payload, request);

    const expectedRequest = {
      path: "/api/admin/adoption-guide-releases/release-1/publish",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 3,
          idempotencyKey: "publish-attempt-1",
        }),
      },
    };
    expect(generatedKeys).toBe(1);
    expect(calls).toEqual([expectedRequest, expectedRequest]);
  });
  test("creates one publish idempotency key for retries of the same attempt", () => {
    const attempt = createAdoptionGuidePublishAttempt(
      { expectedVersion: 3 },
      () => "publish-attempt-1",
    );

    expect(attempt.payload).toEqual({
      expectedVersion: 3,
      idempotencyKey: "publish-attempt-1",
    });
    expect(attempt.payload).toBe(attempt.payload);
    expect(attempt.idempotencyKey).toBe("publish-attempt-1");
  });
});
