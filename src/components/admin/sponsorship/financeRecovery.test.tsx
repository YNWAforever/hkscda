import React, { type ReactNode, type ReactElement } from "react";
import { beforeEach, expect, mock, test } from "bun:test";
// Coupling: this test calls the finance panel as a plain function and answers `useState` and
// `useRef` by call order, so a new `useState` or `useRef` in the panel, or a change to the order of
// the existing ones, needs a matching change in the mock below. The screen text is in
// SponsorshipEnglish.test.tsx, which renders the panel without this mock.
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
// The panel reads the language from React context, which this test does not mount, so the language
// hook answers from `language`, which is Chinese unless a test switches it.
let language: "zh" | "en" = "zh";
const realLanguage = await import("../adminI18n");
mock.module("../adminI18n", () => ({
  ...realLanguage,
  useAdminLanguage: () => ({
    language,
    copy: realLanguage.adminCopy[language],
    setLanguage: () => {},
  }),
}));
const realQuery = await import("@tanstack/react-query");
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQuery: () => ({
    isError: false,
    refetch: async () => ({}),
    data: {
      canRefund: true,
      canCoordinate: true,
      receipts: [],
      candidates: [],
      sources: [],
      refunds: [],
      deliveries: [],
    },
  }),
}));
// What every request to the API fails with.
let failWith: unknown = null;
mock.module("../adoptions/api", () => ({
  fetchCoordinatorJson: async () => {
    if (failWith !== null) throw failWith;
    return {};
  },
}));
const { AdminSessionError } = await import("../../../lib/admin/session");
const { FinancePanel } = await import("./FinancePanel");

type Props = { children?: ReactNode; role?: string; onClick?: () => Promise<void> };
function walk(node: ReactNode, result: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, result);
  } else if (React.isValidElement<Props>(node)) {
    result.push(node);
    walk(node.props.children, result);
  }
  return result;
}
const pledge = {
  id: "22222222-2222-4222-8222-222222222222",
  supporterId: "supporter-1",
  status: "needs_followup",
  updatedAt: "2026-10-01T02:30:00Z",
  contactSubmission: null,
  proofHistory: [],
  periods: [],
} as never;
function render() {
  hookIndex = 0;
  return FinancePanel({ pledge, onChanged: async () => {} });
}
const button = (label: string) => walk(render()).find((n) => n.props.children === label);
const alertText = () =>
  String(walk(render()).find((n) => n.props.role === "alert")?.props.children);

beforeEach(() => {
  state.length = 0;
  language = "zh";
  failWith = null;
});

test("an action refused for a reason is shown with that reason, in either language", async () => {
  failWith = new Error("Payment proof not found");
  await button("建立截至本月的跟進月份")!.props.onClick!();
  expect(alertText()).toBe("Payment proof not found");
  language = "en";
  expect(alertText()).toBe("Payment proof not found");
});

test("an action that fails without a reason is written in the language it is shown in", async () => {
  failWith = "no reason";
  await button("建立截至本月的跟進月份")!.props.onClick!();
  expect(alertText()).toBe("未能完成操作");
  language = "en";
  expect(alertText()).toBe("Could not complete the action. Refresh the page and try again.");
});

test("retrying the notifications that fails is written in the language it is shown in", async () => {
  failWith = "no reason";
  await button("重試待傳送通知")!.props.onClick!();
  expect(alertText()).toBe("通知重試失敗");
  language = "en";
  expect(alertText()).toBe("Could not retry the notifications. Try again in a moment.");
});

test("a signed-out session says to sign in again, in the language it is shown in", async () => {
  failWith = new AdminSessionError("not_signed_in");
  await button("建立截至本月的跟進月份")!.props.onClick!();
  expect(alertText()).toBe("未登入");
  language = "en";
  expect(alertText()).toBe("Not signed in. Sign in again.");
});
