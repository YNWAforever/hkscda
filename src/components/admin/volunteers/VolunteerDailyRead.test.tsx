import { describe, expect, test } from "bun:test";
import { renderAdminInChinese, renderAdminInEnglish } from "../i18n/testing";
import { hkDate } from "../../../lib/volunteers/bulk/service";
import { readActivityRouteState } from "./activityRouteState";
import { activityWorkspaceCopy } from "./activityWorkspaceCopy";
import {
  buildRegistrationReturnHref,
  buildTaskRegistrationHref,
  readRegistrationReturnState,
} from "./registrationReturnState";

// Only the remote query state is replaced. Assertions exercise the real detail component.
const kit = await import("./volunteerKit.test.support");
const { VolunteerRegistrationDetail } = await import("./VolunteerRegistrationDetail");
const { VolunteerActivityWorkspace } = await import("./VolunteerActivityWorkspace");
const activityId = "90000000-0000-4000-8000-000000000001";
const registrationId = "90000000-0000-4000-8000-000000000026";
const scope =
  `return_from=calendar&date_scope=custom&from=2026-10-20&until=2026-10-20` +
  `&template=morning&status=published&sort=desc&page=2&detail_page=2&selected=${activityId}`;
const returnState = readRegistrationReturnState(new URLSearchParams(scope));

describe("daily read: existing safe list context", () => {
  test("same-day shift, activity status, sort and both pages survive opening a registration", () => {
    const detailHref = buildTaskRegistrationHref(registrationId, returnState);
    const back = buildRegistrationReturnHref(
      readRegistrationReturnState(new URL(detailHref, "http://fixture.invalid").searchParams),
    );
    const url = new URL(back, "http://fixture.invalid");
    expect(url.pathname).toBe("/admin/volunteers/calendar");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      date_scope: "custom",
      from: "2026-10-20",
      until: "2026-10-20",
      template: "morning",
      status: "published",
      sort: "desc",
      page: "2",
      selected: activityId,
      detail_page: "2",
    });
    expect(new URL(detailHref, url).pathname).toBe(
      "/admin/volunteers/registrations/90000000-0000-4000-8000-000000000026",
    );
  });

  test("direct entry gets an internal default and drops external destinations and private input", () => {
    const state = readRegistrationReturnState(
      new URLSearchParams(
        "return_from=https://outside.invalid&return_url=//outside.invalid&q=private@example.invalid",
      ),
    );
    expect(buildRegistrationReturnHref(state)).toBe("/admin/volunteers/activities");
    expect(buildTaskRegistrationHref(registrationId, state)).not.toContain("private");
  });

  test("an invalid date or status is normalized to the existing bounded defaults", () => {
    const result = readActivityRouteState(
      new URLSearchParams(
        "date_scope=custom&from=2026-02-30&until=2026-10-20&status=not-a-status&page=-2",
      ),
      "2026-10-20",
    );
    expect(result).toEqual({
      filters: {
        date_scope: "future",
        from: "2026-10-20",
        until: "2026-11-19",
        sort: "asc",
      },
      page: 1,
      detailPage: 1,
    });
  });
});

describe("daily read: a detail that cannot display must still let staff return", () => {
  for (const [language, render, label] of [
    ["zh", renderAdminInChinese, "返回義工管理"],
    ["en", renderAdminInEnglish, "Back to volunteer management"],
  ] as const) {
    for (const [state, query] of [
      ["loading", { isLoading: true, isPending: true }],
      ["missing", kit.ok({ registration: null })],
      [
        "not-found-http",
        kit.failed(Object.assign(new Error("Offline missing record"), { status: 404 })),
      ],
      ["failed", kit.failed(Object.assign(new Error("Offline read failed"), { status: 500 }))],
      ["forbidden", kit.failed(Object.assign(new Error("Forbidden"), { status: 403 }))],
      ["expired", kit.failed(Object.assign(new Error("Not signed in"), { status: 401 }))],
    ] as const) {
      test(`${language}: ${state} retains an internal return control without personal data or actions`, () => {
        kit.withQueries({ "volunteer-registration": query }, () => {
          const markup = render(
            <VolunteerRegistrationDetail
              registrationId={registrationId}
              returnState={returnState}
            />,
          );
          expect(markup).toContain(label);
          expect(markup).toContain('href="/admin/volunteers/calendar"');
          expect(markup).not.toContain("fixture@example");
          expect(markup).not.toContain("private@example");
          expect(markup).not.toContain(">Approve</button>");
          expect(markup).not.toContain("沒有符合篩選");
          expect(markup).not.toContain("0 registrations");
          if (state === "failed") {
            expect(markup).not.toContain("找不到義工報名");
            expect(markup).not.toContain("Registration not found");
          }
          if (state === "not-found-http")
            expect(markup).toMatch(
              language === "zh" ? /不存在|找不到/ : /could not be found|not found/,
            );
        });
      });
    }
  }

  test("an error reached from the task list preserves the task return label", () => {
    kit.withQueries({ "volunteer-registration": kit.failed() }, () => {
      const markup = renderAdminInChinese(
        <VolunteerRegistrationDetail
          registrationId={registrationId}
          returnState={readRegistrationReturnState(
            new URLSearchParams("return_from=tasks&pending_scope=overdue&page=2"),
          )}
        />,
      );
      expect(markup).toContain("返回待審清單");
      expect(markup).toContain('href="/admin/volunteers/tasks"');
    });
  });
});

describe("daily read: an unfinished list must not look like a confirmed zero", () => {
  for (const [language, render] of [
    ["zh", renderAdminInChinese],
    ["en", renderAdminInEnglish],
  ] as const) {
    for (const [state, query] of [
      ["initial read", { isLoading: true, isPending: true }],
      [
        "previous empty scope",
        {
          ...kit.ok({ activities: [], total: 0 }),
          isPlaceholderData: true,
          isFetching: true,
        },
      ],
    ] as const) {
      test(`${language}: ${state} shows an unknown count until the current read finishes`, () => {
        kit.withQueries(
          {
            "volunteer-workspace": query,
            "volunteer-workspace-templates": kit.ok({ templates: [] }),
          },
          () => {
            const markup = render(<VolunteerActivityWorkspace />);
            const copy = activityWorkspaceCopy[language].list;
            expect(markup).toContain(copy.heading(null));
            expect(markup).toContain(copy.loading);
            expect(markup).not.toContain(copy.heading(0));
            expect(markup).not.toContain(copy.empty);
            expect(markup).not.toContain(copy.noMatch);
          },
        );
      });
    }
  }
});

describe("daily read: Hong Kong date boundary", () => {
  test("the day changes at Hong Kong midnight, independently of the host timezone", () => {
    expect(hkDate(new Date("2026-10-19T15:59:59.999Z"))).toBe("2026-10-19");
    expect(hkDate(new Date("2026-10-19T16:00:00.000Z"))).toBe("2026-10-20");
    expect(hkDate(new Date("2026-10-31T16:00:00.000Z"))).toBe("2026-11-01");
  });
});
