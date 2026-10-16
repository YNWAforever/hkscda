import type { Agent as HttpAgent } from "node:http";
import type { Agent as HttpsAgent } from "node:https";

type ServerFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type ScheduleTimeout = (callback: () => void, milliseconds: number) => () => void;
const scheduleAuthTimeout: ScheduleTimeout = (callback, milliseconds) => {
  const timer = setTimeout(callback, milliseconds);
  timer.unref();
  return () => clearTimeout(timer);
};

// Reuse connections, never user/session/role results. Every read reaches upstream.
let httpAgent: HttpAgent | undefined;
let httpsAgent: HttpsAgent | undefined;
let nodeTransports: Promise<[typeof import("node:http"), typeof import("node:https")]> | undefined;

export function createSupabaseAuthFetch(
  baseUrl: string,
  fallback: ServerFetch = fetch,
  scheduleTimeout: ScheduleTimeout = scheduleAuthTimeout,
): ServerFetch {
  // Bun's fetch does not exhibit the measured Node dispatcher wait.
  if (
    process.versions.bun ||
    ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"].some(
      (name) => Boolean(process.env[name]),
    )
  )
    return fallback;
  const endpoint = new URL(`${baseUrl.replace(/\/+$/, "")}/auth/v1/user`);
  const roleEndpoint = new URL(`${baseUrl.replace(/\/+$/, "")}/rest/v1/admin_user`);
  return (input, init = {}) => {
    if (typeof input !== "string" && !(input instanceof URL)) return fallback(input, init);
    const target = new URL(input);
    // Match only the bounded role lookup made after a fresh Auth check.
    // Unknown query shapes retain their caller's transport and semantics.
    const roleLookup =
      target.origin === roleEndpoint.origin &&
      target.username === roleEndpoint.username &&
      target.password === roleEndpoint.password &&
      target.pathname === roleEndpoint.pathname &&
      target.hash === "" &&
      target.searchParams.size === 2 &&
      target.searchParams.get("select") === "id,auth_user_id,email,role,status" &&
      /^eq\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        target.searchParams.get("auth_user_id") ?? "",
      );
    if (
      (!roleLookup && target.href !== endpoint.href) ||
      !["http:", "https:"].includes(target.protocol) ||
      (init.method ?? "GET").toUpperCase() !== "GET" ||
      init.body != null ||
      init.redirect ||
      init.integrity
    )
      return fallback(input, init);
    const signal = init.signal;
    const abortReason = () =>
      signal?.reason instanceof Error
        ? signal.reason
        : new DOMException("The operation was aborted", "AbortError");
    if (signal?.aborted) return Promise.reject(abortReason());
    const headers = new Headers(init.headers);
    headers.set("accept-encoding", "identity");
    nodeTransports ??= Promise.all([import("node:http"), import("node:https")]);
    return nodeTransports.then(([http, https]) => {
      if (signal?.aborted) return Promise.reject(abortReason());
      return new Promise<Response>((resolve, reject) => {
        const send = target.protocol === "https:" ? https.request : http.request;
        let aborted: Error | undefined;
        let stopDeadline = () => {};
        let stopConnectListener = () => {};
        const cleanup = () => {
          stopDeadline();
          stopConnectListener();
          signal?.removeEventListener("abort", abort);
        };
        const setDeadline = (milliseconds: number) => {
          stopDeadline();
          stopDeadline = scheduleTimeout(() => {
            aborted = new DOMException("Auth request timed out", "TimeoutError");
            request.destroy(aborted);
          }, milliseconds);
        };
        const request = send(
          target,
          {
            method: "GET",
            headers: Object.fromEntries(headers),
            agent:
              target.protocol === "https:"
                ? (httpsAgent ??= new https.Agent({ keepAlive: true }))
                : (httpAgent ??= new http.Agent({ keepAlive: true })),
          },
          (incoming) => {
            setDeadline(300_000);
            // Preserve native fetch redirect/encoding behavior for unexpected servers.
            if (
              (incoming.statusCode !== undefined &&
                incoming.statusCode >= 300 &&
                incoming.statusCode < 400) ||
              (incoming.headers["content-encoding"] &&
                incoming.headers["content-encoding"] !== "identity")
            ) {
              incoming.resume();
              incoming.once("end", cleanup);
              incoming.once("error", cleanup);
              resolve(fallback(input, init));
              return;
            }
            const responseHeaders = new Headers();
            for (let index = 0; index < incoming.rawHeaders.length; index += 2)
              responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
            if (incoming.statusCode === 204 || incoming.statusCode === 205) {
              incoming.once("end", cleanup);
              incoming.once("error", cleanup);
              incoming.resume();
              resolve(
                new Response(null, {
                  status: incoming.statusCode,
                  statusText: incoming.statusMessage,
                  headers: responseHeaders,
                }),
              );
              return;
            }
            const body = new ReadableStream<Uint8Array>({
              start(controller) {
                incoming.on("data", (chunk: Buffer) => {
                  setDeadline(300_000);
                  controller.enqueue(chunk);
                  if ((controller.desiredSize ?? 0) <= 0) incoming.pause();
                });
                incoming.once("end", () => {
                  cleanup();
                  controller.close();
                });
                incoming.once("error", (error) => {
                  cleanup();
                  controller.error(aborted ?? error);
                });
              },
              pull() {
                incoming.resume();
              },
              cancel() {
                cleanup();
                incoming.destroy();
              },
            });
            resolve(
              new Response(body, {
                status: incoming.statusCode,
                statusText: incoming.statusMessage,
                headers: responseHeaders,
              }),
            );
          },
        );
        const abort = () => {
          aborted = abortReason();
          request.destroy(aborted);
        };
        request.once("error", (error) => {
          cleanup();
          reject(error);
        });
        signal?.addEventListener("abort", abort, { once: true });
        request.once("socket", (socket) => {
          const connected = () => setDeadline(300_000);
          if (socket.connecting) {
            const event = target.protocol === "https:" ? "secureConnect" : "connect";
            socket.once(event, connected);
            stopConnectListener = () => socket.removeListener(event, connected);
          } else connected();
        });
        setDeadline(10_000);
        request.end();
      });
    });
  };
}
