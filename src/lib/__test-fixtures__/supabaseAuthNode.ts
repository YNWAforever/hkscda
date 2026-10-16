import { createServer } from "node:http";
import { createSupabaseServiceClient } from "../supabase.server";
import { createSupabaseAuthFetch } from "../supabaseAuthTransport.server";
import { getAdminUserFromRequest } from "../admin/session.server";
import { gzipSync, deflateSync, brotliCompressSync } from "node:zlib";

for (const name of [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "NODE_USE_ENV_PROXY",
])
  delete process.env[name];

const authorizations: string[] = [];
const actorIds = {
  "actor-a": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "actor-b": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
const roleReads: { actor: string; status: string; authorization: string }[] = [];
const rpcReads: {
  path: string;
  body: string;
  bytes: number;
  contentLength: string;
  fallback: boolean;
  authorization: string;
  acceptEncoding: string;
}[] = [];
let connections = 0;
const scenario = process.argv[2] ?? "fresh";
const observed: { method: string; path: string; body: string; fallback: boolean }[] = [];
let bodyClosed: (() => void) | undefined;
let requestSeen: (() => void) | undefined;
let upstreamClosed = false;
const requestSeenPromise = new Promise<void>((resolve) => {
  requestSeen = resolve;
});
const bodyClosedPromise = new Promise<void>((resolve) => {
  bodyClosed = resolve;
});
const server = createServer(async (request, response) => {
  if (scenario === "fallback" || scenario === "proxy" || scenario === "role-fallback") {
    const chunks: Uint8Array[] = [];
    for await (const chunk of request) chunks.push(chunk as Uint8Array);
    observed.push({
      method: request.method ?? "",
      path: request.url ?? "",
      body: Buffer.concat(chunks).toString(),
      fallback: request.headers["x-fixture-fallback"] === "1",
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ received: observed.at(-1) }));
    return;
  }
  const url = new URL(request.url ?? "/", "http://fixture.invalid");
  if (
    (scenario.startsWith("role-") || scenario.startsWith("rpc-")) &&
    url.pathname === "/rest/v1/admin_user"
  ) {
    const actor = url.searchParams.get("auth_user_id")?.replace(/^eq\./, "") ?? "";
    const status =
      (scenario === "role-disabled" || scenario === "rpc-disabled") && roleReads.length === 1
        ? "disabled"
        : "active";
    roleReads.push({ actor, status, authorization: request.headers.authorization ?? "" });
    requestSeen?.();
    if (scenario === "role-abort-body") {
      response.on("close", () => {
        upstreamClosed = true;
        bodyClosed?.();
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.write("[");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify([
        {
          id: actor,
          auth_user_id: actor,
          email: actor + "@example.invalid",
          role: "admin",
          status,
        },
      ]),
    );
    return;
  }
  if (scenario.startsWith("rpc-") && url.pathname.startsWith("/rest/v1/rpc/")) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of request) chunks.push(chunk as Uint8Array);
    const body = Buffer.concat(chunks);
    rpcReads.push({
      path: url.pathname,
      body: body.toString(),
      bytes: body.length,
      contentLength: request.headers["content-length"] ?? "",
      fallback: request.headers["x-fixture-fallback"] === "1",
      authorization: request.headers.authorization ?? "",
      acceptEncoding: request.headers["accept-encoding"] ?? "",
    });
    requestSeen?.();
    if (["rpc-gzip", "rpc-deflate", "rpc-br"].includes(scenario)) {
      const encoding = scenario.slice(4),
        value = Buffer.from(JSON.stringify({ value: "義工🌏", ordinal: rpcReads.length }));
      response
        .writeHead(200, { "content-type": "application/json", "content-encoding": encoding })
        .end(
          encoding === "gzip"
            ? gzipSync(value)
            : encoding === "deflate"
              ? deflateSync(value)
              : brotliCompressSync(value),
        );
      return;
    }
    if (scenario === "rpc-abort-body") {
      response.on("close", () => {
        upstreamClosed = true;
        bodyClosed?.();
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.write("[");
      return;
    }
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ ordinal: rpcReads.length }));
    return;
  }
  if (request.url !== "/auth/v1/user" || request.method !== "GET") {
    response.writeHead(404).end();
    return;
  }
  const authorization = request.headers.authorization ?? "";
  authorizations.push(authorization);
  requestSeen?.();
  if (scenario === "header-timeout") {
    response.on("close", () => {
      upstreamClosed = true;
      bodyClosed?.();
    });
    return;
  }
  if (scenario === "no-body") {
    response.writeHead(204).end();
    return;
  }
  if (scenario === "abort-body" || scenario === "body-timeout") {
    response.on("close", () => {
      upstreamClosed = true;
      bodyClosed?.();
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.write("{");
    return;
  }
  if (scenario === "denied" && authorization === "Bearer rejected") {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ msg: "Invalid token" }));
    return;
  }
  const actor = authorization === "Bearer actor-b" ? "actor-b" : "actor-a";
  const id = scenario.startsWith("role-") || scenario.startsWith("rpc-") ? actorIds[actor] : actor;
  response.writeHead(200, {
    "content-type": "application/json",
    connection: "keep-alive",
    "keep-alive": "timeout=60",
  });
  response.end(
    JSON.stringify({
      id,
      email: `${id}@example.invalid`,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: "2026-01-01T00:00:00Z",
    }),
  );
});
server.on("connection", () => connections++);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Expected local HTTP fixture");
process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role";
const users: (string | null)[] = [];
try {
  if (
    scenario === "rpc-fresh" ||
    scenario === "rpc-disabled" ||
    scenario === "rpc-bounded" ||
    scenario === "rpc-abort-body" ||
    scenario === "rpc-fallback" ||
    scenario === "rpc-proxy" ||
    ["rpc-gzip", "rpc-deflate", "rpc-br"].includes(scenario)
  ) {
    const fallback = async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("x-fixture-fallback", "1");
      if (scenario === "rpc-fallback") {
        observed.push({
          method: init?.method ?? "GET",
          path: String(input),
          body: typeof init?.body === "string" ? init.body : "non-string",
          fallback: true,
        });
        return Response.json({});
      }
      return fetch(input, { ...init, headers });
    };
    const actor = actorIds["actor-a"],
      activity = actorIds["actor-b"];
    const body = JSON.stringify({
      p_actor: actor,
      p_command: { action: "detail", activity_id: activity, page: 2, history_page: 1 },
    });
    if (scenario === "rpc-proxy") process.env.HTTPS_PROXY = "http://127.0.0.1:9";
    const transport = createSupabaseAuthFetch(process.env.SUPABASE_URL, fallback);
    const endpoint = process.env.SUPABASE_URL + "/rest/v1/rpc/";
    const post = (name: string, value: string, extra: RequestInit = {}) =>
      transport(endpoint + name, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer synthetic-service-role",
        },
        body: value,
        ...extra,
      });
    if (scenario === "rpc-fresh" || scenario === "rpc-disabled") {
      const values = [];
      for (const token of scenario === "rpc-disabled"
        ? ["actor-a", "actor-a", "actor-b"]
        : ["actor-a", "actor-b", "actor-a"]) {
        const client = createSupabaseServiceClient();
        try {
          const admin = await getAdminUserFromRequest(
            new Request("http://fixture.invalid/admin", {
              headers: { authorization: "Bearer " + token },
            }),
            client,
          );
          values.push(
            await (
              await post(
                "volunteer_bulk_command",
                JSON.stringify({
                  p_actor: admin.authUserId,
                  p_command: { action: "detail", activity_id: activity, page: 2, history_page: 1 },
                }),
              )
            ).json(),
          );
        } catch (error) {
          if (scenario !== "rpc-disabled" || !(error instanceof Response) || error.status !== 403)
            throw error;
          values.push(null);
        }
      }
      console.log(JSON.stringify({ authorizations, roleReads, rpcReads, values, connections }));
    } else if (["rpc-gzip", "rpc-deflate", "rpc-br"].includes(scenario)) {
      const response = await post("volunteer_bulk_command", body);
      console.log(
        JSON.stringify({
          value: await response.json(),
          encoding: response.headers.get("content-encoding"),
          rpcReads,
        }),
      );
    } else if (scenario === "rpc-bounded") {
      const bodies = [
        ["volunteer_bulk_command", body],
        [
          "volunteer_pending_work_snapshot",
          JSON.stringify({
            p_actor: actor,
            p_scope: "upcoming",
            p_page: 1,
            p_page_size: 25,
            p_as_of: "2026-10-16T00:00:00.123456Z",
            p_query: "義工🌏",
          }),
        ],
        [
          "volunteer_task_command",
          JSON.stringify({
            p_actor: actor,
            p_command: {
              action: "list",
              scope: "upcoming",
              page: 1,
              pageSize: 25,
              q: "義工🌏",
              include_pending: false,
            },
          }),
        ],
      ];
      for (const [name, value] of bodies) await (await post(name, value)).text();
      console.log(JSON.stringify({ rpcReads, bodies, connections }));
    } else if (scenario === "rpc-abort-body") {
      const controller = new AbortController();
      const response = await post("volunteer_bulk_command", body, { signal: controller.signal });
      const text = response.text();
      controller.abort();
      let errorName = "";
      try {
        await text;
      } catch (error) {
        errorName = error instanceof Error ? error.name : "unknown";
      }
      await bodyClosedPromise;
      console.log(JSON.stringify({ errorName, requests: rpcReads.length, upstreamClosed }));
    } else if (scenario === "rpc-proxy") {
      await (await post("volunteer_bulk_command", body)).text();
      console.log(JSON.stringify({ rpcReads }));
    } else {
      const parsed = JSON.parse(body) as { p_actor: string; p_command: Record<string, unknown> };
      const cases: Array<[string, RequestInit]> = [
        [
          endpoint + "volunteer_bulk_command",
          {
            method: "POST",
            body: JSON.stringify({
              ...parsed,
              p_command: { action: "attendance_apply", operation_id: activity },
            }),
          },
        ],
        [
          endpoint + "volunteer_bulk_command",
          {
            method: "POST",
            body: JSON.stringify({
              ...parsed,
              p_command: { ...parsed.p_command, operationType: "read" },
            }),
          },
        ],
        [
          endpoint + "volunteer_bulk_command",
          {
            method: "POST",
            body: JSON.stringify({ ...parsed, p_command: { ...parsed.p_command, page: 0 } }),
          },
        ],
        [
          endpoint + "volunteer_bulk_command",
          { method: "POST", body: JSON.stringify({ ...parsed, p_actor: "caller" }) },
        ],
        [endpoint + "volunteer_bulk_command?extra=1", { method: "POST", body }],
        [endpoint + "volunteer_bulk_command#fragment", { method: "POST", body }],
        [endpoint + "volunteer_bulk_command", { method: "POST", body: "[]" }],
        [endpoint + "volunteer_bulk_command", { method: "POST", body: "{" }],
        [endpoint + "volunteer_bulk_command", { method: "POST", body: " ".repeat(9000) + body }],
        [endpoint + "volunteer_bulk_command", { method: "GET", body }],
        [endpoint + "volunteer_bulk_command", { method: "PATCH", body }],
        [
          endpoint + "volunteer_bulk_command",
          { method: "POST", body: new TextEncoder().encode(body) },
        ],
        [
          endpoint + "volunteer_task_command",
          {
            method: "POST",
            body: JSON.stringify({
              p_actor: actor,
              p_command: { action: "complete", id: activity, reason: "test" },
            }),
          },
        ],
        [
          endpoint + "volunteer_task_command",
          {
            method: "POST",
            body: JSON.stringify({ p_actor: actor, p_command: { action: "retry", id: activity } }),
          },
        ],
        [endpoint + "other", { method: "POST", body }],
        ["http://other.invalid/rest/v1/rpc/volunteer_bulk_command", { method: "POST", body }],
        [
          endpoint + "volunteer_bulk_command",
          {
            method: "POST",
            body,
            headers: { "content-type": "application/json", "content-length": "1" },
          },
        ],
        [
          endpoint + "volunteer_bulk_command",
          {
            method: "POST",
            body,
            headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
          },
        ],
        [
          endpoint + "volunteer_bulk_command",
          { method: "POST", body, headers: { "content-type": "text/plain" } },
        ],
        [endpoint + "volunteer_bulk_command", { method: "POST", body, redirect: "manual" }],
        [
          endpoint + "volunteer_pending_work_snapshot",
          {
            method: "POST",
            body: JSON.stringify({
              p_actor: actor,
              p_scope: "upcoming",
              p_page: 1,
              p_page_size: 101,
              p_as_of: "2026-10-16T00:00:00Z",
              p_query: "",
            }),
          },
        ],
        [
          endpoint + "volunteer_pending_work_snapshot",
          {
            method: "POST",
            body: JSON.stringify({
              p_actor: actor,
              p_scope: "upcoming",
              p_page: 1,
              p_page_size: 25,
              p_as_of: "bad",
              p_query: "",
            }),
          },
        ],
        [
          endpoint + "volunteer_pending_work_snapshot",
          {
            method: "POST",
            body: JSON.stringify({
              p_actor: actor,
              p_scope: "upcoming",
              p_page: 1,
              p_page_size: 25,
              p_as_of: "2026-10-16T00:00:00Z",
              p_query: "x".repeat(101),
            }),
          },
        ],
        [
          endpoint + "volunteer_task_command",
          {
            method: "POST",
            body: JSON.stringify({
              p_actor: actor,
              p_command: { action: "list", include_pending: true },
            }),
          },
        ],
        [
          endpoint + "volunteer_bulk_command",
          { method: "POST", body: JSON.stringify({ ...parsed, operationType: "read" }) },
        ],
        [
          endpoint + "volunteer_bulk_command",
          {
            method: "POST",
            body,
            headers: { "content-type": "application/json", "content-encoding": "gzip" },
          },
        ],
        [
          endpoint + "volunteer_bulk_command",
          { method: "POST", body, integrity: "synthetic-integrity" },
        ],
        [endpoint + "volunteer_bulk_command/", { method: "POST", body }],
        [endpoint + "%76olunteer_bulk_command", { method: "POST", body }],
      ];
      for (const [url, options] of cases)
        await (
          await transport(url, {
            ...options,
            headers: options.headers ?? { "content-type": "application/json" },
          })
        ).text();
      console.log(JSON.stringify({ observed, requests: rpcReads.length }));
    }
  } else if (scenario === "role-fresh" || scenario === "role-disabled") {
    for (const token of scenario === "role-disabled"
      ? ["actor-a", "actor-a", "actor-b"]
      : ["actor-a", "actor-b", "actor-a"]) {
      try {
        const admin = await getAdminUserFromRequest(
          new Request("http://fixture.invalid/admin", {
            headers: { authorization: "Bearer " + token },
          }),
        );
        users.push(admin.authUserId);
      } catch (error) {
        if (scenario !== "role-disabled" || !(error instanceof Response) || error.status !== 403)
          throw error;
        users.push(null);
      }
    }
    console.log(JSON.stringify({ authorizations, roleReads, users, connections }));
  } else if (scenario === "role-fallback") {
    const nativeFetch = globalThis.fetch;
    const transport = createSupabaseAuthFetch(process.env.SUPABASE_URL, (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("x-fixture-fallback", "1");
      return nativeFetch(input, { ...init, headers });
    });
    const endpoint = process.env.SUPABASE_URL + "/rest/v1/admin_user";
    const query =
      "?select=id,auth_user_id,email,role,status&auth_user_id=eq." + actorIds["actor-a"];
    for (const path of [
      "?select=*",
      query + "&status=eq.active",
      query + "&auth_user_id=eq." + actorIds["actor-b"],
      "?select=id,auth_user_id,email,role,status&auth_user_id=eq.actor-a",
    ])
      await (await transport(endpoint + path)).text();
    await (
      await transport(endpoint + query, { method: "POST", body: '{"status":"disabled"}' })
    ).text();
    console.log(JSON.stringify({ observed }));
  } else if (scenario === "role-abort-body") {
    const transport = createSupabaseAuthFetch(process.env.SUPABASE_URL);
    const controller = new AbortController();
    const url =
      process.env.SUPABASE_URL +
      "/rest/v1/admin_user?select=id,auth_user_id,email,role,status&auth_user_id=eq." +
      actorIds["actor-a"];
    const response = await transport(url, { signal: controller.signal });
    const body = response.text();
    controller.abort();
    let errorName = "";
    try {
      await body;
    } catch (error) {
      errorName = error instanceof Error ? error.name : "unknown";
    }
    await bodyClosedPromise;
    console.log(JSON.stringify({ errorName, requests: roleReads.length, upstreamClosed }));
  } else if (scenario === "fallback" || scenario === "proxy") {
    if (scenario === "proxy") process.env.HTTPS_PROXY = "http://127.0.0.1:9";
    const nativeFetch = globalThis.fetch;
    const transport = createSupabaseAuthFetch(process.env.SUPABASE_URL, (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("x-fixture-fallback", "1");
      return nativeFetch(input, { ...init, headers });
    });
    if (scenario === "proxy") {
      await (await transport(`${process.env.SUPABASE_URL}/auth/v1/user`)).json();
      console.log(JSON.stringify({ observed }));
    } else {
      await (
        await transport(`${process.env.SUPABASE_URL}/auth/v1/user`, {
          method: "POST",
          body: '{"command":"unchanged"}',
        })
      ).json();
      await (
        await transport(`${process.env.SUPABASE_URL}/rest/v1/rpc/example`, {
          method: "POST",
          body: '{"action":"apply"}',
        })
      ).json();
      await (await transport(`${process.env.SUPABASE_URL}/auth/v1/user?unexpected=1`)).json();
      console.log(JSON.stringify({ observed }));
    }
  } else if (scenario === "header-timeout" || scenario === "body-timeout") {
    const timers = new Set<() => void>();
    const transport = createSupabaseAuthFetch(
      process.env.SUPABASE_URL,
      undefined,
      (callback: () => void, _ms: number) => {
        timers.add(callback);
        return () => {
          timers.delete(callback);
        };
      },
    );
    const response = transport(`${process.env.SUPABASE_URL}/auth/v1/user`);
    void response.catch(() => {});
    let body: Promise<string> | undefined;
    if (scenario === "body-timeout") body = (await response).text();
    if (body) void body.catch(() => {});
    await requestSeenPromise;
    const timeout = [...timers][0];
    if (!timeout) throw new Error("Expected a bounded network timeout");
    timeout();
    let errorName = "";
    try {
      await (body ?? response);
    } catch (error) {
      errorName = error instanceof Error ? error.name : "unknown";
    }
    await bodyClosedPromise;
    console.log(JSON.stringify({ errorName, requests: authorizations.length, upstreamClosed }));
  } else if (scenario === "no-body") {
    const transport = createSupabaseAuthFetch(process.env.SUPABASE_URL);
    const response = await transport(`${process.env.SUPABASE_URL}/auth/v1/user`);
    console.log(JSON.stringify({ status: response.status, body: await response.text() }));
  } else if (scenario === "abort-before" || scenario === "abort-body") {
    const transport = createSupabaseAuthFetch(process.env.SUPABASE_URL);
    const controller = new AbortController();
    if (scenario === "abort-before") controller.abort();
    let errorName = "";
    try {
      const response = await transport(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        signal: controller.signal,
      });
      const body = response.text();
      controller.abort();
      await body;
    } catch (error) {
      errorName = error instanceof Error ? error.name : "unknown";
    }
    if (scenario === "abort-body") await bodyClosedPromise;
    console.log(JSON.stringify({ errorName, requests: authorizations.length }));
  } else {
    for (const token of scenario === "denied"
      ? ["actor-a", "rejected", "actor-b"]
      : ["actor-a", "actor-b", "actor-a"]) {
      // The real composition creates a service client for each incoming request.
      const client = createSupabaseServiceClient();
      const result = await client.auth.getUser(token);
      if (scenario === "denied" && token === "rejected") {
        if (result.error?.status !== 401 || result.data.user !== null)
          throw new Error("Expected fresh Auth denial");
        users.push(null);
      } else {
        if (result.error || !result.data.user) throw new Error("Synthetic Auth read failed");
        users.push(result.data.user.id);
      }
    }
    console.log(JSON.stringify({ authorizations, users, connections }));
  }
} finally {
  server.closeIdleConnections();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
