import { describe, expect, test } from "bun:test";
import {
  CONFIRM_REASON_MAX_LENGTH,
  canConfirm,
  requiredReasonDialog,
} from "@/components/admin/confirmActionState";
import { REQUIRED_REASON_MAX, optionalReasonSchema, requiredReasonSchema } from "./requiredReason";

describe("requiredReasonSchema", () => {
  test("trims", () => {
    expect(requiredReasonSchema.parse("  ok  ")).toBe("ok");
  });
  test("rejects whitespace only", () => {
    expect(() => requiredReasonSchema.parse("   ")).toThrow();
  });
  test("accepts 500 characters and rejects 501", () => {
    expect(requiredReasonSchema.parse("x".repeat(500))).toHaveLength(500);
    expect(() => requiredReasonSchema.parse("x".repeat(501))).toThrow();
  });
  test("optionalReasonSchema accepts undefined but still validates a value", () => {
    expect(optionalReasonSchema.parse(undefined)).toBeUndefined();
    expect(() => optionalReasonSchema.parse("   ")).toThrow();
  });
});

describe("dialog preset", () => {
  test("the dialog cap is the schema cap", () => {
    expect(CONFIRM_REASON_MAX_LENGTH).toBe(REQUIRED_REASON_MAX);
  });
  test("requiredReasonDialog needs at least one non-blank character", () => {
    expect(requiredReasonDialog).toEqual({ required: true, minLength: 1 });
    expect(canConfirm(requiredReasonDialog, "   ", false)).toBe(false);
    expect(canConfirm(requiredReasonDialog, " a ", false)).toBe(true);
  });
});
