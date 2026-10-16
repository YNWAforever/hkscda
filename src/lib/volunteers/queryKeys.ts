import type { QueryClient } from "@tanstack/react-query";
const prefixes = {
  overview: ["volunteer-overview"],
  tasks: ["volunteer-tasks"],
  workspace: ["volunteer-workspace"],
  workspaceDetail: ["volunteer-workspace-detail"],
  workspaceTemplates: ["volunteer-workspace-templates"],
  calendarSummary: ["volunteer-calendar"],
  directory: ["volunteer-directory"],
  person: ["volunteer-directory", "person"],
  registration: ["volunteer-registration"],
  qualifications: ["volunteer-qualifications"],
  operations: ["volunteer-operations"],
  policySettings: ["volunteer-policy-settings"],
  policySources: ["volunteer-policy-sources"],
  dailySettings: ["volunteer-daily-settings"],
  simulation: ["volunteer-policy-simulation"],
  assessments: ["volunteer-assessments"],
  assessmentJobs: ["volunteer-assessment-jobs"],
  legacyActivities: ["volunteer-activities"],
  legacyRegistrations: ["volunteer-registrations"],
  effectivePolicy: ["volunteer-policy-effective"],
  operationRestore: ["volunteer-operation-restore"],
  groupEnquiries: ["group-enquiries"],
  groupEnquiry: ["group-enquiry"],
} as const;
type Family = keyof typeof prefixes;
export const volunteerQueryKeys = {
  prefixes,
  key: (family: Family, ...parts: unknown[]) =>
    [...prefixes[family], ...parts] as readonly unknown[],
  workspace: (filter: unknown, page: number) => [...prefixes.workspace, filter, page] as const,
  person: (id: string) => [...prefixes.person, id] as const,
  registration: (id: string) => [...prefixes.registration, id] as const,
};
export type VolunteerChange =
  | "registration"
  | "attendance"
  | "qualification"
  | "reviewerAssignment"
  | "activity"
  | "policy"
  | "source"
  | "dailyQuota"
  | "assessment"
  | "notification"
  | "operation";
const registration: Family[] = [
  "registration",
  "workspace",
  "workspaceDetail",
  "calendarSummary",
  "overview",
  "tasks",
  "directory",
  "person",
  "operations",
  "legacyActivities",
  "legacyRegistrations",
];
const policy: Family[] = [
  "policySettings",
  "policySources",
  "dailySettings",
  "workspace",
  "workspaceDetail",
  "workspaceTemplates",
  "calendarSummary",
  "overview",
  "simulation",
  "effectivePolicy",
  "operations",
];
const changes: Record<VolunteerChange, Family[]> = {
  registration,
  attendance: [...registration, "operationRestore"],
  qualification: ["qualifications", "directory", "person", "overview", "simulation"],
  reviewerAssignment: ["directory", "person", "tasks"],
  activity: [...policy, "legacyActivities", "tasks"],
  policy,
  source: policy,
  dailyQuota: policy,
  assessment: [
    "assessments",
    "assessmentJobs",
    "qualifications",
    "directory",
    "person",
    "overview",
  ],
  notification: ["assessmentJobs", "tasks"],
  operation: [...registration, "policySettings"],
};
export async function invalidateVolunteerQueries(
  client: Pick<QueryClient, "invalidateQueries">,
  change: VolunteerChange,
): Promise<void> {
  await Promise.all(
    [...new Set(changes[change])].map((family) =>
      client.invalidateQueries({ queryKey: prefixes[family] }, { throwOnError: true }),
    ),
  );
}
export function isVolunteerQueryKey(key: readonly unknown[]): boolean {
  return (
    typeof key[0] === "string" &&
    (key[0].startsWith("volunteer-") || key[0] === "group-enquiries" || key[0] === "group-enquiry")
  );
}
export async function clearVolunteerIdentityQueries(client: QueryClient): Promise<void> {
  const filters = {
    predicate: (query: { queryKey: readonly unknown[] }) => isVolunteerQueryKey(query.queryKey),
  };
  await client.cancelQueries(filters);
  client.removeQueries(filters);
}

export function clearVolunteerSessionSearch(
  storage: Pick<Storage, "length" | "key" | "removeItem">,
): void {
  try {
    const remove: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith("hkscda.admin.list.query.") || key === "volunteer-review-bulk-operation")
        remove.push(key);
    }
    for (const key of remove) storage.removeItem(key);
  } catch {
    /* Lists also clear their in-memory state; storage is optional. */
  }
}
