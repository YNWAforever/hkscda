import { afterAll, afterEach, beforeAll, expect, mock, spyOn } from "bun:test";

import { expectNoChineseText } from "../../components/admin/i18n/testing";
import type { VolunteerServerErrorCode } from "./serverErrors";

/**
 * What the two files that drive the volunteer API handlers through `fetchAdminJson` share
 * (`adminVolunteerServerMessages.test.ts` and `adminVolunteerPolicyServerMessages.test.ts`). It holds no
 * test of its own; it is named like a test file so that the scan of the server code skips it.
 *
 * The mocks must be installed before anything loads the Supabase client, so importing this module installs
 * them, and what needs them is loaded later by `loadHarness()`. A test file imports this module first, with
 * `await import`, calls `installHarnessHooks()` once at its top level and awaits `loadHarness()`.
 */
mock.module("../supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "session-token", user: { id: "auth-1" } } },
      }),
    },
  },
}));

/** What the handlers that create their own database client are given. */
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
mock.module("../donations/supabase.server", () => ({
  createSupabaseServiceClient: () => ({ rpc: async () => rpcResult }),
  requireAdmin: async () => ({ authUserId: "admin-1" }),
}));

/** What the next database call of those handlers answers; it is reset after every test. */
export function setRpcResult(result: { data: unknown; error: unknown }) {
  rpcResult = result;
}

const originalFetch = globalThis.fetch;
// The handlers log the failures they hide from the browser; the log is not what is tested here.
const quiet = [
  spyOn(console, "error").mockImplementation(() => {}),
  spyOn(console, "info").mockImplementation(() => {}),
];

/** Registers the hooks that keep one test from leaking into the next. Call it once per test file. */
export function installHarnessHooks() {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    rpcResult = { data: null, error: null };
  });
  afterAll(() => quiet.forEach((spy) => spy.mockRestore()));
  beforeAll(() => {
    quiet.forEach((spy) => spy.mockClear());
  });
}

export const get = (path: string) => new Request("http://localhost" + path);
export const post = (path: string, body: unknown) =>
  new Request("http://localhost" + path, { method: "POST", body: JSON.stringify(body) });

/** The helpers that read the error the way the browser does. Call it after the mocks are installed. */
export async function loadHarness() {
  const { AdminApiError, fetchAdminJson } = await import("../admin/session");
  const { volunteerAdminErrorMessage } = await import("./adminErrors");
  const { volunteerServerErrorCode, volunteerServerErrorText } = await import("./serverErrors");

  /** The error the admin screen gets when the handler answers with `respond()`. */
  async function reach(respond: () => Response | Promise<Response>): Promise<unknown> {
    globalThis.fetch = (async () => respond()) as unknown as typeof fetch;
    return fetchAdminJson("/api/admin/volunteers/anything", {
      method: "POST",
      body: "{}",
    }).catch((error: unknown) => error);
  }

  /** Checks one message end to end: the browser gets Chinese, the English admin gets English. */
  function expectReaches(error: unknown, code: VolunteerServerErrorCode | null, status: number) {
    expect(error).toBeInstanceOf(AdminApiError);
    const failure = error as InstanceType<typeof AdminApiError>;
    expect(failure.status).toBe(status);
    const english = volunteerAdminErrorMessage(failure, "en") ?? "";
    expectNoChineseText(english);
    expect(english.length).toBeGreaterThan(20);
    if (code) {
      expect(failure.message).toBe(volunteerServerErrorText(code));
      expect(volunteerServerErrorCode(failure.message)).toBe(code);
      expect(english).toBe(volunteerServerErrorText(code, "en"));
    }
    // The Chinese admin still gets exactly the text it always did.
    expect(volunteerAdminErrorMessage(failure, "zh")).toBe(failure.message);
    return failure;
  }

  return { reach, expectReaches };
}
