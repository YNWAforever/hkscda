import { expect, test } from "bun:test";
import { applyReviewedGroups, reviewBulkOperation } from "./review";

const operation = (action = "generate") => ({
  id: "op",
  action,
  created_at: "2026-09-27T00:00:00Z",
  selection: [],
  groups: [0, 1, 2].map((index) => ({
    index,
    date: "2026-10-0" + (index + 1),
    state: "pending",
    items: [{ state: "ready", preview: { kind: "generated" } }],
  })),
});

test("review distinguishes eligible and exceptions and only auto-runs new generated drafts", () => {
  const ready = reviewBulkOperation(operation());
  expect(ready.eligible).toBe(3);
  expect(ready.skipped).toBe(0);
  expect(ready.canRunSequentially).toBe(true);
  const risky = operation("cancel");
  expect(reviewBulkOperation(risky).canRunSequentially).toBe(false);
  const mixed = operation();
  mixed.groups[1].items[0].state = "skipped";
  expect(reviewBulkOperation(mixed).canRunSequentially).toBe(false);
  expect(reviewBulkOperation(mixed).skipped).toBe(1);
});

test("sequential apply stops at first failed group and retains partial results", async () => {
  const calls: number[] = [];
  const result = await applyReviewedGroups(
    operation(),
    async (id, index) => {
      expect(id).toBe("op");
      calls.push(index);
      const next = operation();
      for (const group of next.groups)
        if (group.index <= index) group.state = group.index === 1 ? "failed" : "applied";
      return next;
    },
    async () => operation(),
  );
  expect(calls).toEqual([0, 1]);
  expect(result.halted).toBe("failed");
  expect(result.operation.groups.map((group) => group.state)).toEqual([
    "applied",
    "failed",
    "pending",
  ]);
});

test("transport uncertainty refreshes server status before another apply", async () => {
  const calls: number[] = [];
  const result = await applyReviewedGroups(
    operation(),
    async (_, index) => {
      calls.push(index);
      throw new Error("connection lost after apply");
    },
    async () => {
      const next = operation();
      next.groups[0].state = "applied";
      return next;
    },
  );
  expect(calls).toEqual([0]);
  expect(result.halted).toBe("transport");
  expect(result.operation.groups[0].state).toBe("applied");
});
test("a refreshed partial operation can continue pending ready groups without replaying applied ones", async () => {
  const partial = operation();
  partial.groups[0].state = "applied";
  const calls: number[] = [];
  expect(reviewBulkOperation(partial).canRunSequentially).toBe(true);
  const result = await applyReviewedGroups(
    partial,
    async (_, index) => {
      calls.push(index);
      const next = operation();
      for (const group of next.groups) if (group.index <= index) group.state = "applied";
      return next;
    },
    async () => partial,
  );
  expect(calls).toEqual([1, 2]);
  expect(result.halted).toBeNull();
});
test("failed and conflicted groups are not reported as eligible or double-counted", () => {
  const failed = operation();
  failed.groups[0].state = "failed";
  expect(reviewBulkOperation(failed).eligible).toBe(2);
  expect(reviewBulkOperation(failed).failed).toBe(1);
  const conflicted = operation();
  conflicted.groups[0].state = "conflicted";
  conflicted.groups[0].items[0].state = "conflicted";
  expect(reviewBulkOperation(conflicted).conflicted).toBe(1);
});
