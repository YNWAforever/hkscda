import { describe, expect, test } from "bun:test";

import { AdminApiError, AdminHttpError, AdminSessionError } from "./session";
import { isRevisionConflict } from "./revisionConflict";

describe("isRevisionConflict", () => {
  test("recognises the coded 409 the revision fences answer", () => {
    expect(
      isRevisionConflict(
        new AdminApiError({
          status: 409,
          code: "conflict",
          message: "FAQ entry changed; reload before saving",
        }),
      ),
    ).toBe(true);
  });

  test("does not treat other failures as a revision conflict", () => {
    expect(
      isRevisionConflict(new AdminApiError({ status: 400, code: "conflict", message: "x" })),
    ).toBe(false);
    expect(
      isRevisionConflict(new AdminApiError({ status: 409, code: "slug_taken", message: "x" })),
    ).toBe(false);
    expect(isRevisionConflict(new AdminHttpError("Save failed", 409))).toBe(false);
    expect(isRevisionConflict(new AdminSessionError("not_signed_in"))).toBe(false);
    expect(isRevisionConflict(new Error("conflict"))).toBe(false);
    expect(isRevisionConflict(null)).toBe(false);
    expect(isRevisionConflict(undefined)).toBe(false);
  });
});
