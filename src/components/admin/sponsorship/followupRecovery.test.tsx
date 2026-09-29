import React, { type ReactNode, type ReactElement } from "react";
import { beforeEach, expect, mock, test } from "bun:test";
const chosen = "33333333-3333-4333-8333-333333333333";
let hookIndex = 0;
const state: unknown[] = [];
mock.module("react", () => ({
  ...React,
  useRef: <T,>(value: T) => {
    const index = hookIndex++;
    if (!(index in state)) state[index] = { current: value };
    return state[index] as { current: T };
  },
  useState: <T,>(initial: T | (() => T)) => {
    const index = hookIndex++;
    if (!(index in state))
      state[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [
      state[index] as T,
      (value: T | ((current: T) => T)) => {
        state[index] =
          typeof value === "function" ? (value as (current: T) => T)(state[index] as T) : value;
      },
    ];
  },
}));
const actualCopy = await import("../adminPageCopy");
mock.module("../adminPageCopy", () => ({
  ...actualCopy,
  useAdminPageCopy: () => ({ language: "zh", pageCopy: actualCopy.adminPageCopy.zh }),
}));
const original = {
  id: "22222222-2222-4222-8222-222222222222",
  status: "needs_followup",
  followupVersion: 1,
  followupAssigneeUserId: null as string | null,
  supporterName: "Synthetic",
  supporterEmail: null,
  supporterPhone: null,
  amountCents: 10000,
  monthlyTier: "100",
  createdAt: "2026-09-30",
  preferences: [],
  proofHistory: [],
  currentProof: null,
  assignments: [],
  periods: [],
  recentAuditLog: [],
};
let pledge = { ...original },
  mode: "lost" | "refresh_fail" | "conflict" | "unknown" = "lost",
  posts = 0,
  reads = 0;
const bodies: Array<{ assigneeUserId: string; expectedVersion: number }> = [];
const refetch = async () => {
  reads++;
  if (mode === "refresh_fail" || mode === "unknown")
    return { error: Error("Synthetic unavailable") };
  pledge = {
    ...pledge,
    followupAssigneeUserId: mode === "conflict" ? original.id : chosen,
    followupVersion: 2,
  };
  return { data: { pledge }, error: null };
};
mock.module("@tanstack/react-query", () => ({
  queryOptions: (value: unknown) => value,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({}),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) =>
    queryKey[0] === "sponsorship-pledge"
      ? { data: { pledge }, refetch }
      : queryKey[0] === "sponsorship-followup-assignees"
        ? {
            data: {
              assignees: [{ authUserId: chosen, email: "staff@example.invalid", role: "staff" }],
            },
          }
        : { data: { admin: { role: "staff" } } },
}));
mock.module("../adoptions/api", () => ({
  fetchCoordinatorJson: async (_url: string, options: { body: string }) => {
    bodies.push(JSON.parse(options.body));
    posts++;
    if (mode !== "refresh_fail") throw Error("Response lost");
    return { pledgeId: pledge.id, assigneeUserId: chosen, version: 2, replayed: false };
  },
}));
const { PledgeDetailDrawer } = await import("./PledgeDetailDrawer");
type Props = {
  children?: ReactNode;
  role?: string;
  id?: string;
  onClick?: () => Promise<void>;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
};
function walk(node: ReactNode, result: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, result);
  } else if (React.isValidElement<Props>(node)) {
    result.push(node);
    walk(node.props.children, result);
  }
  return result;
}
function render() {
  hookIndex = 0;
  return PledgeDetailDrawer({ pledgeId: pledge.id, onClose: () => {}, onChanged: () => {} });
}
async function assign() {
  const select = walk(render()).find(
    (n) =>
      n.props.onValueChange &&
      walk(n.props.children).some((c) => c.props.id === "pledge-followup-assignee"),
  );
  select!.props.onValueChange!(chosen);
  const button = walk(render()).find((n) => n.props.children === "分派跟進");
  await button!.props.onClick!();
}
beforeEach(() => {
  state.length = 0;
  pledge = { ...original };
  posts = 0;
  bodies.length = 0;
  reads = 0;
  mode = "lost";
});
test("lost POST response followed by matching owner/version clears failure", async () => {
  await assign();
  expect(posts).toBe(1);
  expect(reads).toBe(1);
  expect(pledge.followupVersion).toBe(2);
  expect(walk(render()).filter((n) => n.props.role === "alert")).toHaveLength(0);
});
test("known committed assignment is not called failed when refresh is unavailable", async () => {
  mode = "refresh_fail";
  await assign();
  expect(posts).toBe(1);
  expect(
    walk(render()).some(
      (n) => n.props.role === "status" && String(n.props.children).includes("已儲存"),
    ),
  ).toBe(true);
});
test("a different recovered owner remains a conflict", async () => {
  mode = "conflict";
  await assign();
  expect(walk(render()).some((n) => n.props.role === "alert")).toBe(true);
});
test("an unreadable recovery never claims success", async () => {
  mode = "unknown";
  await assign();
  expect(walk(render()).some((n) => n.props.role === "alert")).toBe(true);
});

test("an unknown retry keeps its original version after a background refresh", async () => {
  mode = "unknown";
  await assign();
  pledge = { ...pledge, followupAssigneeUserId: original.id, followupVersion: 3 };
  const button = walk(render()).find((n) => n.props.children === "分派跟進");
  await button!.props.onClick!();
  expect(bodies).toEqual([
    { assigneeUserId: chosen, expectedVersion: 1 },
    { assigneeUserId: chosen, expectedVersion: 1 },
  ]);
});
