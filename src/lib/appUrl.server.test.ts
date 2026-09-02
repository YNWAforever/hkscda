import { afterEach, describe, expect, test } from "bun:test";

import { getAppUrl } from "./appUrl.server";

describe("getAppUrl", () => {
  afterEach(() => {
    delete process.env.APP_URL;
  });

  test("falls back to the Vite dev server origin when APP_URL is unset", () => {
    delete process.env.APP_URL;
    expect(getAppUrl()).toBe("http://localhost:5173");
  });

  test("returns the real value when APP_URL is set", () => {
    process.env.APP_URL = "https://hkscda.vercel.app";
    expect(getAppUrl()).toBe("https://hkscda.vercel.app");
  });
});
