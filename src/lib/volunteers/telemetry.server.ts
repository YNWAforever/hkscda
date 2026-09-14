/** Log operational context only: no payload, actor, email, SQL or provider text. */
export function logVolunteerFailure(action: string, error: unknown) {
  const raw = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const code = typeof raw === "string" && /^[A-Z0-9_]{3,12}$/.test(raw) ? raw : "UNEXPECTED";
  console.error(JSON.stringify({ event: "volunteer_failure", action, code }));
}

/** Timing covers authorization through response creation. Labels must be static, never user input. */
export function withVolunteerTiming(
  action: string,
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  if (!/^[a-z_]{1,60}$/.test(action)) throw new Error("Invalid telemetry action");
  return async (request) => {
    const started = performance.now();
    let status = 500;
    try {
      const response = await handler(request);
      status = response.status;
      const headers = new Headers(response.headers);
      headers.set("server-timing", `volunteer;dur=${(performance.now() - started).toFixed(1)}`);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } finally {
      console.info(
        JSON.stringify({
          event: "volunteer_request",
          action,
          status,
          duration_ms: Math.round((performance.now() - started) * 10) / 10,
        }),
      );
    }
  };
}
