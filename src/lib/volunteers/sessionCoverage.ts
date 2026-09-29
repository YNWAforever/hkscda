export type CoveragePolicy = {
  id: string;
  templateKey: string;
  name: string;
  shelter: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt?: string;
  schedule: {
    enabled: boolean;
    startTime: string;
    weekdays: number[];
    excludedDates: string[];
    effectiveFrom: string | null;
    effectiveUntil: string | null;
  };
};

export type CoverageActivity = {
  id: string;
  templateKey: string | null;
  shelter: string | null;
  startsAt: string;
  status: string;
  policyVersionId: string | null;
};

export type SessionCoverage = {
  state:
    | "covered"
    | "attention"
    | "off_day"
    | "no_approved_policy"
    | "policy_inapplicable"
    | "unavailable";
  from: string;
  to: string;
  centre: string;
  scheduledSlots: number | null;
  publishedSlots: number | null;
  unpublishedSlots: number | null;
  missingSlots: number | null;
  offDays: number | null;
  inapplicableDays: number | null;
  nextApprovedAt: string | null;
  blockers: {
    date: string;
    templateKey: string;
    policyName: string;
    reason: "unpublished" | "missing" | "policy_inapplicable";
  }[];
};

type CoverageInput = {
  from: string;
  to: string;
  centre: string;
  policies: CoveragePolicy[];
  activities: CoverageActivity[];
};

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
function validDay(value: string) {
  if (!dayPattern.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function nextDay(value: string) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function hkDay(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function empty(input: CoverageInput, state: SessionCoverage["state"]): SessionCoverage {
  return {
    state,
    from: input.from,
    to: input.to,
    centre: input.centre,
    scheduledSlots: null,
    publishedSlots: null,
    unpublishedSlots: null,
    missingSlots: null,
    offDays: null,
    inapplicableDays: null,
    nextApprovedAt: null,
    blockers: [],
  };
}
function effectiveOnDay(policy: CoveragePolicy, day: string) {
  if (!policy.schedule.enabled) return false;
  if (policy.schedule.effectiveFrom && day < policy.schedule.effectiveFrom) return false;
  if (policy.schedule.effectiveUntil && day > policy.schedule.effectiveUntil) return false;
  const start = Date.parse(day + "T" + policy.schedule.startTime + ":00+08:00");
  return (
    Date.parse(policy.effectiveFrom) <= start &&
    (!policy.effectiveUntil || start < Date.parse(policy.effectiveUntil))
  );
}
function applicable(policy: CoveragePolicy, day: string) {
  if (!effectiveOnDay(policy, day)) return false;
  if (policy.schedule.excludedDates.includes(day)) return false;
  const weekday = new Date(day + "T12:00:00+08:00").getUTCDay();
  return policy.schedule.weekdays.includes(weekday);
}

/** Day-level operational read; booking and publish commands remain authoritative. */
export function getSessionCoverage(input: CoverageInput, now: Date): SessionCoverage {
  if (!validDay(input.from) || !validDay(input.to) || input.to < input.from)
    throw new RangeError("Invalid coverage date range");
  const span = (Date.parse(input.to) - Date.parse(input.from)) / 86400000 + 1;
  if (span > 31) throw new RangeError("Coverage is limited to 31 days");

  const policies = input.policies.filter(
    (policy) => input.centre === "all" || policy.shelter === input.centre,
  );
  if (!policies.length) return empty(input, "no_approved_policy");
  if (
    policies.some(
      (policy) =>
        !policy.templateKey ||
        !policy.shelter ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(policy.schedule.startTime) ||
        !policy.schedule.weekdays.length ||
        policy.schedule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
        !Number.isFinite(Date.parse(policy.effectiveFrom)) ||
        (policy.effectiveUntil !== null && !Number.isFinite(Date.parse(policy.effectiveUntil))),
    )
  )
    return empty(input, "unavailable");

  const byTemplate = new Map<string, CoveragePolicy[]>();
  for (const policy of policies) {
    const list = byTemplate.get(policy.templateKey) ?? [];
    list.push(policy);
    byTemplate.set(policy.templateKey, list);
  }
  for (const list of byTemplate.values())
    list.sort(
      (a, b) =>
        Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom) ||
        Date.parse(b.createdAt ?? b.effectiveFrom) - Date.parse(a.createdAt ?? a.effectiveFrom) ||
        b.id.localeCompare(a.id),
    );

  const activities = input.activities.filter(
    (activity) => input.centre === "all" || activity.shelter === input.centre,
  );
  const hasEffectivePolicy = policies.some((policy) => {
    for (let day = input.from; day <= input.to; day = nextDay(day))
      if (effectiveOnDay(policy, day)) return true;
    return false;
  });
  if (!hasEffectivePolicy && policies.some((policy) => policy.schedule.enabled))
    return empty(input, "policy_inapplicable");
  let scheduledSlots = 0;
  let publishedSlots = 0;
  let unpublishedSlots = 0;
  let missingSlots = 0;
  let offDays = 0;
  let inapplicableDays = 0;
  const blockers: SessionCoverage["blockers"] = [];
  for (let day = input.from; day <= input.to; day = nextDay(day)) {
    let scheduledToday = 0;
    for (const [templateKey, versions] of byTemplate) {
      const policy = versions.find((version) => applicable(version, day));
      if (!policy) continue;
      scheduledToday++;
      scheduledSlots++;
      const rows = activities.filter(
        (activity) => activity.templateKey === templateKey && hkDay(activity.startsAt) === day,
      );
      const published = rows.find(
        (activity) =>
          activity.status === "published" &&
          activity.policyVersionId &&
          versions.some(
            (version) => version.id === activity.policyVersionId && applicable(version, day),
          ),
      );
      if (published) {
        publishedSlots++;
        continue;
      }
      const unbound = rows.some((activity) => activity.status === "published");
      const draft = rows.some((activity) => activity.status === "draft");
      if (draft || unbound) unpublishedSlots++;
      else missingSlots++;
      blockers.push({
        date: day,
        templateKey,
        policyName: policy.name,
        reason: unbound ? "policy_inapplicable" : draft ? "unpublished" : "missing",
      });
    }
    if (scheduledToday === 0) {
      if (
        policies.some((policy) => policy.schedule.enabled) &&
        !policies.some((policy) => effectiveOnDay(policy, day))
      )
        inapplicableDays++;
      else offDays++;
    }
  }
  const nextApprovedAt =
    activities
      .filter(
        (activity) =>
          activity.status === "published" &&
          activity.policyVersionId &&
          policies.some(
            (policy) =>
              policy.id === activity.policyVersionId &&
              applicable(policy, hkDay(activity.startsAt)),
          ) &&
          Date.parse(activity.startsAt) > now.getTime() &&
          hkDay(activity.startsAt) >= input.from &&
          hkDay(activity.startsAt) <= input.to,
      )
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0]?.startsAt ?? null;
  return {
    state:
      missingSlots || unpublishedSlots
        ? "attention"
        : inapplicableDays
          ? "policy_inapplicable"
          : scheduledSlots
            ? "covered"
            : "off_day",
    from: input.from,
    to: input.to,
    centre: input.centre,
    scheduledSlots,
    publishedSlots,
    unpublishedSlots,
    missingSlots,
    offDays,
    inapplicableDays,
    nextApprovedAt,
    blockers: blockers.slice(0, 30),
  };
}
