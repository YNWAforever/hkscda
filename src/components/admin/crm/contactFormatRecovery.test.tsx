import React, { type ReactNode, type ReactElement, type DependencyList } from "react";
import { beforeEach, expect, mock, test } from "bun:test";
const state: unknown[] = [];
const effects = new Map<number, { deps: DependencyList; cleanup?: () => void }>();
let index = 0,
  writes = 0;
let pendingEffects: (() => void)[] = [];
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
      (v: T | ((old: T) => T)) => {
        writes++;
        state[i] = typeof v === "function" ? (v as (old: T) => T)(state[i] as T) : v;
      },
    ];
  },
  useEffect: (callback: () => void | (() => void), deps: DependencyList) => {
    const i = index++,
      previous = effects.get(i);
    if (!previous || deps.some((v, j) => !Object.is(v, previous.deps[j]))) {
      pendingEffects.push(() => {
        previous?.cleanup?.();
        const cleanup = callback();
        effects.set(i, { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined });
      });
    }
  },
}));
// The language hook reads React context, which this test does not mount, so it answers Chinese.
const realLanguage = await import("../adminI18n");
mock.module("../adminI18n", () => ({
  ...realLanguage,
  useAdminLanguage: () => ({
    language: "zh" as const,
    copy: realLanguage.adminCopy.zh,
    setLanguage: () => {},
  }),
}));
let fetcher: (body: string) => Promise<unknown>;
mock.module("./api", () => ({
  fetchAdminJson: (_url: string, options: { body: string }) => fetcher(options.body),
}));
const { CrmContactFormatPreviewPanel } = await import("./CrmContactFormatPreviewPanel");
type Props = {
  children?: ReactNode;
  onClick?: () => Promise<void>;
  disabled?: boolean;
  role?: string;
};
function walk(n: ReactNode, out: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(n)) for (const x of n) walk(x, out);
  else if (React.isValidElement<Props>(n)) {
    out.push(n);
    walk(n.props.children, out);
  }
  return out;
}
let query = "A";
function render() {
  index = 0;
  const tree = CrmContactFormatPreviewPanel({
    selectedIds: ["11111111-1111-4111-8111-111111111111"],
    query,
    roleFilter: "all",
    selectionDisabled: false,
  });
  const callbacks = pendingEffects;
  pendingEffects = [];
  callbacks.forEach((fn) => fn());
  return tree;
}
const button = () => walk(render()).find((n) => n.type === "button")!;
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const text = () => JSON.stringify(render());
function deferred() {
  let resolve!: (v: unknown) => void, reject!: (e: Error) => void;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
function result(hash: string, name: string) {
  return {
    filterHash: hash,
    generatedAt: "2026-09-30",
    counts: { suggested: 1, manual_review: 0, unchanged: 0, skipped: 0 },
    items: [
      {
        entityId: "id",
        status: "suggested",
        before: { name, email: "fixture@example.invalid", phone: null },
        after: { name, email: "fixture@example.invalid", phone: null },
      },
    ],
  };
}
beforeEach(() => {
  state.length = 0;
  effects.clear();
  pendingEffects = [];
  index = 0;
  writes = 0;
  query = "A";
});
test("returning to the same selection cannot revive an invalidated response", async () => {
  const old = deferred(),
    fresh = deferred();
  let calls = 0,
    hash = "";
  fetcher = async (body) => {
    hash = JSON.parse(body).filterHash;
    return ++calls === 1 ? old.promise : fresh.promise;
  };
  render();
  const first = button().props.onClick!();
  await flush();
  query = "B";
  render();
  query = "A";
  render();
  const second = button().props.onClick!();
  await flush();
  fresh.resolve(result(hash, "NEW"));
  await second;
  expect(text()).toContain("NEW");
  old.resolve(result(hash, "OLD"));
  await first;
  expect(text()).toContain("NEW");
  expect(text()).not.toContain("OLD");
});
test("an old rejection cannot replace current errors or clear current busy state", async () => {
  const old = deferred(),
    fresh = deferred();
  let calls = 0,
    hash = "";
  fetcher = async (body) => {
    hash = JSON.parse(body).filterHash;
    return ++calls === 1 ? old.promise : fresh.promise;
  };
  render();
  const first = button().props.onClick!();
  await flush();
  query = "B";
  render();
  query = "A";
  render();
  const second = button().props.onClick!();
  await flush();
  old.reject(new Error("OLD ERROR"));
  await first;
  expect(button().props.disabled).toBe(true);
  expect(text()).not.toContain("OLD ERROR");
  fresh.resolve(result(hash, "CURRENT"));
  await second;
  expect(text()).toContain("CURRENT");
});
test("unmount invalidates a pending preview before it writes state", async () => {
  const pending = deferred();
  let hash = "";
  fetcher = async (body) => {
    hash = JSON.parse(body).filterHash;
    return pending.promise;
  };
  render();
  const request = button().props.onClick!();
  await flush();
  for (const effect of effects.values()) effect.cleanup?.();
  const before = writes;
  pending.resolve(result(hash, "UNMOUNTED"));
  await request;
  expect(writes).toBe(before);
});
