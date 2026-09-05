export const volunteerActivityTypes = [
  "volunteer_shift",
  "group_activity",
  "cleaning_day",
] as const;
export const volunteerActivityStatuses = ["draft", "published", "closed", "cancelled"] as const;
export const volunteerRegistrationTypes = ["individual", "group"] as const;
export const volunteerRegistrationStatuses = [
  "pending",
  "approved",
  "waitlisted",
  "rejected",
  "cancelled",
] as const;
export const volunteerAttendanceStatuses = [
  "not_marked",
  "attended",
  "completed",
  "no_show",
] as const;
export const volunteerUnderagePolicies = ["block", "allow_with_guardian_pending"] as const;
export const PUBLIC_INDIVIDUAL_MIN_AGE = 21;

export type VolunteerActivityType = (typeof volunteerActivityTypes)[number];
export type VolunteerActivityStatus = (typeof volunteerActivityStatuses)[number];
export type VolunteerRegistrationType = (typeof volunteerRegistrationTypes)[number];
export type VolunteerRegistrationStatus = (typeof volunteerRegistrationStatuses)[number];
export type VolunteerAttendanceStatus = (typeof volunteerAttendanceStatuses)[number];
export type VolunteerUnderagePolicy = (typeof volunteerUnderagePolicies)[number];

export type VolunteerActivityRuleSnapshot = {
  id: string;
  status: VolunteerActivityStatus;
  startsAt: string;
  capacity: number;
  approvedParticipants: number;
  waitlistedParticipants: number;
  allowWaitlist: boolean;
  autoApprove: boolean;
  minAge: number | null;
  underagePolicy: VolunteerUnderagePolicy;
  registrationModes: VolunteerRegistrationType[];
};

export type VolunteerRegistrationDraft = {
  registrationType: VolunteerRegistrationType;
  participantCount: number;
  declaredAge?: number | null;
  youngestAge?: number | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
};

export type VolunteerRegistrationDecision = {
  status: VolunteerRegistrationStatus;
  reason:
    | "auto_approved"
    | "manual_review"
    | "activity_not_available"
    | "registration_mode_unavailable"
    | "minimum_age_not_met"
    | "guardian_review_required"
    | "guardian_details_required"
    | "capacity_full";
};

export type VolunteerActivitySummary = VolunteerActivityRuleSnapshot & {
  type: VolunteerActivityType;
  title: string;
  description: string | null;
  endsAt: string | null;
  location: string;
  pendingParticipants: number;
  remainingCapacity: number;
  createdAt: string;
  updatedAt: string;
};

export type VolunteerActivityDetail = VolunteerActivitySummary;

export type VolunteerRegistrationSummary = {
  id: string;
  activityId: string;
  supporterId: string | null;
  registrationType: VolunteerRegistrationType;
  status: VolunteerRegistrationStatus;
  statusReason: string | null;
  attendanceStatus: VolunteerAttendanceStatus;
  participantCount: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  language: "zh-HK" | "en";
  organizationName: string | null;
  declaredAge: number | null;
  youngestAge: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  notes: string | null;
  internalNotes: string | null;
  volunteerHours: number | null;
  statusToken: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VolunteerRegistrationDetail = VolunteerRegistrationSummary & {
  activity: VolunteerActivityDetail;
};

export type VolunteerRegistrationCreateInput = {
  activityId: string;
  supporterId: string;
  registrationType: VolunteerRegistrationType;
  status: VolunteerRegistrationStatus;
  statusReason: string;
  participantCount: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  language: "zh-HK" | "en";
  organizationName: string | null;
  declaredAge: number | null;
  youngestAge: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  notes: string | null;
  consentEmailRequested: boolean;
  consentWhatsappRequested: boolean;
  statusTokenHash: string;
  statusTokenExpiresAt: string;
};

export type VolunteerTimelineRegistration = {
  id: string;
  activityId: string;
  activityTitle: string;
  activityType: VolunteerActivityType;
  startsAt: string;
  status: VolunteerRegistrationStatus;
  statusReason: string | null;
  attendanceStatus: VolunteerAttendanceStatus;
  participantCount: number;
  volunteerHours: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SupporterVolunteerContext = {
  registrations: VolunteerTimelineRegistration[];
};
