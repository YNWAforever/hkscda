export const MEDIA_REPAIR_BATCH_LIMIT = 20;
export const MEDIA_REPAIR_TIME_BUDGET_MS = 45_000;
export const MEDIA_REPAIR_MAX_ATTEMPTS = 8;
export const MEDIA_REPAIR_BACKOFF_MINUTES = [1, 5, 15, 60, 360] as const;

export function nextMediaRepairRetryAt(attempts: number, now: Date): string {
  const index = Math.min(Math.max(1, attempts) - 1, MEDIA_REPAIR_BACKOFF_MINUTES.length - 1);
  return new Date(now.getTime() + MEDIA_REPAIR_BACKOFF_MINUTES[index] * 60_000).toISOString();
}
