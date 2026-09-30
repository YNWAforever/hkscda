import React, { type ReactNode, type ReactElement } from "react";
import { beforeEach, expect, mock, test } from "bun:test";
const state: unknown[] = [];
let index = 0,
  effects: (() => void | (() => void))[] = [],
  cleanup: (() => void)[] = [];
const storage = new Map<string, string>();
mock.module("react", () => ({
  ...React,
  useEffect: (f: () => void | (() => void)) => {
    const i = index++;
    if (!(i in state)) {
      state[i] = true;
      effects.push(f);
    }
  },
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
        state[i] = typeof v === "function" ? (v as (old: T) => T)(state[i] as T) : v;
      },
    ];
  },
}));
let fetcher: (url: string, options?: { method?: string; body?: string }) => Promise<unknown>;
mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: (url: string, options?: { method?: string; body?: string }) =>
    fetcher(url, options),
}));
const { BankStatementDryRunPanel, BankStatementDryRunPreview } =
  await import("./BankStatementDryRunPanel");
const { BankMatchOperationReview } = await import("./BankMatchOperationReview");
type Props = {
  children?: ReactNode;
  id?: string;
  disabled?: boolean;
  onClick?: () => void | Promise<void>;
  onChange?: (e: { target: { files: File[] } }) => void;
  onToggle?: (n: number) => void;
  operation?: { operationId: string };
};
function walk(n: ReactNode, out: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(n)) for (const x of n) walk(x, out);
  else if (React.isValidElement<Props>(n)) {
    out.push(n);
    walk(n.props.children, out);
  }
  return out;
}
let actorUserId = "actor-a";
function render() {
  index = 0;
  const out = Reflect.apply(BankStatementDryRunPanel, undefined, [{ actorUserId }]);
  for (const f of effects.splice(0)) {
    const c = f();
    if (c) cleanup.push(c);
  }
  return out;
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const operation = (id: string) => ({
  operationId: id,
  fileSha256: "a".repeat(64),
  createdAt: "2026-09-30",
  expiresAt: "2026-10-01",
  state: "queued",
  items: [],
});
async function prepare() {
  walk(render()).find((n) => n.props.id === "bank-statement-csv")!.props.onChange!({
    target: {
      files: [
        new File(
          [
            "bank_reference,received_on,currency,amount_hkd,payment_hint\nREF,2026-09-30,HKD,1.00,HINT",
          ],
          "synthetic.csv",
        ),
      ],
    },
  });
  await walk(render()).find((n) => n.props.children === "產生唯讀預覽")!.props.onClick!();
  walk(render()).find((n) => n.type === BankStatementDryRunPreview)!.props.onToggle!(1);
}
const create = () =>
  walk(render()).find(
    (n) => n.props.children === "建立逐組確認預覽" || n.props.children === "正在處理快照…",
  );
beforeEach(() => {
  actorUserId = "actor-a";
  state.length = 0;
  index = 0;
  effects = [];
  cleanup = [];
  storage.clear();
  Object.assign(globalThis, {
    sessionStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  fetcher = async (url) =>
    url.includes("bank-statement-preview")
      ? { fileSha256: "a".repeat(64), rows: [], summary: { total: 0 }, generatedAt: "2026-09-30" }
      : operation("A");
});
test("mount recovery blocks new snapshot creation until its read resolves", async () => {
  storage.set("hkscda-finance-bank-match-operation:actor-a", "A");
  let finish!: (v: unknown) => void;
  const normal = fetcher;
  fetcher = (url, options) =>
    url.includes("?operationId=") ? new Promise((r) => (finish = r)) : normal(url, options);
  render();
  await prepare();
  expect(create()?.props.disabled).toBe(true);
  finish(operation("A"));
  await flush();
  expect(
    walk(render()).find((n) => n.type === BankMatchOperationReview)!.props.operation!.operationId,
  ).toBe("A");
});
test("unmounted create cannot replace recovery storage", async () => {
  await prepare();
  let finish!: (v: unknown) => void;
  fetcher = () => new Promise((r) => (finish = r));
  const pending = create()!.props.onClick!();
  await flush();
  for (const f of cleanup) f();
  storage.set("hkscda-finance-bank-match-operation:actor-a", "new-mount-operation");
  finish(operation("B"));
  await pending;
  await flush();
  expect(storage.get("hkscda-finance-bank-match-operation:actor-a")).toBe("new-mount-operation");
});
test("failed mount recovery retains its ID and offers read-only recovery", async () => {
  storage.set("hkscda-finance-bank-match-operation:actor-a", "A");
  fetcher = async () => {
    throw Error("transient read failure");
  };
  render();
  await flush();
  expect(storage.get("hkscda-finance-bank-match-operation:actor-a")).toBe("A");
  expect(walk(render()).some((n) => n.props.children === "重新讀取確認結果")).toBe(true);
});

test("another actor does not recover or get locked by the previous actor's snapshot", async () => {
  storage.set("hkscda-finance-bank-match-operation", "A");
  storage.set("hkscda-finance-bank-match-operation:actor-a", "A");
  actorUserId = "actor-b";
  let reads = 0,
    posts = 0;
  const normal = fetcher;
  fetcher = async (url, options) => {
    if (url.includes("?operationId=")) {
      reads++;
      throw Error("403 owner mismatch");
    }
    if (options?.method === "POST" && url.endsWith("bank-match-operations")) {
      posts++;
      return operation("B");
    }
    return normal(url, options);
  };
  render();
  await flush();
  await prepare();
  expect(create()?.props.disabled).toBe(false);
  await create()!.props.onClick!();
  await flush();
  expect(reads).toBe(0);
  expect(posts).toBe(1);
  expect(storage.get("hkscda-finance-bank-match-operation:actor-a")).toBe("A");
  expect(storage.get("hkscda-finance-bank-match-operation:actor-b")).toBe("B");
});
