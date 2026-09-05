/** Deterministic synthetic inputs only. This module never connects to or seeds a database. */
export const ADMIN_PERFORMANCE_FIXTURE_VERSION = "hkscda-admin-v1";
export const ADMIN_PERFORMANCE_SIZES = [1000, 10000, 50000] as const;

export function* supporterPerformanceFixture(count: (typeof ADMIN_PERFORMANCE_SIZES)[number]) {
  if (!ADMIN_PERFORMANCE_SIZES.includes(count)) throw new Error("Unsupported fixture size");
  for (let index = 1; index <= count; index++) {
    yield {
      id: `90000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      name: `Synthetic supporter ${index}`,
      email: `supporter-${index}@example.invalid`,
      phone: null,
      language: index % 5 === 0 ? "en" : "zh-HK",
      source: ADMIN_PERFORMANCE_FIXTURE_VERSION,
      tags: ["synthetic-performance"],
      created_at: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
    };
  }
}

export const adminPerformanceScenarios = [
  {
    name: "supporter-list-first-50",
    path: "/api/admin/supporters?page=1&pageSize=50",
    kind: "list",
    routeTemplate: "/api/admin/supporters",
  },
  {
    name: "content-list-first-50",
    path: "/api/admin/content?page=1&pageSize=50",
    kind: "list",
    routeTemplate: "/api/admin/content",
  },
];
