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
// The copy hook reads React context, which this test does not mount, so it reads the Chinese copy.
const realCopy = await import("../i18n/copy");
mock.module("../i18n/copy", () => ({
  ...realCopy,
  useAdminCopy: <T,>(copy: { zh: T }) => copy.zh,
}));
let fetcher: (url: string, options?: { method?: string; body?: string }) => Promise<unknown>;
mock.module("./api", () => ({
  fetchAdminJson: (url: string, options?: { method?: string; body?: string }) =>
    fetcher(url, options),
}));
const { CrmAssignmentBulkPanel } = await import("./CrmAssignmentBulkPanel");
const { BulkReview } = await import("../bulk/BulkReview");
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
  configurable: true,
});
const base = "crm-assignment-bulk-operation",
  A = "aaaaaaaa-1111-4111-8111-111111111111",
  B = "bbbbbbbb-2222-4222-8222-222222222222",
  assignee = "dddddddd-4444-4444-8444-444444444444";
type Props = {
  children?: ReactNode;
  onClick?: () => Promise<void>;
  onApply?: () => Promise<void>;
  onChange?: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  role?: string;
  operationId?: string;
  busy?: boolean;
};
function walk(n: ReactNode, out: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(n)) for (const x of n) walk(x, out);
  else if (React.isValidElement<Props>(n)) {
    out.push(n);
    walk(n.props.children, out);
  }
  return out;
}
function render(actorUserId = "finance-A") {
  index = 0;
  const tree = CrmAssignmentBulkPanel({
    actorUserId,
    selectedIds: ["11111111-1111-4111-8111-111111111111"],
    query: "",
    roleFilter: "all",
    selectionDisabled: false,
  });
  const callbacks = pendingEffects;
  pendingEffects = [];
  callbacks.forEach((fn) => fn());
  return tree;
}
function button(name: string) {
  return walk(render()).find((n) => n.type === "button" && n.props.children === name);
}
function select() {
  walk(render()).find((n) => n.type === "select")!.props.onChange!({ target: { value: assignee } });
}
function review() {
  return walk(render()).find((n) => n.type === BulkReview);
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}
const op = (operationId: string) => ({
  operationId,
  assigneeUserId: assignee,
  items: [],
  expiresAt: "2099-01-01",
  state: "queued",
});
const defaultFetch = async () => ({
  assignees: [{ authUserId: assignee, email: "fixture@example.invalid", role: "admin" }],
});
function unmount() {
  for (const effect of effects.values()) effect.cleanup?.();
}
function newMount() {
  state.length = 0;
  effects.clear();
  pendingEffects = [];
  index = 0;
}
beforeEach(() => {
  newMount();
  writes = 0;
  storage.clear();
  fetcher = defaultFetch;
});
test("mount recovery serializes creation until the saved snapshot is read", async () => {
  const held = deferred();
  storage.set(base, A);
  storage.set(base + ":finance-A", A);
  fetcher = (url) => (url.includes("operationId=") ? held.promise : defaultFetch());
  render();
  await flush();
  select();
  expect(button("建立預覽")?.props.disabled ?? button("處理中…")?.props.disabled).toBe(true);
  held.resolve(op(A));
  await flush();
  expect(review()?.props.operationId).toBe(A);
});
test("temporary recovery failure retains its ID and offers a read retry", async () => {
  storage.set(base, A);
  storage.set(base + ":finance-A", A);
  let failed = true;
  fetcher = async (url) => {
    if (url.includes("operationId=")) {
      if (failed) throw Error("temporary");
      return op(A);
    }
    return defaultFetch();
  };
  render();
  await flush();
  expect(storage.get(base + ":finance-A")).toBe(A);
  expect(button("重新讀取結果")).toBeDefined();
  failed = false;
  await button("重新讀取結果")!.props.onClick!();
  expect(review()?.props.operationId).toBe(A);
});
test("a preview response from an unmounted instance cannot overwrite a later recovery ID", async () => {
  const held = deferred();
  fetcher = (url, options) => (options?.method === "POST" ? held.promise : defaultFetch());
  render();
  await flush();
  select();
  const pending = button("建立預覽")!.props.onClick!();
  await flush();
  unmount();
  storage.set(base, B);
  storage.set(base + ":finance-A", B);
  held.resolve(op(A));
  await pending;
  expect(storage.get(base + ":finance-A")).toBe(B);
  expect(storage.get(base)).toBe(B);
});
test("another authenticated actor never loads a previous actor's recovery", async () => {
  storage.set(base, A);
  storage.set(base + ":finance-A", A);
  let reads = 0;
  fetcher = async (url) => {
    if (url.includes("operationId=")) {
      reads++;
      throw Error("other actor");
    }
    return defaultFetch();
  };
  render("finance-B");
  await flush();
  expect(reads).toBe(0);
  expect(storage.get(base + ":finance-A")).toBe(A);
});
