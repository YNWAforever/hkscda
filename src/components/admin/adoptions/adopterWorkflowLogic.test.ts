import { describe, expect, test } from "bun:test";

import {
  buildAdopterListSearchParams,
  buildCoordinatorExportUrl,
  getCoordinatorExportFilename,
} from "./adopterWorkflowLogic";

describe("adopter workflow logic", () => {
  test("builds trimmed adopter list search params", () => {
    expect(
      buildAdopterListSearchParams({
        q: " Ada ",
        blacklisted: "yes",
        hasOpenCases: true,
        hasOpenTasks: true,
        page: 2,
        pageSize: 50,
      }).toString(),
    ).toBe("q=Ada&blacklisted=yes&hasOpenCases=true&hasOpenTasks=true&page=2&pageSize=50");
  });

  test("omits false adopter list boolean filters", () => {
    expect(
      buildAdopterListSearchParams({
        q: "",
        blacklisted: "all",
        hasOpenCases: false,
        hasOpenTasks: false,
        page: 1,
        pageSize: 25,
      }).toString(),
    ).toBe("page=1&pageSize=25");
  });

  test("builds coordinator export urls with existing filters", () => {
    const params = new URLSearchParams("q=Ada&page=1&pageSize=25");
    expect(buildCoordinatorExportUrl("adopters", params)).toBe(
      "/api/admin/adoptions/exports/adopters.csv?q=Ada&page=1&pageSize=25",
    );
  });

  test("uses content-disposition filename for coordinator exports", () => {
    expect(
      getCoordinatorExportFilename(
        "adopters",
        'attachment; filename="coordinator-adopters-2026.csv"',
      ),
    ).toBe("coordinator-adopters-2026.csv");
  });

  test("falls back to coordinator export filename when header is missing", () => {
    expect(getCoordinatorExportFilename("tasks", null)).toBe("coordinator-tasks.csv");
  });
});
