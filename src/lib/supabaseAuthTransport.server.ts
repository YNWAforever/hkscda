import type { Agent as HttpAgent } from "node:http";
import type { Agent as HttpsAgent } from "node:https";
import { boundedSupabaseReadRpcBody } from "./boundedSupabaseReadRpc.server";

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
let nodeTransports:
  | Promise<[typeof import("node:http"), typeof import("node:https"), typeof import("node:zlib")]>
  | undefined;

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
  const rpcBase = new URL(`${baseUrl.replace(/\/+$/, "")}/rest/v1/rpc/`);
  return (input, init = {}) => {
    if (typeof input !== "string" && !(input instanceof URL)) return fallback(input, init);
    const target = new URL(input);
    const rpcBody = boundedSupabaseReadRpcBody(rpcBase, target, init);
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
      (rpcBody === null && !roleLookup && target.href !== endpoint.href) ||
      !["http:", "https:"].includes(target.protocol) ||
      (rpcBody === null && ((init.method ?? "GET").toUpperCase() !== "GET" || init.body != null)) ||
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
    if (rpcBody !== null) {
      if (!headers.has("accept-encoding")) headers.set("accept-encoding", "gzip, deflate, br");
      headers.set("content-length", String(Buffer.byteLength(rpcBody)));
    } else headers.set("accept-encoding", "identity");
    nodeTransports ??= Promise.all([
      import("node:http"),
      import("node:https"),
      import("node:zlib"),
    ]);
    return nodeTransports.then(([http, https, zlib]) => {
      if (signal?.aborted) return Promise.reject(abortReason());
      return new Promise<Response>((resolve, reject) => {
        const send = target.protocol === "https:" ? https.request : http.request;
        let aborted: Error | undefined;
        let failBody: ((error: Error) => void) | undefined;
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
            if (failBody) failBody(aborted);
            else request.destroy(aborted);
          }, milliseconds);
        };
        const request = send(
          target,
          {
            method: rpcBody === null ? "GET" : "POST",
            headers: Object.fromEntries(headers),
            agent:
              target.protocol === "https:"
                ? (httpsAgent ??= new https.Agent({ keepAlive: true }))
                : (httpAgent ??= new http.Agent({ keepAlive: true })),
          },
          (incoming) => {
            setDeadline(300_000);
            // Preserve native fetch redirect/encoding behavior for unexpected servers.
            const encoding = incoming.headers["content-encoding"]?.toLowerCase();
            const compressedRpc =
              rpcBody !== null && ["gzip", "deflate", "br"].includes(encoding ?? "");
            if (
              (incoming.statusCode !== undefined &&
                incoming.statusCode >= 300 &&
                incoming.statusCode < 400) ||
              (encoding && encoding !== "identity" && !compressedRpc)
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
            const payload = compressedRpc
              ? incoming.pipe(
                  encoding === "gzip"
                    ? zlib.createGunzip()
                    : encoding === "deflate"
                      ? zlib.createInflate()
                      : zlib.createBrotliDecompress(),
                )
              : incoming;
            if (payload !== incoming) incoming.once("error", (error) => payload.destroy(error));
            const lengthHeader = incoming.headers["content-length"];
            const declaredBytes =
              typeof lengthHeader === "string" && /^(0|[1-9][0-9]*)$/.test(lengthHeader)
                ? Number(lengthHeader)
                : Number.NaN;
            // JSON RPC callers consume the complete body. Avoid first-chunk
            // backpressure only when identity bytes have a known, bounded size.
            const prefetchBytes =
              rpcBody !== null &&
              !compressedRpc &&
              Number.isSafeInteger(declaredBytes) &&
              declaredBytes <= 512 * 1024
                ? declaredBytes
                : null;
            let bodyFinished = false;
            let upstreamEnded = false;
            const closeIfDrained = (controller: ReadableStreamDefaultController<Uint8Array>) => {
              if (bodyFinished || !upstreamEnded) return;
              // HTTP EOF can precede consumption of the prefetched queue. Keep
              // abort/deadline ownership until the caller drains or cancels it.
              if (prefetchBytes !== null && controller.desiredSize !== prefetchBytes + 1) return;
              bodyFinished = true;
              cleanup();
              controller.close();
            };
            const body = new ReadableStream<Uint8Array>(
              {
                start(controller) {
                  failBody = (error) => {
                    if (bodyFinished) return;
                    bodyFinished = true;
                    cleanup();
                    controller.error(error);
                    payload.destroy();
                    // A completed response's socket may already serve another request.
                    if (!incoming.complete) incoming.destroy();
                  };
                  payload.on("data", (chunk: Buffer) => {
                    if (bodyFinished) return;
                    setDeadline(300_000);
                    controller.enqueue(chunk);
                    if ((controller.desiredSize ?? 0) <= 0) payload.pause();
                  });
                  payload.once("end", () => {
                    upstreamEnded = true;
                    closeIfDrained(controller);
                  });
                  payload.once("error", (error) => {
                    failBody?.(aborted ?? error);
                  });
                },
                pull(controller) {
                  if (upstreamEnded) closeIfDrained(controller);
                  else payload.resume();
                },
                cancel() {
                  bodyFinished = true;
                  cleanup();
                  payload.destroy();
                  if (!incoming.complete) incoming.destroy();
                },
              },
              prefetchBytes === null
                ? undefined
                : {
                    highWaterMark: prefetchBytes + 1,
                    size: (chunk) => chunk?.byteLength ?? 0,
                  },
            );
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
          if (failBody) failBody(aborted);
          else request.destroy(aborted);
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
        request.end(rpcBody ?? undefined);
      });
    });
  };
}
