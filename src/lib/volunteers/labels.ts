import type { AdminLanguage } from "../admin/language";
import type { VolunteerRegistrationStatus } from "./types";

/**
 * The zh-HK registration status labels. The registration emails and the public volunteer pages read
 * these directly, so they are word for word what they have always been.
 */
export const volunteerRegistrationStatusLabels: Record<VolunteerRegistrationStatus, string> = {
  pending: "待審批",
  approved: "已批准",
  waitlisted: "候補中",
  rejected: "已拒絕",
  cancelled: "已取消",
};

const ENGLISH_REGISTRATION_STATUS_LABELS: Record<VolunteerRegistrationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const REGISTRATION_STATUS_LABELS: Record<
  AdminLanguage,
  Record<VolunteerRegistrationStatus, string>
> = {
  zh: volunteerRegistrationStatusLabels,
  en: ENGLISH_REGISTRATION_STATUS_LABELS,
};

/** The label of a registration status in `language`. Defaults to zh-HK, which the emails use. */
export function volunteerRegistrationStatusLabel(
  status: VolunteerRegistrationStatus,
  language: AdminLanguage = "zh",
): string {
  return REGISTRATION_STATUS_LABELS[language][status];
}

/** All the labels, for a select that lists them. */
export function volunteerRegistrationStatusLabelsFor(
  language: AdminLanguage = "zh",
): Record<VolunteerRegistrationStatus, string> {
  return REGISTRATION_STATUS_LABELS[language];
}
