import { describe, expect, mock, test } from "bun:test";

type ResourceRoute = {
  options: {
    server?: {
      handlers?: Record<string, unknown>;
    };
  };
};

describe("photo-upload-urls route", () => {
  test("module exports a Route with a POST handler", async () => {
    const { Route } = await import("./photo-upload-urls");
    const resourceRoute = Route as unknown as ResourceRoute;
    expect(resourceRoute.options.server?.handlers?.POST).toBeDefined();
  });
});
