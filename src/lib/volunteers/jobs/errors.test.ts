import { expect, test } from "bun:test";
import { isVolunteerJobStage, safeJobFailure, volunteerJobFailureCodes } from "./errors";
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
  expect(safeJobFailure({ code: 42501 }, "finish", "correlation").code).toBe("UNEXPECTED");
});
test("fixed volunteer job codes and stages stay on one list", () => {
  for (const code of volunteerJobFailureCodes) {
    expect(
      safeJobFailure({ code, message: "private@example.invalid" }, "finish", "correlation"),
    ).toEqual({ code, stage: "finish", correlationId: "correlation" });
  }
  expect(isVolunteerJobStage("generate")).toBe(true);
  expect(isVolunteerJobStage("synthetic-private-stage")).toBe(false);
});
