import { describe, expect, mock, test } from "bun:test";

import type { AdminUser } from "../../../../lib/admin/session.server";
import { createAdoptionGuideReleaseRouteDelegates, toAdoptionGuideActor } from "./-handlers";

const releaseId = "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae";

function request(path: string, method = "GET") {
  return new Request(`https://test${path}`, { method });
}

describe("adoption guide release production composition", () => {
  test("redacts synchronous dependency-construction failures with no-store", async () => {
    const routes = createAdoptionGuideReleaseRouteDelegates(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY=secret construction failure");
    });

    const response = await routes.list(request("/api/admin/adoption-guide-releases"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      error: {
        code: "internal",
        message: "The adoption guide release request could not be completed.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("construction");
  });

  test("rejects treasurer output at the production role adapter", () => {
    const treasurer: AdminUser = {
      id: "admin-row",
      authUserId: "auth-row",
      email: "treasurer@example.test",
      role: "treasurer",
      status: "active",
    };

    expect(() => toAdoptionGuideActor(treasurer)).toThrow(expect.objectContaining({ status: 403 }));
  });

  test("delegates every resource operation through one fresh composition", async () => {
    const calls: string[] = [];
    const factory = mock(() => {
      const response = () =>
        Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      return {
        list: mock(async () => {
          calls.push("list");
          return response();
        }),
        create: mock(async () => {
          calls.push("create");
          return response();
        }),
        get: mock(async () => {
          calls.push("get");
          return response();
        }),
        update: mock(async () => {
          calls.push("update");
          return response();
        }),
        submit: mock(async () => {
          calls.push("submit");
          return response();
        }),
        withdraw: mock(async () => {
          calls.push("withdraw");
          return response();
        }),
        returnToDraft: mock(async () => {
          calls.push("returnToDraft");
          return response();
        }),
        preview: mock(async () => {
          calls.push("preview");
          return response();
        }),
        publish: mock(async () => {
          calls.push("publish");
          return response();
        }),
      };
    });
    const routes = createAdoptionGuideReleaseRouteDelegates(factory);
    const params = { id: releaseId };

    await routes.list(request("/api/admin/adoption-guide-releases"));
    await routes.create(request("/api/admin/adoption-guide-releases", "POST"));
    await routes.get(request(`/api/admin/adoption-guide-releases/${releaseId}`), params);
    await routes.update(
      request(`/api/admin/adoption-guide-releases/${releaseId}`, "PATCH"),
      params,
    );
    await routes.submit(
      request(`/api/admin/adoption-guide-releases/${releaseId}/submit`, "POST"),
      params,
    );
    await routes.withdraw(
      request(`/api/admin/adoption-guide-releases/${releaseId}/withdraw`, "POST"),
      params,
    );
    await routes.returnToDraft(
      request(`/api/admin/adoption-guide-releases/${releaseId}/return-to-draft`, "POST"),
      params,
    );
    await routes.preview(
      request(`/api/admin/adoption-guide-releases/${releaseId}/preview`),
      params,
    );
    await routes.publish(
      request(`/api/admin/adoption-guide-releases/${releaseId}/publish`, "POST"),
      params,
    );

    expect(calls).toEqual([
      "list",
      "create",
      "get",
      "update",
      "submit",
      "withdraw",
      "returnToDraft",
      "preview",
      "publish",
    ]);
    expect(factory).toHaveBeenCalledTimes(9);
  });
});
