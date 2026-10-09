import React, { type ReactNode, type ReactElement } from "react";
import { beforeEach, expect, mock, test } from "bun:test";
// Coupling: this test calls the panel as a plain function and answers `useState`, `useRef` and
// `useEffect` by call order, so a new hook in the panel, or a change to the order of the existing
// ones, needs a matching change in the mock below. The screen text is in
// SponsorshipEnglish.test.tsx, which renders the panel without this mock.
const state: unknown[] = [],
  effects: Array<() => void | (() => void)> = [],
  cleanups: Array<() => void> = [];
let index = 0;
mock.module("react", () => ({
  ...React,
  useRef: <T,>(initial: T) => {
    const i = index++;
    if (!(i in state)) state[i] = { current: initial };
    return state[i] as { current: T };
  },
  useState: <T,>(initial: T) => {
    const i = index++;
    if (!(i in state)) state[i] = initial;
    return [
      state[i] as T,
      (v: T) => {
        state[i] = v;
      },
    ];
  },
  useEffect: (effect: () => void | (() => void)) => {
    const i = index++;
    if (!(i in state)) {
      state[i] = true;
      effects.push(effect);
    }
  },
}));
// The panel reads the language from React context, which this test does not mount, so the
// language hook answers from `language`, which is Chinese unless a test switches it. The panel
// also imports `adminErrorMessage`, whose module needs the real query helpers, so the query mock
// keeps them and replaces only `useQuery`.
let language: "zh" | "en" = "zh";
const realQuery = await import("@tanstack/react-query");
const realLanguage = await import("../adminI18n");
mock.module("../adminI18n", () => ({
  ...realLanguage,
  useAdminLanguage: () => ({
    language,
    copy: realLanguage.adminCopy[language],
    setLanguage: () => {},
  }),
}));
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQuery: () => ({
    data: {
      assignees: [
        {
          authUserId: "22222222-2222-4222-8222-222222222222",
          email: "synthetic@example.invalid",
          role: "staff",
        },
      ],
    },
  }),
}));
const saved = "33333333-3333-4333-8333-333333333333",
  key = "sponsorship-followup-bulk-operation",
  storage = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  },
});
let request: () => Promise<unknown>;
mock.module("../../../lib/admin/http", () => ({ fetchAdminJson: () => request() }));
const { SponsorshipFollowupBulkPanel } = await import("./SponsorshipFollowupBulkPanel");
type Props = {
  children?: ReactNode;
  disabled?: boolean;
  role?: string;
  onClick?: () => Promise<void>;
  onChange?: (e: { target: { value: string } }) => void;
};
function walk(n: ReactNode, out: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(n)) for (const x of n) walk(x, out);
  else if (React.isValidElement<Props>(n)) {
    out.push(n);
    walk(n.props.children, out);
  }
  return out;
}
function render() {
  index = 0;
  const n = SponsorshipFollowupBulkPanel({
    selectedIds: ["11111111-1111-4111-8111-111111111111"],
    filterKey: "synthetic",
    selectionDisabled: false,
    onApplied: () => {},
  });
  for (const e of effects.splice(0)) {
    const c = e();
    if (c) cleanups.push(c);
  }
  return n;
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  state.length = 0;
  effects.length = 0;
  cleanups.length = 0;
  storage.clear();
  language = "zh";
  request = async () => {
    throw Error("Synthetic 503");
  };
});
test("transient recovery GET keeps saved operation and exposes retry", async () => {
  storage.set(key, saved);
  render();
  await flush();
  expect(storage.get(key)).toBe(saved);
  expect(walk(render()).some((n) => n.props.children === "重新讀取結果")).toBe(true);
});
const alertText = () =>
  String(walk(render()).find((n) => n.props.role === "alert")?.props.children);

test("an error shown in Chinese is written in English when the language changes", async () => {
  // The panel keeps a code for the failure, not the sentence, so the sentence follows the language.
  storage.set(key, saved);
  render();
  await flush();
  expect(alertText()).toBe("未能讀取已保存的操作，請重新讀取結果。");
  language = "en";
  expect(alertText()).toBe(
    "Could not load the saved operation. Select Reload result to try again.",
  );
  expect(walk(render()).some((n) => n.props.children === "Reload result")).toBe(true);
});

test("a reason the server gave for a failed preview is shown as it came, in either language", async () => {
  walk(render()).find((x) => x.type === "select")!.props.onChange!({
    target: { value: "22222222-2222-4222-8222-222222222222" },
  });
  await walk(render()).find((x) => x.type === "button")!.props.onClick!();
  expect(alertText()).toBe("Synthetic 503");
  language = "en";
  expect(alertText()).toBe("Synthetic 503");
});

test("in-flight recovery disables creating a competing preview", () => {
  storage.set(key, saved);
  request = () => new Promise(() => {});
  render();
  const nodes = walk(render());
  nodes.find((n) => n.type === "select")!.props.onChange!({
    target: { value: "22222222-2222-4222-8222-222222222222" },
  });
  expect(walk(render()).find((n) => n.type === "button")!.props.disabled).toBe(true);
});
test("unmounted preview cannot overwrite saved recovery ID", async () => {
  let finish!: (v: unknown) => void;
  let markRequestStarted!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve;
  });
  request = () =>
    new Promise((resolve) => {
      finish = resolve;
      markRequestStarted();
    });
  const n = render();
  walk(n).find((x) => x.type === "select")!.props.onChange!({
    target: { value: "22222222-2222-4222-8222-222222222222" },
  });
  const pending = walk(render()).find((x) => x.type === "button")!.props.onClick!();
  await requestStarted;
  for (const c of cleanups) c();
  finish({ operationId: saved, assigneeUserId: "22222222-2222-4222-8222-222222222222", items: [] });
  await pending;
  expect(storage.has(key)).toBe(false);
});
