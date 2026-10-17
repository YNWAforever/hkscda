import { expect, test } from "bun:test";
import { safeJobFailure } from "./errors";
test("plain-object DB errors retain safe code and stage without message/SQL/provider text", () => {
  expect(
    safeJobFailure(
      { code: "22P02", message: "private@example.invalid" },
      "generate",
      "correlation",
    ),
  ).toEqual({ code: "22P02", stage: "generate", correlationId: "correlation" });
  expect(safeJobFailure(new Error("private@example.invalid"), "assess", "correlation").code).toBe(
    "UNEXPECTED",
  );
});
