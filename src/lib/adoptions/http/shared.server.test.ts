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

test("BUG-42: foreign-key misses are 404 and check violations are 400, details private", async () => {
  const foreignKey = await withErrors(async () => {
    throw {
      code: "23503",
      message:
        'insert or update on table "animal_match" violates foreign key constraint "animal_match_adoption_case_id_fkey"',
      details: 'Key (adoption_case_id)=(private-id) is not present in table "adoption_case".',
    };
  });
  const check = await withErrors(async () => {
    throw {
      code: "23514",
      message: 'new row for relation "adoption_followup" violates check constraint "private_check"',
      details: "Failing row contains (private-row).",
    };
  });

  expect(foreignKey.status).toBe(404);
  expect(check.status).toBe(400);
  for (const response of [foreignKey, check]) {
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("private");
  }
});

test("BUG-42: match-creation refusals from the RPC are 409s", async () => {
  for (const message of [
    "Animal is not available for matching",
    "Animal already has an active match for this case",
    "Adoption case is closed",
    "Adoption case already finalized",
  ]) {
    const response = await withErrors(async () => {
      throw { code: "P0001", message, details: "Private database detail" };
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: message });
  }
});

test("BUG-33: a second return is a 409 and an unknown adoption is a 404", async () => {
  const twice = await withErrors(async () => {
    throw { code: "P0001", message: "Adoption already returned", details: "Private detail" };
  });
  expect(twice.status).toBe(409);
  expect(await twice.json()).toEqual({ error: "Adoption already returned" });

  const missing = await withErrors(async () => {
    throw { code: "P0002", message: "Successful adoption not found" };
  });
  expect(missing.status).toBe(404);

  const noReason = await withErrors(async () => {
    throw { code: "P0001", message: "reason_required" };
  });
  expect(noReason.status).toBe(400);
});

/** The unique violation the manual-intake new-supporter insert raises (OPS-04). */
function duplicateSupporterEmail(email: string) {
  return {
    code: "23505",
    message: 'duplicate key value violates unique constraint "supporter_email_key"',
    details: `Key (email)=(${email}) already exists.`,
    hint: null,
  };
}

test("OPS-04: a soft-deleted supporter's email returns a distinct supporter_archived 409", async () => {
  const lookedUp: string[] = [];
  const response = await withErrors(
    async () => {
      throw duplicateSupporterEmail("Ada@Example.test");
    },
    {
      lookupSupporterByEmail: async (email) => {
        lookedUp.push(email);
        return { deletedAt: "2026-11-01T00:00:00.000Z" };
      },
    },
  );

  expect(lookedUp).toEqual(["Ada@Example.test"]);
  expect(response.status).toBe(409);
  const body = (await response.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe("supporter_archived");
  expect(body.error.message).toContain("archived supporter");
  expect(body.error.message).toContain("treasurer or admin");
  expect(body.error.message).toContain("without the email");
  // The database's clashing value stays private.
  expect(JSON.stringify(body)).not.toContain("Ada@Example.test");
});

test("OPS-04: an active supporter keeps the existing choose-the-supporter 409", async () => {
  const response = await withErrors(
    async () => {
      throw duplicateSupporterEmail("active@example.test");
    },
    { lookupSupporterByEmail: async () => ({ deletedAt: null }) },
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: "A supporter with this email already exists. Choose the existing supporter instead.",
  });
});

test("OPS-04: an unknown email keeps the generic unique-constraint 409", async () => {
  const response = await withErrors(
    async () => {
      throw duplicateSupporterEmail("nobody@example.test");
    },
    { lookupSupporterByEmail: async () => null },
  );

  expect(response.status).toBe(409);
  const body = (await response.json()) as { error: unknown };
  expect(typeof body.error).toBe("string");
});

test("OPS-04: a failed lookup falls back to the generic 409 instead of a 500", async () => {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await withErrors(
      async () => {
        throw duplicateSupporterEmail("ada@example.test");
      },
      {
        lookupSupporterByEmail: async () => {
          throw new Error("lookup unavailable");
        },
      },
    );
    expect(response.status).toBe(409);
    expect(typeof ((await response.json()) as { error: unknown }).error).toBe("string");
    expect(logged).toHaveBeenCalled();
  } finally {
    logged.mockRestore();
  }
});

test("OPS-04: only the supporter email constraint consults the manual-intake lookup", async () => {
  let lookups = 0;
  const response = await withErrors(
    async () => {
      throw {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "successful_adoption_case_number_key"',
        details: "Key (case_number)=(AC-2026-001) already exists.",
      };
    },
    {
      lookupSupporterByEmail: async () => {
        lookups += 1;
        return { deletedAt: "2026-11-01T00:00:00.000Z" };
      },
    },
  );

  expect(lookups).toBe(0);
  expect(response.status).toBe(409);
  expect(typeof ((await response.json()) as { error: unknown }).error).toBe("string");
});
