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
    const timing = createVolunteerTiming();
    const started = performance.now();
    let status = 500;
    try {
      const response = await requestTimingContext.run(timing, () => handler(request));
      status = response.status;
      const headers = new Headers(response.headers);
      const fields = [
        `volunteer;dur=${(performance.now() - started).toFixed(1)}`,
        ...Object.entries(timing.snapshot()).map(
          ([stage, duration]) => `${stage};dur=${duration.toFixed(1)}`,
        ),
      ];
      headers.set(
        "server-timing",
        [headers.get("server-timing"), ...fields].filter(Boolean).join(", "),
      );
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } finally {
      console.info(
        JSON.stringify({
          event: "volunteer_request",
          action: timing.action ?? action,
          status,
          duration_ms: Math.round((performance.now() - started) * 10) / 10,
          stages: timing.snapshot(),
        }),
      );
    }
  };
}
import {
  requestTimingContext,
  type RequestTiming,
  type RequestTimingStage,
} from "../operations/requestTiming.server";
export type VolunteerTimingStage = RequestTimingStage;
export function createVolunteerTiming(now = () => performance.now()): RequestTiming {
  const stages: Partial<Record<RequestTimingStage, number>> = {};
  const observe = (stage: RequestTimingStage, durationMs: number) => {
    if (Number.isFinite(durationMs)) stages[stage] = (stages[stage] ?? 0) + Math.max(0, durationMs);
  };
  return {
    observe,
    snapshot: () => ({ ...stages }),
    measure: async <T>(stage: RequestTimingStage, operation: () => Promise<T>) => {
      const start = now();
      try {
        return await operation();
      } finally {
        observe(stage, now() - start);
      }
    },
  };
}
