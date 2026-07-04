import type {
  VolunteerActivityStatus,
  VolunteerRegistrationType,
} from "../../../lib/volunteers/types";

export type VolunteerRegistrationFormState = {
  activityId: string;
  registrationType: VolunteerRegistrationType;
  contactName: string;
  email: string;
  phone: string;
  organizationName?: string;
  participantCount: number;
  declaredAge?: number | null;
  youngestAge?: number | null;
  guardianName?: string;
  guardianPhone?: string;
  notes?: string;
  emailConsent: boolean;
  whatsappConsent: boolean;
  turnstileToken?: string | null;
};

export function buildVolunteerRegistrationPayload(state: VolunteerRegistrationFormState) {
  return {
    activityId: state.activityId,
    registrationType: state.registrationType,
    contact: {
      name: state.contactName.trim(),
      email: state.email.trim().toLowerCase(),
      phone: state.phone.trim(),
      language: "zh-HK" as const,
    },
    participantCount: state.registrationType === "individual" ? 1 : state.participantCount,
    organizationName: state.organizationName?.trim() || undefined,
    declaredAge: state.declaredAge ?? undefined,
    youngestAge: state.youngestAge ?? undefined,
    guardianName: state.guardianName?.trim() || undefined,
    guardianPhone: state.guardianPhone?.trim() || undefined,
    notes: state.notes?.trim() || undefined,
    consents: {
      email: state.emailConsent,
      whatsapp: state.whatsappConsent,
    },
    turnstileToken: state.turnstileToken ?? undefined,
  };
}

export function canRegisterForActivity(activity: {
  status: VolunteerActivityStatus;
  startsAt: string;
  remainingCapacity: number;
  allowWaitlist: boolean;
}) {
  return (
    activity.status === "published" &&
    new Date(activity.startsAt).getTime() > Date.now() &&
    (activity.remainingCapacity > 0 || activity.allowWaitlist)
  );
}

export function activityAvailabilityLabel(activity: {
  remainingCapacity: number;
  allowWaitlist: boolean;
}) {
  if (activity.remainingCapacity > 0) return `尚餘 ${activity.remainingCapacity} 個名額`;
  return activity.allowWaitlist ? "名額已滿，可候補" : "名額已滿";
}
