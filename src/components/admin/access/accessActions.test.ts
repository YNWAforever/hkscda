import { describe, expect, mock, test } from "bun:test";

import { expectNoChineseText } from "../i18n/testing";
import {
  accessConfirmationRequest,
  accessConfirmationText,
  accessMutationSuccess,
  disabledRowAction,
  isOwnAccessRow,
} from "./accessActions";
import { accessCopy } from "./copy";

const target = { id: "u3", authUserId: "auth-u3", email: "u3@example.org", role: "admin" as const };

describe("access page actions", () => {
  test("BUG-56: a role change and a disable are confirmed with the user and the effect named", () => {
    const role = accessConfirmationText(
      { kind: "role", user: target, role: "staff" },
      accessCopy.en,
    );
    expect(role.title).toBe("Change role?");
    expect(role.consequence).toContain("u3@example.org");
    expect(role.consequence).toContain("Admin");
    expect(role.consequence).toContain("Staff");
    expect(role.destructive).toBe(true);
    expectNoChineseText(`${role.title} ${role.consequence} ${role.confirmLabel}`);

    const disable = accessConfirmationText({ kind: "disable", user: target }, accessCopy.zh);
    expect(disable.title).toBe("停用使用者？");
    expect(disable.consequence).toContain("u3@example.org");
    expect(disable.confirmLabel).toBe(accessCopy.zh.disable);
    expect(disable.destructive).toBe(true);
  });

  test("BUG-56: a role promotion is confirmed but not shown as destructive", () => {
    const promote = accessConfirmationText(
      { kind: "role", user: { ...target, role: "staff" }, role: "admin" },
      accessCopy.en,
    );
    expect(promote.destructive).toBe(false);
  });

  test("BUG-56: the confirmed action sends the same PATCH as before", () => {
    expect(accessConfirmationRequest({ kind: "role", user: target, role: "treasurer" })).toEqual({
      id: "u3",
      input: { role: "treasurer" },
    });
    expect(accessConfirmationRequest({ kind: "disable", user: target })).toEqual({
      id: "u3",
      input: { status: "disabled" },
    });
  });

  test("BUG-56: the signed-in admin's own row is recognised so its role menu can be disabled", () => {
    expect(isOwnAccessRow(target, "auth-u3")).toBe(true);
    expect(isOwnAccessRow(target, "auth-other")).toBe(false);
    expect(isOwnAccessRow(target, undefined)).toBe(false);
  });

  test("BUG-56: any successful action clears the error banner, then refreshes", async () => {
    const order: string[] = [];
    const setError = mock((value: string | null) => order.push(`error:${String(value)}`));
    const invalidate = mock(async () => {
      order.push("invalidate");
    });
    await accessMutationSuccess({ setError, invalidate })();
    expect(order).toEqual(["error:null", "invalidate"]);
  });
});

describe("disabled access rows", () => {
  const row = {
    status: "disabled" as const,
    invitedAt: "2026-10-01T02:30:00Z",
    inviteAcceptedAt: null as string | null,
  };

  test("BUG-55: a disabled user who never accepted the invite is re-invited, not reactivated", () => {
    expect(disabledRowAction(row)).toBe("reinvite");
    expect(disabledRowAction({ ...row, inviteAcceptedAt: "2026-10-02T02:30:00Z" })).toBe(
      "reactivate",
    );
    // An admin created before invites were tracked has neither date and is reactivated.
    expect(disabledRowAction({ ...row, invitedAt: null })).toBe("reactivate");
  });
});
