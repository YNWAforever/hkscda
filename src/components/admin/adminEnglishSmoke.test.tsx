import { describe, expect, test } from "bun:test";

import { loadDestinations, withQueryState, type Destination } from "./adminDestinationsTesting";
import { adminCopy } from "./adminI18n";
import { ADMIN_NAV_ITEMS, type AdminNavItemId } from "./adminNav";
import { expectNoChineseText, renderAdminInEnglish } from "./i18n/testing";

const { DESTINATIONS, EXTRA_DESTINATIONS } = await loadDestinations();

/**
 * The smoke test of the finished English admin: it renders the page behind every destination of
 * the navigation (`ADMIN_NAV_ITEMS`), and the task overview the layout links to above them
 * (`EXTRA_DESTINATIONS`), in English and fails on any Chinese left in the markup.
 *
 * There is no allow-list. Every query is either still loading or has answered with nothing, so
 * no stored Chinese data can reach the page, and the only Chinese that could appear is interface
 * text that was never translated. Anything that fails here is a missing translation.
 *
 * The area tests (`*English.test.tsx`) check each screen in depth, with data, dialogs and errors.
 * This test checks that no destination was left out: `DESTINATIONS` is keyed by every
 * navigation item id, so `tsc` rejects a new item without a page here, and the last test fails
 * the suite if the number of pages rendered differs from the navigation's.
 *
 * It renders each page without the layout (`AdminLayout`, `VolunteerAdminShell`) around it. The
 * layouts have their own English tests, and their language switch names each language in its
 * own language, which is the one Chinese word an English screen shows by design.
 *
 * No assertion depends on the clock. Some pages print today's date, so the markup differs from
 * one day to the next, but no check here looks at a date.
 */

type Rendering = Record<"loading" | "empty", string>;
const renderings = new Map<AdminNavItemId, Rendering>();

/** A page in English, loading and with no data. */
function renderBoth(destination: Destination): Rendering {
  const render = (state: "loading" | "empty") =>
    withQueryState(state, () => renderAdminInEnglish(destination.page()));
  return { loading: render("loading"), empty: render("empty") };
}

/** The page of one navigation item in English, loading and with no data. Each is rendered once. */
function rendering(id: AdminNavItemId): Rendering {
  const known = renderings.get(id);
  if (known) return known;
  const created = renderBoth(DESTINATIONS[id]);
  renderings.set(id, created);
  return created;
}

describe("every admin destination in English", () => {
  for (const item of ADMIN_NAV_ITEMS) {
    test(`${item.id} has no Chinese, loading or empty`, () => {
      expect(
        DESTINATIONS[item.id],
        `The navigation item "${item.id}" has no page here. Add it to DESTINATIONS.`,
      ).toBeDefined();
      const label = adminCopy.en.navItems[item.id];
      expect(label.length, `English navigation label of ${item.id}`).toBeGreaterThan(0);
      expectNoChineseText(label);

      const { loading, empty } = rendering(item.id);
      expect(loading.length, `${item.id} rendered nothing while loading`).toBeGreaterThan(0);
      expectNoChineseText(loading);
      expect(empty, `${item.id} should show its English page`).toContain(
        DESTINATIONS[item.id].shows,
      );
      expectNoChineseText(empty);
    });
  }

  for (const [id, destination] of Object.entries(EXTRA_DESTINATIONS)) {
    test(`${id}, linked outside the navigation items, has no Chinese, loading or empty`, () => {
      const { loading, empty } = renderBoth(destination);
      expect(loading.length, `${id} rendered nothing while loading`).toBeGreaterThan(0);
      expectNoChineseText(loading);
      expect(empty, `${id} should show its English page`).toContain(destination.shows);
      expectNoChineseText(empty);
    });
  }

  test("renders one page for every navigation destination", () => {
    const ids = ADMIN_NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size, "navigation ids are unique").toBe(ids.length);
    // Both directions: a nav item with no page here, and a page here for an item that is gone.
    expect(Object.keys(DESTINATIONS).sort()).toEqual([...ids].sort());
    for (const id of ids) rendering(id);
    expect(renderings.size).toBe(ADMIN_NAV_ITEMS.length);
  });
});
