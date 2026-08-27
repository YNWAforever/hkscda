import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const route = (species: "cat" | "dog") =>
  readFileSync(join(process.cwd(), `src/routes/animals/${species}.tsx`), "utf8");

/**
 * Defect G-01: both listings read animals from the browser, so the first paint
 * had no data, pagination was unordered, and the age filter ran after
 * pagination - the total and the page count disagreed. The fix is structural,
 * so it is asserted structurally.
 */
describe("animal listings are server rendered", () => {
  for (const species of ["cat", "dog"] as const) {
    test(`/animals/${species} loads through a route loader, not a browser query`, () => {
      const source = route(species);

      expect(source).toContain("loader:");
      expect(source).toContain("loaderDeps:");
      expect(source).toContain("getPublicAnimalListing");
      // A browser query here is what made the first response dataless.
      expect(source).not.toContain("useQuery");
    });

    test(`/animals/${species} keeps its search contract`, () => {
      const source = route(species);

      // page and filter are pre-existing; gender is the one addition, approved
      // as decision D-4 under the PR #60 naming rather than the design source sex.
      expect(source).toContain("page:");
      expect(source).toContain("filter:");
      expect(source).toContain("gender:");
      expect(source).not.toContain("sex:");
    });

    test(`/animals/${species} declares pending and error states`, () => {
      const source = route(species);
      expect(source).toContain("pendingComponent");
      expect(source).toContain("errorComponent");
    });
  }

  test("both species render through the same component, so they cannot drift", () => {
    expect(route("cat")).toContain("AnimalListingPage");
    expect(route("dog")).toContain("AnimalListingPage");
  });
});
