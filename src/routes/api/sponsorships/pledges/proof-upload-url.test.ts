import { describe, expect, test } from "bun:test";

type ResourceRoute = {
  options: {
    server?: {
      handlers?: Record<string, unknown>;
    };
  };
};

describe("proof-upload-url route", () => {
  test("module exports a Route with a POST handler", async () => {
    const { Route } = await import("./proof-upload-url");
    const resourceRoute = Route as unknown as ResourceRoute;
    expect(resourceRoute.options.server?.handlers?.POST).toBeDefined();
  });
});
