import { expect, test } from "bun:test";

import { AdminApiError, AdminHttpError } from "../../../lib/admin/session";
import { shouldRotateDraftKey } from "./draftIdempotency";

test("BUG-59: a 409 draft save rotates the idempotency key; other failures keep it for a safe retry", () => {
  expect(
    shouldRotateDraftKey(
      new AdminApiError({ status: 409, code: "idempotency_payload_changed", message: "x" }),
    ),
  ).toBe(true);
  expect(shouldRotateDraftKey(new AdminApiError({ status: 500, message: "x" }))).toBe(false);
  expect(shouldRotateDraftKey(new AdminHttpError("x", null))).toBe(false);
  expect(shouldRotateDraftKey(new Error("x"))).toBe(false);
  expect(shouldRotateDraftKey(null)).toBe(false);
});
