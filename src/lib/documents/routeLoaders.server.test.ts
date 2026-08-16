import { expect, test } from "bun:test";

import { asContextFreeRouteLoader } from "./routeLoaders.server";

test("does not forward TanStack Router loader context to an injectable dependency", async () => {
  const calls: unknown[][] = [];
  const routeLoader = asContextFreeRouteLoader(async (...args: unknown[]) => {
    calls.push(args);
    return ["loaded"];
  });

  const result = await (routeLoader as (context: unknown) => Promise<string[]>)({
    params: {},
    preload: false,
  });

  expect(result).toEqual(["loaded"]);
  expect(calls).toEqual([[]]);
});
