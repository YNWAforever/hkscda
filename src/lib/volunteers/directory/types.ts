export type DirectoryProfile = {
  id: string;
  display_name: string;
  birth_date: string | null;
  tier: "newcomer" | "regular" | "senior";
  status: "pending" | "active" | "suspended";
  verified_at: string | null;
  joined_on: string | null;
  history_coverage_start: string | null;
  revision: number;
  linked_email: string | null;
  email_verified: boolean;
  account_linked: boolean;
};
export type DirectoryList = {
  profiles: DirectoryProfile[];
  total: number;
  page: number;
  limit: number;
};
export type DirectoryCredential = {
  id: string;
  credential_key: string;
  label: string;
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
  evidence: string;
};
export type DirectoryRegistration = {
  id: string;
  activity_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  attendance_status: string;
  volunteer_hours: number | null;
  duty_role: string | null;
};
export type DirectoryAttendanceEvent = {
  id: string;
  registration_id: string;
  command: string;
  reason: string | null;
  before_fact: Record<string, unknown>;
  after_fact: Record<string, unknown>;
  recorded_at: string;
};
export type DirectoryVerificationEvent = {
  id: string;
  event_type: string;
  reason: string;
  created_at: string;
  actor_user_id: string;
};
export type DirectoryDetail = {
  profile: DirectoryProfile;
  credentials: DirectoryCredential[];
  registrations: DirectoryRegistration[];
  attendance_events: DirectoryAttendanceEvent[];
  verification_history: DirectoryVerificationEvent[];
  coverage: {
    history_coverage_start: string | null;
    registration_total: number;
    attendance_event_total: number;
    verification_event_total: number;
    credential_total: number;
    records_limit: 100;
    scope: "linked_profile_records_only";
  };
};
