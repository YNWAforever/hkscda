import { createServer } from "node:http";
import { createSupabaseServiceClient } from "../supabase.server";
import { createSupabaseAuthFetch } from "../supabaseAuthTransport.server";

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
  if (scenario === "fallback" || scenario === "proxy") {
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
  const id = authorization === "Bearer actor-b" ? "actor-b" : "actor-a";
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
  if (scenario === "fallback" || scenario === "proxy") {
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
