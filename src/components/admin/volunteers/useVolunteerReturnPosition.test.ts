import { expect, test } from "bun:test";
import {
  saveVolunteerReturnPosition,
  readVolunteerReturnPosition,
} from "./useVolunteerReturnPosition";
const actor = "90000000-0000-4000-8000-000000000003";
test("return position belongs to the actor and exact list search/page scope", () => {
  const entries = new Map<string, string>();
  const storage = {
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    getItem: (key: string) => entries.get(key) ?? null,
  };
  saveVolunteerReturnPosition(storage, {
    listKey: "volunteer-tasks",
    actorUserId: actor,
    scopeKey: "overdue:2:private",
    recordId: "pending-row",
    scrollY: 600,
  });
  expect(
    readVolunteerReturnPosition(storage, "volunteer-tasks", actor, "overdue:2:private"),
  ).toMatchObject({ recordId: "pending-row", scrollY: 600 });
  expect(
    readVolunteerReturnPosition(storage, "volunteer-tasks", actor, "overdue:1:private"),
  ).toBeNull();
  expect(
    readVolunteerReturnPosition(
      storage,
      "volunteer-tasks",
      crypto.randomUUID(),
      "overdue:2:private",
    ),
  ).toBeNull();
  expect([...entries.keys()][0]).toStartWith("hkscda.admin.list.query.");
});
test("blocked storage and malformed return state do not break navigation", () => {
  expect(
    readVolunteerReturnPosition(
      {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      "volunteer-tasks",
      actor,
      "all:1",
    ),
  ).toBeNull();
  expect(
    readVolunteerReturnPosition(
      { getItem: () => JSON.stringify({ scopeKey: "all:1", scrollY: -1, recordId: "x" }) },
      "volunteer-tasks",
      actor,
      "all:1",
    ),
  ).toBeNull();
});
