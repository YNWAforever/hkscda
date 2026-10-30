import { expect, spyOn, test } from "bun:test";
import { jsonResponse, queryParams, requiredUuid, withErrors } from "./shared.server";

test("shared JSON responses retain headers and force no-store", async () => {
  const response = jsonResponse(
    { ok: true },
    {
      status: 201,
      headers: { "x-test": "preserved" },
    },
  );
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-test")).toBe("preserved");
});

test("invalid UUID responses retain validation-before-auth semantics", async () => {
  const response = await withErrors(async () => {
    requiredUuid({ id: "bad" }, "id");
    return jsonResponse({ unreachable: true });
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid id" });
});

test("queryParams returns decoded plain values", () => {
  expect(queryParams(new Request("https://x.test/?page=2&q=ginger%20cat"))).toEqual({
    page: "2",
    q: "ginger cat",
  });
});

test("missing-row RPC errors return 404", async () => {
  const response = await withErrors(async () => {
    throw { code: "P0002", message: "Task not found" };
  });
  expect(response.status).toBe(404);
});

test("plain PostgREST domain refusals return safe 4xx responses", async () => {
  for (const [message, status] of [
    ["Match must be approved before finalization", 409],
    ["Adoption case not found", 404],
    ["Invalid successful adoption outcome status", 400],
  ] as const) {
    const response = await withErrors(async () => {
      throw { code: "P0001", message, details: "Private database detail", hint: "Private hint" };
    });
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: message });
  }
});

test("unrecognized RPC messages and database details stay private", async () => {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const error of [
      { code: "P0001", message: "protected status: private database context" },
      { code: "XX000", message: "Adoption case is closed" },
      { code: "P0001", message: 42 },
    ]) {
      const response = await withErrors(async () => {
        throw { ...error, details: "Private database detail", hint: "Private hint" };
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Could not process coordinator request" });
    }
  } finally {
    logged.mockRestore();
  }
});

test("BUG-40: unique violations get a message for the constraint that was hit", async () => {
  async function conflict(constraint: string, details: string) {
    const response = await withErrors(async () => {
      throw {
        code: "23505",
        message: `duplicate key value violates unique constraint "${constraint}"`,
        details,
      };
    });
    expect(response.status).toBe(409);
    return ((await response.json()) as { error: string }).error;
  }

  const caseNumber = await conflict(
    "successful_adoption_case_number_key",
    "Key (case_number)=(AC-2026-001) already exists.",
  );
  const statusKey = await conflict(
    "coordinator_status_category_key_key",
    "Key (category, key)=(followup, open) already exists.",
  );
  const supporterEmail = await conflict(
    "supporter_email_key",
    "Key (email)=(ada@example.com) already exists.",
  );
  const other = await conflict("some_other_key", "Key (x)=(private value) already exists.");

  expect(caseNumber).toContain("case number");
  for (const error of [statusKey, supporterEmail, other]) {
    expect(error).not.toContain("case number");
  }
  expect(statusKey).toContain("status");
  expect(supporterEmail).toContain("email");
  expect(new Set([caseNumber, statusKey, supporterEmail, other]).size).toBe(4);
  // Database values in the details stay private.
  expect(supporterEmail).not.toContain("ada@example.com");
  expect(other).not.toContain("private value");
});
