import { describe, expect, test } from "bun:test";
import {
  completeAdminPasswordReset,
  getAdminPasswordResetRedirect,
  requestAdminPasswordReset,
  validateAdminPassword,
  type PasswordRecoveryAuth,
} from "./passwordRecovery";

function makeAuth(overrides: Partial<PasswordRecoveryAuth> = {}): PasswordRecoveryAuth {
  return {
    resetPasswordForEmail: async () => ({ error: null }),
    updateUser: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
    ...overrides,
  };
}

describe("admin password recovery", () => {
  test("builds the reset route without a duplicate slash", () => {
    expect(getAdminPasswordResetRedirect("https://hkscda.vercel.app/")).toBe(
      "https://hkscda.vercel.app/admin/reset-password",
    );
  });

  test("normalizes email and requests a recovery link for the reset route", async () => {
    const calls: unknown[] = [];
    const auth = makeAuth({
      resetPasswordForEmail: async (email, options) => {
        calls.push({ email, options });
        return { error: null };
      },
    });

    expect(
      await requestAdminPasswordReset({
        auth,
        email: " Admin@Example.COM ",
        origin: "https://hkscda.vercel.app",
      }),
    ).toEqual({ ok: true });
    expect(calls).toEqual([
      {
        email: "admin@example.com",
        options: { redirectTo: "https://hkscda.vercel.app/admin/reset-password" },
      },
    ]);
  });

  test("returns a safe provider failure without exposing its message", async () => {
    const result = await requestAdminPasswordReset({
      auth: makeAuth({
        resetPasswordForEmail: async () => ({ error: new Error("email not found") }),
      }),
      email: "admin@example.com",
      origin: "https://hkscda.vercel.app",
    });
    expect(result).toEqual({ ok: false, reason: "provider_error" });
  });

  test("rejects short and mismatched passwords", () => {
    expect(validateAdminPassword("short", "short")).toBe("too_short");
    expect(validateAdminPassword("long-enough", "different")).toBe("mismatch");
    expect(validateAdminPassword("long-enough", "long-enough")).toBeNull();
  });

  test("updates the password and signs out the recovery session", async () => {
    const calls: string[] = [];
    const result = await completeAdminPasswordReset({
      auth: makeAuth({
        updateUser: async ({ password }) => {
          calls.push(`update:${password}`);
          return { error: null };
        },
        signOut: async () => {
          calls.push("sign-out");
          return { error: null };
        },
      }),
      password: "new-password",
      confirmation: "new-password",
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(["update:new-password", "sign-out"]);
  });

  test("does not call Supabase when client validation fails", async () => {
    let updateCalls = 0;
    const result = await completeAdminPasswordReset({
      auth: makeAuth({
        updateUser: async () => {
          updateCalls += 1;
          return { error: null };
        },
      }),
      password: "short",
      confirmation: "short",
    });
    expect(result).toEqual({ ok: false, reason: "too_short" });
    expect(updateCalls).toBe(0);
  });
});
