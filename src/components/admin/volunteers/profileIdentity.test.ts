import { expect, test } from "bun:test";
import { distinguishProfileId } from "./profileIdentity";
test("same-prefix UUIDs remain distinguishable after shortening", () => {
  const ids = [
    "90000000-0000-4000-8000-000000000001",
    "90000000-0000-4000-8000-000000000002",
    "90000000-0000-4000-8000-000000000003",
  ];
  expect(new Set(ids.map((id) => distinguishProfileId(id, ids))).size).toBe(3);
});
