import { describe, expect, test } from "bun:test";
import {
  initialEmailSignInState,
  emailSignInReducer,
  normaliseSignInEmail,
  resendSecondsRemaining,
  safeEmailRedirect,
} from "./emailSignInState";

describe("progressive email sign-in", () => {
  test("validates and trims email before requesting a code", () => {
    expect(normaliseSignInEmail(" person@example.org ")).toBe("person@example.org");
    expect(normaliseSignInEmail("not an email")).toBeNull();
    expect(normaliseSignInEmail("person@ ")).toBeNull();
  });
  test("moves to code only after a successful send and starts cooldown", () => {
    const busy = emailSignInReducer(initialEmailSignInState, { type: "start" });
    expect(busy.stage).toBe("email");
    expect(busy.busy).toBe(true);
    const sent = emailSignInReducer(busy, { type: "sent", email: "person@example.org", now: 1000 });
    expect(sent).toMatchObject({
      stage: "code",
      busy: false,
      email: "person@example.org",
      resendAt: 61000,
    });
  });
  test("failed verification retains sent email and permits retry", () => {
    const sent = emailSignInReducer(initialEmailSignInState, {
      type: "sent",
      email: "person@example.org",
      now: 1000,
    });
    const failed = emailSignInReducer(sent, { type: "failed", message: "expired" });
    expect(failed).toMatchObject({
      stage: "code",
      email: "person@example.org",
      error: "expired",
      busy: false,
    });
    expect(emailSignInReducer(failed, { type: "start" }).error).toBe("");
  });
  test("editing clears code stage and error but preserves cooldown", () => {
    const sent = emailSignInReducer(initialEmailSignInState, {
      type: "sent",
      email: "person@example.org",
      now: 1000,
    });
    expect(emailSignInReducer(sent, { type: "edit" })).toMatchObject({
      stage: "email",
      error: "",
      resendAt: 61000,
    });
  });
  test("verified completion is distinct from code sent", () => {
    expect(emailSignInReducer(initialEmailSignInState, { type: "verified" })).toMatchObject({
      stage: "complete",
      busy: false,
    });
  });
  test("cooldown follows elapsed clock time, including background tabs", () => {
    expect(resendSecondsRemaining(61000, 1000)).toBe(60);
    expect(resendSecondsRemaining(61000, 60001)).toBe(1);
    expect(resendSecondsRemaining(61000, 90000)).toBe(0);
  });
  test("redirects stay same-origin and discard auth URL fragments", () => {
    expect(
      safeEmailRedirect(undefined, "https://example.org/volunteer?tab=book#access_token=secret"),
    ).toBe("https://example.org/volunteer?tab=book");
    expect(safeEmailRedirect("/internship", "https://example.org/volunteer")).toBe(
      "https://example.org/internship",
    );
    expect(
      safeEmailRedirect("https://attacker.org", "https://example.org/volunteer"),
    ).toBeUndefined();
    expect(
      safeEmailRedirect("javascript:alert(1)", "https://example.org/volunteer"),
    ).toBeUndefined();
    expect(safeEmailRedirect(undefined, undefined)).toBeUndefined();
  });
});
