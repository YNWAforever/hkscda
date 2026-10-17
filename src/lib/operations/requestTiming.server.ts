import { AsyncLocalStorage } from "node:async_hooks";
export type RequestTimingStage = "auth" | "role" | "rpc" | "serialize";
export type RequestTiming = {
  measure<T>(stage: RequestTimingStage, operation: () => Promise<T>): Promise<T>;
  observe(stage: RequestTimingStage, durationMs: number): void;
  snapshot(): Partial<Record<RequestTimingStage, number>>;
  action?: string;
};
export const requestTimingContext = new AsyncLocalStorage<RequestTiming>();
export async function measureRequestStage<T>(
  stage: RequestTimingStage,
  operation: () => Promise<T>,
): Promise<T> {
  const timing = requestTimingContext.getStore();
  return timing ? timing.measure(stage, operation) : operation();
}
