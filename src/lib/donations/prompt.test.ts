import { describe, expect, test } from "bun:test";
import { resolveDonationPrompt } from "./prompt";

describe("resolveDonationPrompt", () => {
  test.each([
    ["/stories", "story", "general"],
    ["/stories/lucky-new-start", "story", "general"],
    ["/animals/cat/123", "animal", "medical"],
    ["/adoption", "animal", "medical"],
    ["/sponsors", "sponsor", "sponsor"],
    ["/about", "transparency", "general"],
    ["/reports/annual", "transparency", "general"],
    ["/volunteer", "community", "general"],
    ["/help", "community", "general"],
    ["/", "general", "general"],
  ])("maps %s to %s", (pathname, context, purpose) => {
    expect(resolveDonationPrompt(pathname)).toMatchObject({ context, purpose });
  });

  test.each([
    "/donate",
    "/admin/login",
    "/adoption/apply",
    "/adoption/status/token",
    "/sponsors/pledge",
    "/sponsors/status/token",
    "/volunteer/status/token",
    "/api/stories",
  ])("hides workflow route %s", (pathname) => {
    expect(resolveDonationPrompt(pathname)).toBeNull();
  });
});
