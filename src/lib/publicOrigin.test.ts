import { describe, expect, test } from "bun:test";

import { PUBLIC_SITE_ORIGIN, publicUrl } from "./publicOrigin";

describe("public site origin", () => {
  test("is a bare origin with no trailing slash and no path", () => {
    expect(PUBLIC_SITE_ORIGIN.startsWith("https://")).toBe(true);
    expect(PUBLIC_SITE_ORIGIN.endsWith("/")).toBe(false);
    // origin only: scheme + host, nothing after it
    expect(PUBLIC_SITE_ORIGIN.slice("https://".length)).not.toContain("/");
  });

  test("builds absolute URLs from root-relative paths", () => {
    expect(publicUrl("/stories")).toBe(PUBLIC_SITE_ORIGIN + "/stories");
    expect(publicUrl("/")).toBe(PUBLIC_SITE_ORIGIN + "/");
    expect(publicUrl()).toBe(PUBLIC_SITE_ORIGIN + "/");
  });

  test("never emits a doubled slash", () => {
    for (const path of ["/", "/stories", "/about/team"]) {
      expect(publicUrl(path).replace("https://", "")).not.toContain("//");
    }
  });
});
