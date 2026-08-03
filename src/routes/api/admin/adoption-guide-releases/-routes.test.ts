import { describe, expect, test } from "bun:test";

import { Route as CollectionRoute } from "../adoption-guide-releases";
import { Route as DetailRoute } from "./$id";
import { Route as PreviewRoute } from "./$id/preview";
import { Route as PublishRoute } from "./$id/publish";
import { Route as ReturnToDraftRoute } from "./$id/return-to-draft";
import { Route as SubmitRoute } from "./$id/submit";
import { Route as WithdrawRoute } from "./$id/withdraw";

type ResourceRoute = {
  options: {
    server?: {
      handlers?: Record<string, unknown>;
    };
  };
};

function methodNames(route: unknown) {
  const resourceRoute = route as ResourceRoute;
  return Object.keys(resourceRoute.options.server?.handlers ?? {}).sort();
}

function routeHandler(route: unknown, method: string) {
  const resourceRoute = route as ResourceRoute;
  return resourceRoute.options.server?.handlers?.[method] as (context: {
    request: Request;
    params?: { id: string };
  }) => Promise<Response>;
}

describe("adoption guide release resource routes", () => {
  test("registers only the approved HTTP methods on every resource", () => {
    expect(methodNames(CollectionRoute)).toEqual(["GET", "POST"]);
    expect(methodNames(DetailRoute)).toEqual(["GET", "PATCH"]);
    expect(methodNames(PreviewRoute)).toEqual(["GET"]);
    expect(methodNames(PublishRoute)).toEqual(["POST"]);
    expect(methodNames(ReturnToDraftRoute)).toEqual(["POST"]);
    expect(methodNames(SubmitRoute)).toEqual(["POST"]);
    expect(methodNames(WithdrawRoute)).toEqual(["POST"]);
  });

  test("keeps dependency construction inside every route response boundary", async () => {
    const params = { id: "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae" };
    const calls = [
      routeHandler(
        CollectionRoute,
        "GET",
      )({
        request: new Request("https://test/api/admin/adoption-guide-releases"),
      }),
      routeHandler(
        CollectionRoute,
        "POST",
      )({
        request: new Request("https://test/api/admin/adoption-guide-releases", {
          method: "POST",
        }),
      }),
      routeHandler(
        DetailRoute,
        "GET",
      )({
        request: new Request(`https://test/api/admin/adoption-guide-releases/${params.id}`),
        params,
      }),
      routeHandler(
        DetailRoute,
        "PATCH",
      )({
        request: new Request(`https://test/api/admin/adoption-guide-releases/${params.id}`, {
          method: "PATCH",
        }),
        params,
      }),
      routeHandler(
        PreviewRoute,
        "GET",
      )({
        request: new Request(`https://test/api/admin/adoption-guide-releases/${params.id}/preview`),
        params,
      }),
      routeHandler(
        PublishRoute,
        "POST",
      )({
        request: new Request(
          `https://test/api/admin/adoption-guide-releases/${params.id}/publish`,
          { method: "POST" },
        ),
        params,
      }),
      routeHandler(
        ReturnToDraftRoute,
        "POST",
      )({
        request: new Request(
          `https://test/api/admin/adoption-guide-releases/${params.id}/return-to-draft`,
          { method: "POST" },
        ),
        params,
      }),
      routeHandler(
        SubmitRoute,
        "POST",
      )({
        request: new Request(`https://test/api/admin/adoption-guide-releases/${params.id}/submit`, {
          method: "POST",
        }),
        params,
      }),
      routeHandler(
        WithdrawRoute,
        "POST",
      )({
        request: new Request(
          `https://test/api/admin/adoption-guide-releases/${params.id}/withdraw`,
          { method: "POST" },
        ),
        params,
      }),
    ];

    const responses = await Promise.all(calls);
    expect(responses).toHaveLength(9);
    for (const response of responses) {
      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});
