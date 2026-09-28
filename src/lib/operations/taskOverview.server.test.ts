import { expect, test } from "bun:test";
import { readTaskOverview, selectTaskDefinitions } from "./taskOverview.server";

test("each role receives only its own actionable 3-5 task destinations", () => {
  const staff = selectTaskDefinitions("staff");
  const treasurer = selectTaskDefinitions("treasurer");
  const admin = selectTaskDefinitions("admin");
  for (const cards of [staff, treasurer, admin]) {
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards.length).toBeLessThanOrEqual(5);
    expect(cards.every((card) => card.href.startsWith("/admin"))).toBe(true);
  }
  expect(treasurer.map((card) => card.key)).not.toContain("adoption_unassigned");
  expect(staff.map((card) => card.key)).not.toContain("payment_pending");
  expect(admin.find((card) => card.key === "content_expired")).toMatchObject({
    label: "已過期內容",
    href: "/admin/content?quality=expired",
  });
  expect(staff.find((card) => card.key === "sponsorship_proof_pending")?.href).toBe(
    "/admin/sponsorships?proof=pending",
  );
  expect(treasurer.find((card) => card.key === "delivery_attention")?.href).toBe(
    "/admin?section=payments#delivery-jobs",
  );
  expect(treasurer.find((card) => card.key === "sponsorship_followup")?.href).toBe(
    "/admin/sponsorships?status=needs_followup",
  );
});

test("failed source is unavailable, never zero, while other task counts remain", async () => {
  const cards = await readTaskOverview("staff", {
    count: async (key) => {
      if (key === "volunteer_pending") throw new Error("database unavailable");
      return { count: 2, oldestAt: "2026-09-27T01:00:00Z" };
    },
  });
  expect(cards.find((card) => card.key === "volunteer_pending")?.metric).toEqual({
    state: "unavailable",
  });
  expect(cards.filter((card) => card.metric.state === "ready")).toHaveLength(4);
});

test("role guidance names the action and keeps proof separate from confirmed payment", () => {
  const staff = selectTaskDefinitions("staff");
  const treasurer = selectTaskDefinitions("treasurer");
  const admin = selectTaskDefinitions("admin");
  expect(staff.find((card) => card.key === "volunteer_pending")?.guidance).toContain("核對身份");
  expect(treasurer.find((card) => card.key === "payment_pending")?.guidance).toContain("逐筆");
  expect(treasurer.find((card) => card.key === "sponsorship_proof_pending")?.guidance).toContain(
    "不等於已收款",
  );
  expect(admin.find((card) => card.key === "content_expired")?.guidance).toContain("公開影響");
  expect([...staff, ...treasurer, ...admin].every((card) => card.guidance.length > 0)).toBe(true);
});
