import { randomUUID } from "node:crypto";
export type RuntimeSummary = {
  kind: "complete" | "busy";
  generated: number;
  promoted: number;
  released: number;
  assessment: boolean;
  deferred: number;
};
export interface VolunteerJobRepository {
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
      try {
        const generated = await repo.generate(now),
          released = await repo.persistReleases(),
          promoted = await repo.promote(now),
          assessment = await repo.assess(now),
          deferred = await repo.deferNotifications(now),
          result = {
            kind: "complete" as const,
            generated,
            released,
            promoted,
            assessment,
            deferred,
          };
        await repo.finish(bucket, owner, "complete", result);
        return result;
      } catch (e) {
        await repo.finish(bucket, owner, "failed", {
          error: e instanceof Error ? e.message : "job_failed",
        });
        throw e;
      }
    },
  };
}
