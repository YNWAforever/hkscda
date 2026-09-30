import React, { type ReactNode, type ReactElement } from "react";
import { beforeEach, expect, mock, test } from "bun:test";
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
mock.module("@tanstack/react-query", () => ({
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
  request = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const n = render();
  walk(n).find((x) => x.type === "select")!.props.onChange!({
    target: { value: "22222222-2222-4222-8222-222222222222" },
  });
  const pending = walk(render()).find((x) => x.type === "button")!.props.onClick!();
  await flush();
  for (const c of cleanups) c();
  finish({ operationId: saved, assigneeUserId: "22222222-2222-4222-8222-222222222222", items: [] });
  await pending;
  expect(storage.has(key)).toBe(false);
});
