import { describe, expect, test } from "bun:test";
import { navGroups } from "./navigation";

describe("public navigation", () => {
  test("keeps TNR discoverable without a retired CCCP link", () => {
    const items = navGroups.flatMap((group) => group.items);
    expect(items.some((item) => item.to === "/about/tnr")).toBe(true);
    expect(items.some((item) => item.to === "/about/cccp" || item.label.includes("CCCP"))).toBe(
      false,
    );
  });
});
