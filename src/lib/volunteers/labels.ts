import type { VolunteerRegistrationStatus } from "./types";

export const volunteerRegistrationStatusLabels: Record<VolunteerRegistrationStatus, string> = {
  pending: "待審批",
  approved: "已批准",
  waitlisted: "候補中",
  rejected: "已拒絕",
  cancelled: "已取消",
};
