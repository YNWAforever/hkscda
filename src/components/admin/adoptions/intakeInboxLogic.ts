import type { AdoptionIntakeLane, AdoptionIntakeUrgency } from "../../../lib/adoptions/types";
import type { AdminLanguage } from "../../../lib/admin/language";
import { adminPageCopy } from "../adminPageCopy";
import { pickAdminCopy } from "../i18n/copy";

export type IntakeSearchParamsInput = {
  lane?: AdoptionIntakeLane;
  openOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export function buildIntakeSearchParams(input: IntakeSearchParamsInput) {
  const params = new URLSearchParams();

  if (input.lane) {
    params.set("lane", input.lane);
  }

  if (input.openOnly !== undefined) {
    params.set("openOnly", String(input.openOnly));
  }
  params.set("page", String(input.page ?? 1));
  params.set("pageSize", String(input.pageSize ?? 25));

  return params;
}

/** The urgency label from the application inbox page copy, in the admin's language. */
export function intakeUrgencyLabel(urgency: AdoptionIntakeUrgency, language: AdminLanguage) {
  return pickAdminCopy(adminPageCopy, language).intakeInbox.urgency[urgency];
}
