import { VolunteerActivityWorkspace } from "./VolunteerActivityWorkspace";
/** Shared URL-preserving calendar/list workspace and detail-only roster reads. */
export function VolunteerCalendar() {
  return <VolunteerActivityWorkspace initialView="calendar" />;
}
