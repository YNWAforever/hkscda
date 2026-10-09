import type { VolunteerActivityType } from "../../../lib/volunteers/types";

/** What staff type into the form that creates an activity. */
export type ActivityDraft = {
  title: string;
  type: VolunteerActivityType;
  startsAt: string;
  endsAt: string;
  location: string;
  capacity: number;
  minAge: number;
  autoApprove: boolean;
  allowGroups: boolean;
};

export const EMPTY_ACTIVITY_DRAFT: ActivityDraft = {
  title: "",
  type: "cleaning_day",
  startsAt: "",
  endsAt: "",
  location: "",
  capacity: 12,
  minAge: 16,
  autoApprove: false,
  allowGroups: true,
};
