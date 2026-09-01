import { describe, expect, test } from "bun:test";

import { extractProjectRef, isProductionProjectRef, PRODUCTION_PROJECT_REF } from "./seed-admin.js";

describe("extractProjectRef", () => {
  test("extracts the project ref from a real-shaped Supabase URL", () => {
    expect(extractProjectRef("https://iihqjzilgawhfdhdevam.supabase.co")).toBe(
      "iihqjzilgawhfdhdevam",
    );
  });

  test("extracts the project ref from a different, non-production Supabase URL", () => {
    expect(extractProjectRef("https://abcdefghijklmnop.supabase.co")).toBe("abcdefghijklmnop");
  });

  test("returns null for a malformed or non-Supabase URL", () => {
    expect(extractProjectRef("https://example.com")).toBeNull();
    expect(extractProjectRef("not-a-url")).toBeNull();
  });

  test("returns null for undefined or empty input", () => {
    expect(extractProjectRef(undefined)).toBeNull();
    expect(extractProjectRef("")).toBeNull();
  });

  test("normalizes case so an upper-case or mixed-case host still extracts the ref", () => {
    expect(extractProjectRef("https://IIHQJZILGAWHFDHDEVAM.supabase.co")).toBe(
      "iihqjzilgawhfdhdevam",
    );
    expect(extractProjectRef("https://IiHqJzIlGaWhFdHdEvAm.supabase.co")).toBe(
      "iihqjzilgawhfdhdevam",
    );
  });
});

describe("isProductionProjectRef", () => {
  test("returns true for the production Supabase URL", () => {
    expect(isProductionProjectRef(`https://${PRODUCTION_PROJECT_REF}.supabase.co`)).toBe(true);
  });

  test("returns false for a different Supabase project's URL", () => {
    expect(isProductionProjectRef("https://abcdefghijklmnop.supabase.co")).toBe(false);
  });

  test("returns false for a malformed URL", () => {
    expect(isProductionProjectRef("not-a-url")).toBe(false);
  });

  test("returns true for the production Supabase URL with an upper-case project ref", () => {
    expect(
      isProductionProjectRef(`https://${PRODUCTION_PROJECT_REF.toUpperCase()}.supabase.co`),
    ).toBe(true);
  });
});
