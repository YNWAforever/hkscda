import { expect, test } from "bun:test";
import { createDonationDeliveryCron, dispatchDueDonationJobs } from "./deliveryScheduler.server";

test("cron denies unauthenticated requests before listing or sending", async () => {
  let runs = 0;
  const cron = createDonationDeliveryCron({
    secret: () => "synthetic-secret",
    run: async () => {
      runs++;
      return { selected: 0 };
    },
  });
  expect((await cron(new Request("https://example.invalid"))).status).toBe(401);
  expect(runs).toBe(0);
});

test("due jobs continue after one failure and report bounded partial results", async () => {
  const attempted: string[] = [];
  const result = await dispatchDueDonationJobs({
    listDue: async (limit) => {
      expect(limit).toBe(5);
      return ["one", "two", "three"];
    },
    run: async (id) => {
      attempted.push(id);
      if (id === "two") throw Error("transient");
      return id === "three" ? { kind: "retryable", code: "delivery_failed" } : { kind: "complete" };
    },
  });
  expect(attempted.sort()).toEqual(["one", "three", "two"]);
  expect(result).toEqual({
    selected: 3,
    complete: 1,
    retryable: 1,
    attentionRequired: 0,
    busy: 0,
    errors: 1,
  });
});
