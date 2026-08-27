import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { findCurrentNavigation, navGroups } from "./navigation";

let pathname = "/";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname } }),
}));

function render(at = "/") {
  pathname = at;
  return import("./Header").then(({ Header }) => renderToStaticMarkup(<Header />));
}

const allItems = navGroups.flatMap((group) => group.items);

describe("public navigation IA", () => {
  // Previously asserted by grepping Header.tsx for two `links={aboutLinks}`
  // occurrences. Desktop and mobile now render from this one array, so a single
  // membership check is a stronger guarantee than counting call sites.
  test("keeps the knowledge hub and group volunteering reachable", () => {
    const destinations = allItems.map((item) => item.to);
    expect(destinations).toContain("/knowledge");
    expect(destinations).toContain("/volunteer/group");
  });

  test("covers the public routes without duplicating a destination", () => {
    const destinations = allItems.map((item) => item.to);
    expect(new Set(destinations).size).toBe(destinations.length);
    expect(navGroups).toHaveLength(5);
  });

  test("every destination is a same-origin router path", () => {
    for (const item of allItems) {
      expect(item.to.startsWith("/")).toBe(true);
      expect(item.to.startsWith("//")).toBe(false);
    }
  });

  test("highlights the deepest matching item, not its parent", () => {
    expect(findCurrentNavigation("/about/team")?.to).toBe("/about/team");
    expect(findCurrentNavigation("/about")?.to).toBe("/about");
    // A detail page keeps its listing highlighted.
    expect(findCurrentNavigation("/animals/cat/abc")?.to).toBe("/animals/cat");
    expect(findCurrentNavigation("/nowhere")).toBeNull();
  });
});

describe("Header rendering", () => {
  test("renders the ported public header shell", async () => {
    const markup = await render();
    expect(markup).toContain('class="site-header"');
    expect(markup).toContain("header-shell");
    expect(markup).toContain("brand-lockup");
  });

  test("each group trigger owns the popover it controls", async () => {
    const markup = await render();
    // Replaces the old source-regex that pinned Radix's NavigationMenu.Item
    // markup: what matters is that a trigger points at its own submenu.
    navGroups.forEach((group, index) => {
      expect(markup).toContain(`aria-controls="desktop-menu-${index}"`);
      expect(markup).toContain(group.label);
    });
    // Closed on first paint, so no popover is in the accessibility tree yet.
    expect(markup).not.toContain('id="desktop-menu-0"');
    expect(markup.match(/aria-expanded="false"/g)?.length).toBeGreaterThanOrEqual(navGroups.length);
  });

  test("exposes the drawer trigger with the dialog it controls", async () => {
    const markup = await render();
    expect(markup).toContain('aria-controls="mobile-drawer"');
    expect(markup).toContain('aria-label="開啟選單"');
    // The drawer itself mounts only when opened.
    expect(markup).not.toContain('role="dialog"');
  });

  test("marks the active section on the current route", async () => {
    const markup = await render("/animals/cat");
    expect(markup).toContain("is-current");
  });

  test("routes the donate call to action same-origin", async () => {
    const markup = await render();
    expect(markup).toContain('href="/donate"');
    expect(markup).not.toContain("hkscda.vercel.app");
    expect(markup).not.toContain("chatgpt.site");
  });
});
