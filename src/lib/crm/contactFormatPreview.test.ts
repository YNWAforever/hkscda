import { expect, test } from "bun:test";

import { buildContactFormatPreview } from "./contactFormatPreview";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const missing = "33333333-3333-4333-8333-333333333333";

test("contact preview preserves selected order and requires manual identity review", () => {
  const rows = [
    {
      id: first,
      name: "  Ada   Wong ",
      email: " ADA@EXAMPLE.COM ",
      phone: " 9123  4567 ",
      updatedAt: "2026-09-28T00:00:00Z",
      deletedAt: null,
    },
    {
      id: second,
      name: "Lee",
      email: "lee@example.com",
      phone: null,
      updatedAt: "2026-09-27T00:00:00Z",
      deletedAt: null,
    },
  ];
  const before = structuredClone(rows);
  const result = buildContactFormatPreview([missing, first, second], rows);

  expect(result.map((item) => [item.entityId, item.status, item.reasonCode])).toEqual([
    [missing, "skipped", "missing_or_deleted"],
    [first, "manual_review", "identity_review"],
    [second, "unchanged", null],
  ]);
  expect(result[0]?.before).toBeNull();
  expect(result[0]?.after).toBeNull();
  expect(result[1]?.before).toEqual({
    name: "  Ada   Wong ",
    email: " ADA@EXAMPLE.COM ",
    phone: " 9123  4567 ",
  });
  expect(result[1]?.after).toEqual({
    name: "Ada Wong",
    email: "ada@example.com",
    phone: "9123 4567",
  });
  expect(result[1]?.updatedAt).toBe("2026-09-28T00:00:00Z");
  expect(rows).toEqual(before);
});

test("format-only suggestions never alter consent or infer phone digits", () => {
  const result = buildContactFormatPreview(
    [first, second],
    [
      {
        id: first,
        name: "  Chan  Tai  Man  ",
        email: "chan@example.com",
        phone: " +852  9123-4567 ",
        updatedAt: "2026-09-28T00:00:00Z",
        deletedAt: null,
      },
      {
        id: second,
        name: "Deleted",
        email: "deleted@example.com",
        phone: "12345678",
        updatedAt: "2026-09-28T00:00:00Z",
        deletedAt: "2026-09-28T01:00:00Z",
      },
    ],
  );
  expect(result[0]?.status).toBe("suggested");
  expect(result[0]?.after?.phone).toBe("+852 9123-4567");
  expect(result[0]?.after?.name).toBe("Chan Tai Man");
  expect(result[1]).toMatchObject({
    entityId: second,
    status: "skipped",
    reasonCode: "missing_or_deleted",
    before: null,
    after: null,
  });
});
