export const groupEnquiryActivityTypes = [
  "group_workshop",
  "school_talk",
  "shelter_visit",
  "other",
] as const;
export const groupEnquiryStatuses = ["new", "in_progress", "resolved", "closed"] as const;
export const groupEnquiryNotificationStatuses = ["pending", "sent", "failed"] as const;

export type GroupEnquiryActivityType = (typeof groupEnquiryActivityTypes)[number];
export type GroupEnquiryStatus = (typeof groupEnquiryStatuses)[number];
export type GroupEnquiryNotificationStatus = (typeof groupEnquiryNotificationStatuses)[number];

export type GroupEnquiryInsert = {
  organisationName: string;
  contactPerson: string;
  email: string;
  phone: string;
  activityType: GroupEnquiryActivityType;
  otherActivityDescription: string | null;
  participantCount: number | null;
  participantAgeProfile: string | null;
  preferredDateNotes: string | null;
  message: string | null;
  idempotencyKey: string;
};

export type GroupEnquiry = GroupEnquiryInsert & {
  id: string;
  status: GroupEnquiryStatus;
  notificationStatus: GroupEnquiryNotificationStatus;
  notificationError: string | null;
  assignedTo: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
};
