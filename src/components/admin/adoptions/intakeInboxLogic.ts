import type { AdoptionIntakeLane, AdoptionIntakeUrgency } from "../../../lib/adoptions/types";

export type IntakeInboxLanguage = "zh" | "en";

export type IntakeSearchParamsInput = {
  lane?: AdoptionIntakeLane;
  openOnly?: boolean;
};

const urgencyLabels: Record<AdoptionIntakeUrgency, Record<IntakeInboxLanguage, string>> = {
  normal: {
    zh: "普通",
    en: "Normal",
  },
  high: {
    zh: "高",
    en: "High",
  },
  overdue: {
    zh: "逾期",
    en: "Overdue",
  },
};

export function buildIntakeSearchParams(input: IntakeSearchParamsInput) {
  const params = new URLSearchParams();

  if (input.lane) {
    params.set("lane", input.lane);
  }

  if (input.openOnly !== undefined) {
    params.set("openOnly", String(input.openOnly));
  }

  return params;
}

export function intakeUrgencyLabel(urgency: AdoptionIntakeUrgency, language: IntakeInboxLanguage) {
  return urgencyLabels[urgency][language];
}
