import { describe, expect, test } from "bun:test";

import { breadcrumbTrail, truncateRecordName } from "./breadcrumbTrail";
import { adminCopy } from "./adminI18n";
import { ADMIN_NAV_ITEMS } from "./adminNav";
import { VOLUNTEER_WORKSPACE_PAGES } from "./volunteerWorkspace";
import { volunteerWorkspaceCopy } from "./volunteerWorkspaceCopy";

const LANGUAGES = ["zh", "en"] as const;

/** The record routes: where the name comes from is each page's own, already loaded, record. */
const RECORD_PATHS = [
  { path: "/admin/applications/c1", section: "applications", destination: "applications" },
  {
    path: "/admin/coordinator/adopters/a1",
    section: "applications",
    destination: "coordinator-adopters",
  },
  { path: "/admin/supporters/s1", section: "supporters", destination: "supporters" },
  { path: "/admin/content/k1", section: "content", destination: "content" },
  { path: "/admin/animals/n1/edit", section: "dog", destination: "dog" },
] as const;

describe("breadcrumbTrail", () => {
  for (const language of LANGUAGES) {
    describe(language, () => {
      const copy = adminCopy[language];

      for (const item of ADMIN_NAV_ITEMS) {
        test(`${item.id}: group, then destination`, () => {
          const trail = breadcrumbTrail(item.to, language);
          expect(trail.map((crumb) => crumb.label)).toEqual([
            copy.navGroups[item.group],
            copy.navItems[item.id],
          ]);
          // The page you are on is not a link; the group is.
          expect(trail[0].to).toBeTruthy();
          expect(trail[1].to).toBeUndefined();
        });
      }

      for (const record of RECORD_PATHS) {
        test(`${record.path} adds the record name and links back to the list`, () => {
          const trail = breadcrumbTrail(record.path, language, "Mimi", {
            activeSection: record.section,
          });
          const item = ADMIN_NAV_ITEMS.find((candidate) => candidate.id === record.destination);
          expect(trail.map((crumb) => crumb.label)).toEqual([
            copy.navGroups[item!.group],
            copy.navItems[record.destination],
            "Mimi",
          ]);
          expect(trail[1].to).toBe(item!.to);
          expect(trail[2].to).toBeUndefined();
        });
      }

      test("the volunteer person record sits under the workspace and its directory", () => {
        const pages = volunteerWorkspaceCopy[language].pages;
        const trail = breadcrumbTrail("/admin/volunteers/people/p1", language, "Chan Tai Man");
        expect(trail.map((crumb) => crumb.label)).toEqual([
          copy.navGroups.volunteers,
          copy.navItems.volunteers,
          pages.people.label,
          "Chan Tai Man",
        ]);
        expect(trail[1].to).toBe("/admin/volunteers");
        expect(trail[2].to).toBe("/admin/volunteers/people");
      });

      test("a registration sits under its activities page", () => {
        const pages = volunteerWorkspaceCopy[language].pages;
        const trail = breadcrumbTrail("/admin/volunteers/registrations/r1", language, "Ms Lee");
        expect(trail.map((crumb) => crumb.label)).toEqual([
          copy.navGroups.volunteers,
          copy.navItems.volunteers,
          pages.activities.label,
          "Ms Lee",
        ]);
      });

      test("every volunteer workspace page has one trail ending at its own label", () => {
        const pages = volunteerWorkspaceCopy[language].pages;
        for (const page of VOLUNTEER_WORKSPACE_PAGES) {
          const trail = breadcrumbTrail(page.to, language);
          const last = trail[trail.length - 1];
          const navItem = ADMIN_NAV_ITEMS.find((item) => item.to === page.to);
          // A page that is also a navigation item keeps the navigation's label.
          expect(last.label).toBe(
            navItem
              ? copy.navItems[navItem.id]
              : page.id === "overview"
                ? copy.navItems.volunteers
                : pages[page.id].label,
          );
          expect(last.to).toBeUndefined();
          expect(trail[0].label).toBe(copy.navGroups.volunteers);
        }
      });

      test("the task overview has a single crumb", () => {
        expect(breadcrumbTrail("/admin/tasks", language, null, { activeSection: "tasks" })).toEqual(
          [{ label: copy.layout.taskOverview }],
        );
      });

      test("a page with no destination has no trail", () => {
        expect(
          breadcrumbTrail("/admin/access-denied", language, null, { activeSection: "access" }),
        ).toEqual([]);
      });

      test("the animal list reads its tab from the section", () => {
        const trail = breadcrumbTrail("/admin", language, null, { activeSection: "sponsor" });
        expect(trail.map((crumb) => crumb.label)).toEqual([
          copy.navGroups.animals,
          copy.navItems.sponsor,
        ]);
      });
    });
  }

  describe("a record that has no usable name ends at the destination", () => {
    for (const recordName of [undefined, null, "", "   ", "\n\t"]) {
      test(`recordName ${JSON.stringify(recordName)}`, () => {
        for (const record of RECORD_PATHS) {
          const trail = breadcrumbTrail(record.path, "en", recordName, {
            activeSection: record.section,
          });
          expect(trail).toHaveLength(2);
          expect(trail[1].label).toBe(adminCopy.en.navItems[record.destination]);
          expect(trail[1].to).toBeUndefined();
          for (const crumb of trail) {
            expect(crumb.label).not.toContain("undefined");
            expect(crumb.label).not.toContain("null");
            expect(crumb.label.trim()).not.toBe("");
          }
        }
        const person = breadcrumbTrail("/admin/volunteers/people/p1", "en", recordName);
        expect(person.at(-1)?.label).toBe(volunteerWorkspaceCopy.en.pages.people.label);
        expect(person.at(-1)?.to).toBeUndefined();
      });
    }
  });

  test("the group crumb goes where the layout says, or nowhere while the role is unknown", () => {
    const options = { activeSection: "supporters" } as const;
    expect(
      breadcrumbTrail("/admin/supporters", "en", null, { ...options, groupTo: "/x" })[0].to,
    ).toBe("/x");
    expect(
      breadcrumbTrail("/admin/supporters", "en", null, { ...options, groupTo: null })[0].to,
    ).toBeUndefined();
    expect(breadcrumbTrail("/admin/supporters", "en", null, options)[0].to).toBe(
      "/admin?section=payments",
    );
  });

  test("trims the record name", () => {
    expect(breadcrumbTrail("/admin/supporters/s1", "en", "  Mimi  ").at(-1)?.label).toBe("Mimi");
  });

  describe("long names", () => {
    test("a name of exactly 80 characters is kept whole", () => {
      const name = "a".repeat(80);
      expect(truncateRecordName(name)).toBe(name);
    });

    test("a longer name is cut to 80 characters ending with an ellipsis", () => {
      const name = "b".repeat(200);
      const shown = truncateRecordName(name);
      expect(shown?.endsWith("…")).toBe(true);
      expect(Array.from(shown ?? "")).toHaveLength(80);
      const trail = breadcrumbTrail("/admin/supporters/s1", "en", name);
      expect(trail.at(-1)?.label).toBe(shown ?? "");
    });

    test("never cuts a character in half", () => {
      const name = "\u{1F431}".repeat(100);
      const shown = truncateRecordName(name) ?? "";
      expect(Array.from(shown)).toHaveLength(80);
      expect(shown.slice(0, -1)).not.toMatch(/[\uD800-\uDBFF]$/);
    });

    test("an empty or missing name is null", () => {
      expect(truncateRecordName(undefined)).toBeNull();
      expect(truncateRecordName(null)).toBeNull();
      expect(truncateRecordName("  ")).toBeNull();
    });
  });
});
