import { describe, expect, test } from "bun:test";

import type { AdminUser } from "../../donations/supabase.server";
import { createReportingHandlers, type ReportingService } from "./reportingHandlers.server";

const staff: AdminUser = {
  id: "staff-row",
  authUserId: "22222222-3333-4333-8444-555555555555",
  email: "staff@example.com",
  role: "staff",
  status: "active",
};

function createService(overrides: Partial<ReportingService> = {}) {
  const calls: Array<{ name: string; payload?: unknown }> = [];
  const service = {
    async listCoordinatorExportHistory(rawSearch) {
      calls.push({ name: "listCoordinatorExportHistory", payload: rawSearch });
      return { exports: [], total: 0 };
    },
    async getCoordinatorMonthlySummary(rawSearch) {
      calls.push({ name: "getCoordinatorMonthlySummary", payload: rawSearch });
      return {
        month: "2026-06",
        publicIntakeCases: 0,
        manualIntakeCases: 0,
        successfulAdoptions: 0,
        openCases: 0,
        overdueTasks: 0,
        exportsRun: 0,
      };
    },
    async exportCoordinatorCsv(payload) {
      calls.push({ name: "exportCoordinatorCsv", payload });
      return {
        csv: "adopter_profile_id\nprofile-1",
        filename: "coordinator-adopters.csv",
        rowCount: 1,
      };
    },
    async regenerateCoordinatorExport(payload) {
      calls.push({ name: "regenerateCoordinatorExport", payload });
      return {
        csv: "adopter_profile_id\nprofile-1",
        filename: "coordinator-adopters.csv",
        rowCount: 1,
      };
    },
    ...overrides,
  } satisfies ReportingService;

  return { calls, service };
}

describe("createReportingHandlers", () => {
  test("exports adopter CSV with actor, kind, query, body, and exact headers", async () => {
    const { calls, service } = createService();
    const handlers = createReportingHandlers({
      requireCoordinator: async () => staff,
      service,
    });

    const response = await handlers.exportCoordinatorCsv({
      request: new Request("https://example.test/api/admin/adoptions/exports/adopters.csv?q=Ada"),
      params: { kind: "adopters" },
    });

    expect(calls).toEqual([
      {
        name: "exportCoordinatorCsv",
        payload: {
          actorUserId: staff.authUserId,
          kind: "adopters",
          rawSearch: { q: "Ada" },
        },
      },
    ]);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("adopter_profile_id\nprofile-1");
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="coordinator-adopters.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("rejects an invalid regeneration id before authorization", async () => {
    const { calls, service } = createService();
    let authorizationCalls = 0;
    const handlers = createReportingHandlers({
      requireCoordinator: async () => {
        authorizationCalls += 1;
        return staff;
      },
      service,
    });

    const response = await handlers.regenerateCoordinatorExport({
      request: new Request(
        "https://example.test/api/admin/adoptions/reports/exports/not-uuid/download",
      ),
      params: { id: "not-uuid" },
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Invalid id" });
    expect(authorizationCalls).toBe(0);
    expect(calls).toEqual([]);
  });
});
