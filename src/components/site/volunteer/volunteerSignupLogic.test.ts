import { describe, expect, test } from "bun:test";

import {
  activityAvailabilityLabel,
  buildVolunteerRegistrationPayload,
  canRegisterForActivity,
} from "./volunteerSignupLogic";

describe("volunteer signup logic", () => {
  test("builds public group registration payloads with people count", () => {
    expect(
      buildVolunteerRegistrationPayload({
        activityId: "activity-1",
        registrationType: "group",
        contactName: "  Team Lead ",
        email: "LEAD@example.com",
        phone: "91234567",
        organizationName: "School",
        participantCount: 12,
        youngestAge: 15,
        guardianName: "Teacher Chan",
        guardianPhone: "92345678",
        emailConsent: true,
        whatsappConsent: false,
        turnstileToken: "token",
      }),
    ).toMatchObject({
      activityId: "activity-1",
      registrationType: "group",
      participantCount: 12,
      contact: { name: "Team Lead", email: "lead@example.com", phone: "91234567" },
      organizationName: "School",
      youngestAge: 15,
      consents: { email: true, whatsapp: false },
    });
  });

  test("disables registration for closed or past activities", () => {
    // Clock is pinned: this must not depend on when the suite happens to run.
    const now = () => new Date("2026-07-25T00:00:00.000Z");
    const upcoming = "2026-08-01T00:00:00.000Z";
    const past = "2026-07-01T00:00:00.000Z";

    expect(
      canRegisterForActivity(
        { status: "published", startsAt: upcoming, remainingCapacity: 1, allowWaitlist: false },
        now,
      ),
    ).toBe(true);
    expect(
      canRegisterForActivity(
        { status: "closed", startsAt: upcoming, remainingCapacity: 1, allowWaitlist: false },
        now,
      ),
    ).toBe(false);
    expect(
      canRegisterForActivity(
        { status: "published", startsAt: past, remainingCapacity: 1, allowWaitlist: false },
        now,
      ),
    ).toBe(false);
    expect(
      canRegisterForActivity(
        { status: "published", startsAt: upcoming, remainingCapacity: 0, allowWaitlist: false },
        now,
      ),
    ).toBe(false);
    expect(
      canRegisterForActivity(
        { status: "published", startsAt: upcoming, remainingCapacity: 0, allowWaitlist: true },
        now,
      ),
    ).toBe(true);
  });

  test("labels availability with waitlist fallback", () => {
    expect(activityAvailabilityLabel({ remainingCapacity: 5, allowWaitlist: true })).toBe(
      "尚餘 5 個名額",
    );
    expect(activityAvailabilityLabel({ remainingCapacity: 0, allowWaitlist: true })).toBe(
      "名額已滿，可候補",
    );
  });
});
