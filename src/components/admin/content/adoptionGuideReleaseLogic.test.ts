import { describe, expect, test } from "bun:test";
import { AdminApiError } from "../../../lib/admin/session";

import {
  buildAdoptionGuideReleaseSearchParams,
  createAdoptionGuidePublishAttempt,
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
    const conflictResponse = { error: { code: "conflict", message: "Changed elsewhere." } };

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
