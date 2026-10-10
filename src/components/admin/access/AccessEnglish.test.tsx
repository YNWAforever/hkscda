import { describe, expect, mock, test } from "bun:test";

import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

const realQuery = await import("@tanstack/react-query");

type QueryState = Record<string, unknown>;
const idle = { isLoading: false, isError: false, error: null, isFetching: false };
let users: QueryState = {};
let audit: QueryState = {};

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false }),
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    if (options.queryKey[0] === "admin-access-users") return { ...idle, ...users };
    if (options.queryKey[0] === "admin-access-audit") return { ...idle, ...audit };
    return { data: { admin: { authUserId: "auth-me", role: "admin", status: "active" } } };
  },
}));

const { AccessManagement } = await import("./AccessManagement");
const { accessCopy } = await import("./copy");

const SENT = "2026-10-01T02:30:00Z";
const UPDATED = "2026-10-07T00:30:00Z";

function user(id: string, status: "active" | "pending" | "disabled", role = "staff") {
  return {
    id,
    authUserId: id === "u1" ? "auth-me" : `auth-${id}`,
    email: `${id}@example.org`,
    role,
    status,
    invitedAt: SENT,
    inviteSentAt: id === "u2" ? SENT : null,
    inviteAcceptedAt: null,
    lastInvitedBy: null,
    createdAt: SENT,
    updatedAt: UPDATED,
  };
}

const loadedUsers = {
  data: {
    users: [
      user("u1", "active", "admin"),
      user("u2", "pending"),
      user("u3", "disabled", "treasurer"),
    ],
    summary: { active: 1, pending: 1, disabled: 1 },
  },
};

const loadedAudit = {
  data: {
    audit: [
      {
        id: "a1",
        actorUserId: "u1",
        action: "admin_user.invite",
        entityId: "u2",
        detail: { targetEmail: "u2@example.org" },
        timestamp: SENT,
      },
      {
        id: "a2",
        actorUserId: "u1",
        action: "admin_user.role_update",
        entityId: "u3",
        detail: {},
        timestamp: UPDATED,
      },
      {
        id: "a3",
        actorUserId: "u1",
        action: "admin_user.some_new_action",
        entityId: "u3",
        detail: {},
        timestamp: UPDATED,
      },
    ],
    hasMore: true,
  },
};

describe("access management in English", () => {
  test("shows the users, the summary and the history without Chinese", () => {
    users = loadedUsers;
    audit = loadedAudit;
    const markup = renderAdminInEnglish(<AccessManagement />);
    expectNoChineseText(markup);
    for (const text of [
      "Access management",
      "Manage admin users, invitations and recent access changes.",
      "Invite user",
      "Active users",
      "Invite pending",
      "Disabled users",
      "Invite pending",
      "Disabled",
      "Resend",
      "Reactivate",
      "You",
      "Recent history",
      "Invited",
      "Changed role",
      ">Previous<",
      "Page 1",
      ">Next<",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toMatch(/<h1[^>]*>Access management<\/h1>/);
    // An action code the screen does not know is shown as sent.
    expect(markup).toContain("admin_user.some_new_action");
  });

  test("shows dates in the Hong Kong English format", () => {
    users = loadedUsers;
    audit = loadedAudit;
    const markup = renderAdminInEnglish(<AccessManagement />);
    expect(markup).toContain("1 Oct 2026 (Thu) 10:30");
    expect(markup).toContain("7 Oct 2026 (Wed) 08:30");
  });

  test("shows no users and no history in English", () => {
    users = { data: { users: [], summary: { active: 0, pending: 0, disabled: 0 } } };
    audit = { data: { audit: [], hasMore: false } };
    const markup = renderAdminInEnglish(<AccessManagement />);
    expectNoChineseText(markup);
    expect(markup).toContain("No admin users found");
    expect(markup).toContain("No access management history yet.");
  });

  test("shows the loading and failure states in English", () => {
    users = { isLoading: true };
    audit = { isLoading: true };
    expectNoChineseText(renderAdminInEnglish(<AccessManagement />));

    users = { isError: true, error: new Error("boom") };
    audit = { isError: true, error: new Error("boom") };
    const markup = renderAdminInEnglish(<AccessManagement />);
    expectNoChineseText(markup);
    expect(markup).toContain("Could not load");
    expect(markup).toContain("Could not load the history.");
    expect(markup).toContain(">Retry<");
  });

  test("has no Chinese anywhere in the English copy", () => {
    expectNoChineseInCopy(accessCopy.en);
    expect(accessCopy.en.dateTime(null)).toBe("—");
  });
});

describe("access management in Chinese", () => {
  test("is unchanged", () => {
    users = loadedUsers;
    audit = loadedAudit;
    const markup = renderAdminInChinese(<AccessManagement />);
    for (const text of [
      "權限管理",
      "管理後台使用者、邀請及最近權限變更紀錄。",
      "邀請使用者",
      "啟用使用者",
      "待接受邀請",
      "已停用使用者",
      "重發",
      "重新啟用",
      "你",
      "最近紀錄",
      "邀請",
      "更新角色",
      "上一頁",
      "第 1 頁",
      "下一頁",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toMatch(/<h1[^>]*>權限管理<\/h1>/);
  });

  test("writes the Chinese times in the shared Hong Kong date and time", () => {
    users = loadedUsers;
    audit = loadedAudit;
    const markup = renderAdminInChinese(<AccessManagement />);
    // SENT is 02:30Z, 10:30 in Hong Kong.
    expect(markup).toContain("2026年10月1日 (四) 10:30");
    expect(accessCopy.zh.dateTime(null)).toBe("—");
  });

  test("shows the failure messages in Chinese", () => {
    users = { isError: true, error: new Error("boom") };
    audit = { isError: true, error: new Error("boom") };
    const markup = renderAdminInChinese(<AccessManagement />);
    expect(markup).toContain("無法載入");
    expect(markup).toContain("未能載入紀錄。");
    expect(markup).toContain(">重試<");
  });
});

/** The text of every status pill (`StatusPill` / `StatusBadge`): the span after its dot. */
function pillLabels(markup: string): string[] {
  return [...markup.matchAll(/aria-hidden="true"><\/span><span>([^<]*)<\/span>/g)].map((m) => m[1]);
}

describe("access status pills", () => {
  test("shows each user's status as a pill with the same wording in Chinese and English", () => {
    users = loadedUsers;
    audit = loadedAudit;
    expect(pillLabels(renderAdminInChinese(<AccessManagement />))).toEqual([
      "啟用",
      "待接受邀請",
      "已停用",
    ]);
    expect(pillLabels(renderAdminInEnglish(<AccessManagement />))).toEqual([
      "Active",
      "Invite pending",
      "Disabled",
    ]);
  });
});
