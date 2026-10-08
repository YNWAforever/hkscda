import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../../components/admin/i18n/testing";
import type { AdminListSearch } from "../../lib/animals/adminListState";
import { dashboardCopy } from "./-dashboardCopy";

const realRouter = await import("@tanstack/react-router");
const realQuery = await import("@tanstack/react-query");

type Role = "staff" | "treasurer" | "admin";
let role: Role | null = "admin";
let animalsResult: Record<string, unknown> = {};

mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useQuery: (options: { queryKey: readonly unknown[] }) =>
    options.queryKey[0] === "admin-animals"
      ? { isLoading: false, isError: false, error: null, isFetching: false, ...animalsResult }
      : { data: role ? { admin: { id: "admin-1", role, status: "active" } } : undefined },
}));

// The animal list, media queue, payments and pledge panels belong to other areas and still
// show Chinese; stand-ins keep this test on what the dashboard route itself renders.
mock.module("../../components/admin/AnimalsTable", () => ({
  AnimalsTable: () => <p>animals table</p>,
}));
mock.module("../../components/admin/MediaRepairQueue", () => ({
  MediaRepairQueue: () => <p>media repair queue</p>,
}));
mock.module("../../components/admin/donations/PaymentsReconcile", () => ({
  PaymentsReconcile: () => <p>payments reconcile</p>,
}));
mock.module("../../components/admin/sponsorship/PledgeReviewLane", () => ({
  PledgeReviewLane: () => <p>pledge review lane</p>,
}));

const { AdminDashboardContent } = await import("./index");

const search: AdminListSearch = { section: "cat", q: "", archived: false, status: "all", page: 1 };

function dashboard(section: AdminListSearch["section"]) {
  return (
    <AdminDashboardContent
      section={section}
      search={{ ...search, section }}
      onSearchChange={() => {}}
    />
  );
}

describe("admin dashboard in English", () => {
  test("shows the cat section with its breadcrumb, tabs and filter in English", () => {
    role = "admin";
    animalsResult = { data: { animals: [], total: 2, page: 1 } };
    const markup = renderAdminInEnglish(dashboard("cat"));
    expectNoChineseText(markup);
    for (const text of [
      'aria-label="Breadcrumb"',
      "Animal management",
      "Find and manage cat records, care status and public information.",
      'aria-label="Animal categories"',
      "Cats",
      "Dogs",
      "Sponsorship",
      "+ Add new",
      "Needs photo",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toMatch(/<h1[^>]*>Animal management<\/h1>/);
  });

  test("shows the dog and sponsor sections in English", () => {
    role = "admin";
    animalsResult = { data: { animals: [], total: 0, page: 1 } };
    const dogs = renderAdminInEnglish(dashboard("dog"));
    expectNoChineseText(dogs);
    expect(dogs).toContain("Find and manage dog records, care status and public information.");

    const sponsors = renderAdminInEnglish(dashboard("sponsor"));
    expectNoChineseText(sponsors);
    expect(sponsors).toContain(
      "Cats and dogs eligible for sponsorship; eligibility is independent of species.",
    );
  });

  test("labels the two sponsorship views for a role that can review pledges", () => {
    role = "staff";
    animalsResult = { data: { animals: [], total: 0, page: 1 } };
    const markup = renderAdminInEnglish(dashboard("sponsor"));
    expectNoChineseText(markup);
    expect(markup).toContain("Animal list");
    expect(markup).toContain("Pledge review");
  });

  test("shows the applications and payments sections in English", () => {
    role = "admin";
    animalsResult = {};
    const applications = renderAdminInEnglish(dashboard("applications"));
    expectNoChineseText(applications);
    expect(applications).toMatch(/<h1[^>]*>Adoption applications<\/h1>/);
    expect(applications).toContain("Adoption applications moved to coordinator workflow");
    expect(applications).toContain("Open adoption cases");

    const payments = renderAdminInEnglish(dashboard("payments"));
    expectNoChineseText(payments);
    expect(payments).toMatch(/<h1[^>]*>Payment records<\/h1>/);
    expect(payments).toContain("Supporter records");
  });

  test("shows the loading and failure states in English", () => {
    role = "admin";
    animalsResult = { isLoading: true };
    const loading = renderAdminInEnglish(dashboard("cat"));
    expectNoChineseText(loading);
    expect(loading).toContain("Loading...");

    animalsResult = { isError: true, error: new Error("boom") };
    const failed = renderAdminInEnglish(dashboard("cat"));
    expectNoChineseText(failed);
    expect(failed).toContain("Could not load");
    expect(failed).toContain("Try again.");
  });
});

describe("dashboardCopy", () => {
  test("has no Chinese anywhere in English", () => {
    expectNoChineseInCopy(dashboardCopy.en);
  });
});

describe("admin dashboard in Chinese", () => {
  test("is unchanged", () => {
    role = "admin";
    animalsResult = { data: { animals: [], total: 2, page: 1 } };
    const markup = renderAdminInChinese(dashboard("cat"));
    for (const text of [
      'aria-label="麵包屑導覽"',
      "後台",
      "動物管理",
      "搜尋及管理貓貓記錄、照顧狀態與公開資料。",
      'aria-label="動物分類"',
      "貓貓",
      "狗狗",
      "助養",
      "+ 新增",
      "待補相片",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toMatch(/<h1[^>]*>動物管理<\/h1>/);

    animalsResult = {};
    const applications = renderAdminInChinese(dashboard("applications"));
    expect(applications).toContain("領養申請已移至協調員工作流程");
    expect(applications).toContain("開啟領養個案");
  });

  test("counts the animals needing a photo with the right plural", () => {
    expect(dashboardCopy.en.missingPhotoNotice(1)).toStartWith("Needs photo: 1 animal. ");
    expect(dashboardCopy.en.missingPhotoNotice(3)).toStartWith("Needs photo: 3 animals. ");
    expect(dashboardCopy.en.missingPhotoNotice(0)).toStartWith("Needs photo: 0 animals. ");
  });

  test("keeps the missing-photo notice word for word", () => {
    // The notice only shows after the filter is ticked, so check the text itself.
    expect(dashboardCopy.zh.missingPhotoNotice(3)).toBe(
      "待補相片：3 筆。按編號核對動物，再進入「編輯」上載到草稿；儲存、預覽及批准發布前，原公開相片不會被替換。",
    );
  });
});
