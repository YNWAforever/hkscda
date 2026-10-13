import { randomUUID } from "node:crypto";
import { safeJobFailure, type VolunteerJobStage } from "./errors";
export type RuntimeSummary = {
  kind: "complete" | "busy";
  generated: number;
  promoted: number;
  released: number;
  assessment: boolean;
  deferred: number;
};
export interface VolunteerJobRepository {
  preflight(): Promise<void>;
  claim(bucket: string, owner: string, lease: string): Promise<boolean>;
  finish(
    bucket: string,
    owner: string,
    status: "complete" | "failed",
    result: unknown,
  ): Promise<void>;
  generate(now: Date): Promise<number>;
  promote(now: Date): Promise<number>;
  persistReleases(): Promise<number>;
  assess(now: Date): Promise<boolean>;
  deferNotifications(now: Date): Promise<number>;
}
export function dueAssessmentPeriod(
  now: Date,
  policy: { assessment_day?: number; assessment_time?: string; short_month?: string },
) {
  if (typeof policy.assessment_time !== "string") return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year),
    month = Number(parts.month),
    day = Number(parts.day);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const configuredDay = Number(policy.assessment_day);
  if (!Number.isInteger(configuredDay) || configuredDay < 1 || configuredDay > 31) return null;
  if (configuredDay > daysInMonth && policy.short_month === "skip") return null;
  const scheduledDay = Math.min(configuredDay, daysInMonth);
  if (
    day < scheduledDay ||
    (day === scheduledDay && parts.hour + ":" + parts.minute < policy.assessment_time)
  )
    return null;
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return previous.toISOString().slice(0, 10);
}
export function runtimeBucket(now: Date) {
  return new Date(Math.floor(now.getTime() / 3600000) * 3600000).toISOString();
}
export function createVolunteerRuntimeJobs(repo: VolunteerJobRepository, clock = () => new Date()) {
  return {
    async run(): Promise<RuntimeSummary> {
      const now = clock(),
        bucket = runtimeBucket(now),
        owner = randomUUID(),
        empty = {
          kind: "busy" as const,
          generated: 0,
          promoted: 0,
          released: 0,
          assessment: false,
          deferred: 0,
        };
      if (!(await repo.claim(bucket, owner, new Date(now.getTime() + 10 * 60000).toISOString())))
        return empty;
      let stage: VolunteerJobStage = "preflight";
      try {
        await repo.preflight();
        stage = "generate";
        const generated = await repo.generate(now);
        stage = "release";
        const released = await repo.persistReleases();
        stage = "promote";
        const promoted = await repo.promote(now);
        stage = "assess";
        const assessment = await repo.assess(now);
        stage = "defer";
        const deferred = await repo.deferNotifications(now);
        const result = {
          kind: "complete" as const,
          generated,
          released,
          promoted,
          assessment,
          deferred,
        };
        stage = "finish";
        await repo.finish(bucket, owner, "complete", result);
        return result;
      } catch (e) {
        const failure = safeJobFailure(e, stage, owner);
        try {
          await repo.finish(bucket, owner, "failed", {
            error: failure.code,
            stage: failure.stage,
            correlationId: failure.correlationId,
          });
        } catch {
          console.error(JSON.stringify({ event: "volunteer_job_finish_failed", ...failure }));
        }
        throw e;
      }
    },
  };
}
