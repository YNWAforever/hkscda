import { describe, expect, spyOn, test } from "bun:test";

import { loadPublicDetailOrNotFound } from "./publicDetailLoader";

describe("loadPublicDetailOrNotFound", () => {
  test("returns a public animal", async () => {
    await expect(loadPublicDetailOrNotFound(async () => ({ id: "animal-1" }))).resolves.toEqual({
      id: "animal-1",
    });
  });

  test("throws a router not-found result for genuine absence", async () => {
    await expect(loadPublicDetailOrNotFound(async () => null)).rejects.toMatchObject({
      isNotFound: true,
    });
  });

  test("returns the outage sentinel when the data source throws", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        loadPublicDetailOrNotFound(async () => {
          throw new Error("database unavailable");
        }),
      ).resolves.toBeNull();
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
