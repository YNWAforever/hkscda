import { describe, expect, test } from "bun:test";

import { AdminApiError } from "../../../lib/admin/session";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

// The mocks and the fixtures are in volunteerKit.test.support.tsx; it must load before a screen does.
const kit = await import("./volunteerKit.test.support");
const { VolunteerRegistrationDetail, RegistrationProfileLink } =
  await import("./VolunteerRegistrationDetail");
const { VolunteerManagement } = await import("./VolunteerManagement");
const { ActivityCreateForm } = await import("./ActivityCreateForm");
const { EMPTY_ACTIVITY_DRAFT } = await import("./activityDraft");
const { GroupEnquiryManagement } = await import("./GroupEnquiryManagement");
const { volunteerRegistrationCopy } = await import("./volunteerRegistrationCopy");
const { groupEnquiryCopy } = await import("./groupEnquiryCopy");
const { volunteerCommonCopy } = await import("./volunteerCommonCopy");
const { volunteerFormatCopy } = await import("./volunteerFormatCopy");

const { FIXTURE } = kit;
const ALLOW = [
  FIXTURE.volunteer,
  FIXTURE.organisation,
  FIXTURE.contact,
  FIXTURE.activity,
  FIXTURE.location,
  FIXTURE.note,
  FIXTURE.message,
  FIXTURE.ageProfile,
  FIXTURE.dates,
];
const noop = () => {};

const detailQuery = (registration: unknown) => ({
  "volunteer-registration": kit.ok({ registration }),
});

describe("a registration's detail page in English", () => {
  test("shows the registration and offers the actions a pending one can have, as verbs", () => {
    kit.withQueries(detailQuery(kit.registrationDetail()), () => {
      const markup = renderAdminInEnglish(<VolunteerRegistrationDetail registrationId="r" />);
      expectNoChineseText(markup, { allow: ALLOW });
      for (const text of [
        "Back to volunteer management",
        FIXTURE.volunteer,
        "ada@example.com · 91234567",
        "Pending",
        "Attendance: Not recorded",
        "View volunteer details",
        "Activity",
        "6 Sep 2026 (Sun) 08:00",
        "Participants",
        "Type",
        "Group",
        "Age",
        "Responsible adult",
        "Volunteer hours",
        "Notes",
        "Places left",
        ">Approve</button>",
        ">Add to waitlist</button>",
        ">Reject</button>",
      ]) {
        expect(markup, text).toContain(text);
      }
      expect(markup).not.toContain("Mark attended");
      expect(markup).not.toContain("Nothing to do");
    });
  });

  test("offers attendance actions once an approved activity has ended, and the correction option", () => {
    kit.withQueries(
      detailQuery(kit.registrationDetail({ status: "approved", attendanceStatus: "attended" })),
      () => {
        const markup = renderAdminInEnglish(<VolunteerRegistrationDetail registrationId="r" />);
        expectNoChineseText(markup, { allow: ALLOW });
        expect(markup).toContain("Correct the attendance record (the original record is kept)");
        expect(markup).toContain("Attendance: Attended");
        expect(markup).toContain(">Add to waitlist</button>");
        expect(markup).not.toContain(">Approve</button>");
      },
    );
    kit.withQueries(detailQuery(kit.registrationDetail({ status: "approved" })), () => {
      const markup = renderAdminInEnglish(<VolunteerRegistrationDetail registrationId="r" />);
      for (const text of [
        ">Mark attended</button>",
        ">Mark completed</button>",
        ">Mark no-show</button>",
      ]) {
        expect(markup, text).toContain(text);
      }
      expect(markup).not.toContain("Correct the attendance record");
    });
    kit.withQueries(
      detailQuery(
        kit.registrationDetail({
          status: "approved",
          activity: {
            ...kit.registrationDetail().activity,
            startsAt: "2099-01-01T00:00:00Z",
            endsAt: "2099-01-01T02:00:00Z",
          },
        }),
      ),
      () => {
        const markup = renderAdminInEnglish(<VolunteerRegistrationDetail registrationId="r" />);
        expect(markup).not.toContain("Mark attended");
        expect(markup).not.toContain("Mark completed");
      },
    );
  });

  test("says there is nothing to do for a registration the volunteer cancelled, and shows blanks as dashes", () => {
    kit.withQueries(
      detailQuery(
        kit.registrationDetail({
          status: "cancelled",
          organizationName: null,
          declaredAge: null,
          youngestAge: null,
          guardianName: null,
          volunteerHours: null,
          notes: null,
          profileId: null,
          registrationType: "individual",
        }),
      ),
      () => {
        const markup = renderAdminInEnglish(<VolunteerRegistrationDetail registrationId="r" />);
        expectNoChineseText(markup, { allow: ALLOW });
        expect(markup).toContain("Nothing to do");
        expect(markup).toContain("Cancelled");
        expect(markup).toContain("Individual");
        expect(markup).toContain("Profile not linked: match this old registration to a profile");
        expect(markup).toContain(">-</p>");
      },
    );
  });

  test("turns a refused change into English text that says what to do", () => {
    kit.withQueries(detailQuery(kit.registrationDetail()), () => {
      kit.withMutationError(
        new AdminApiError({
          status: 409,
          code: "capacity_full",
          message: "活動名額不足，請重新檢查剩餘名額。",
        }),
        () => {
          const markup = renderAdminInEnglish(<VolunteerRegistrationDetail registrationId="r" />);
          expectNoChineseText(markup, { allow: ALLOW });
          expect(markup).toContain(
            "There are not enough places in the activity. Check the places left and try again.",
          );
        },
      );
      kit.withMutationError(
        new AdminApiError({ status: 409, message: "請先請義工確認目前條款，再審批報名。" }),
        () => {
          expect(
            renderAdminInEnglish(<VolunteerRegistrationDetail registrationId="r" />),
          ).toContain(
            "Ask the volunteer to confirm the current terms before approving the registration.",
          );
        },
      );
      kit.withMutationError(new Error("Capacity conflict"), () => {
        expect(renderAdminInEnglish(<VolunteerRegistrationDetail registrationId="r" />)).toContain(
          "Capacity conflict",
        );
      });
    });
  });

  test("tells the loading, a failure and a missing registration in English", () => {
    kit.withQueries({}, () => {
      expect(renderAdminInEnglish(<VolunteerRegistrationDetail registrationId="r" />)).toContain(
        "Loading...",
      );
    });
    kit.withQueries({ "volunteer-registration": kit.failed() }, () => {
      const markup = renderAdminInEnglish(<VolunteerRegistrationDetail registrationId="r" />);
      expectNoChineseText(markup);
      expect(markup).toContain("Could not load");
    });
    kit.withQueries({ "volunteer-registration": kit.ok({}) }, () => {
      expect(renderAdminInEnglish(<VolunteerRegistrationDetail registrationId="r" />)).toContain(
        "Volunteer registration not found. Go back to volunteer management and choose another.",
      );
    });
    expect(renderAdminInEnglish(<RegistrationProfileLink profileId="p/1" />)).toContain(
      'href="/admin/volunteers/people/p%2F1"',
    );
  });

  test("keeps the Chinese page as it was", () => {
    kit.withQueries(detailQuery(kit.registrationDetail()), () => {
      const markup = renderAdminInChinese(<VolunteerRegistrationDetail registrationId="r" />);
      for (const text of [
        "返回義工管理",
        "待審批",
        "出席：未記錄",
        "查看義工個人詳情",
        "負責成人",
        "義工時數",
        "剩餘名額",
        ">已批准</button>",
        ">候補中</button>",
        ">已拒絕</button>",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
    kit.withQueries(detailQuery(kit.registrationDetail({ status: "cancelled" })), () => {
      expect(renderAdminInChinese(<VolunteerRegistrationDetail registrationId="r" />)).toContain(
        "無需處理",
      );
    });
    kit.withQueries({ "volunteer-registration": kit.ok({}) }, () => {
      expect(renderAdminInChinese(<VolunteerRegistrationDetail registrationId="r" />)).toContain(
        "找不到義工報名。",
      );
    });
  });
});

const activities = [
  kit.activitySummary(),
  kit.activitySummary({
    id: "activity-2",
    type: "volunteer_shift",
    status: "draft",
    endsAt: null,
    approvedParticipants: 12,
  }),
  kit.activitySummary({ id: "activity-3", type: "group_activity", status: "closed" }),
  kit.activitySummary({ id: "activity-4", status: "cancelled" }),
];
const managementQueries = (status = "pending", attendance = "not_marked") => ({
  "volunteer-activities": kit.ok({ activities, total: 90 }),
  "volunteer-registrations": kit.ok({
    registrations: [
      kit.registrationSummary({ status, attendanceStatus: attendance }),
      kit.registrationSummary({
        id: "registration-2",
        status,
        attendanceStatus: attendance,
        registrationType: "individual",
        organizationName: null,
        guardianName: null,
        youngestAge: null,
        participantCount: 1,
        activity: undefined,
      }),
    ],
    total: 90,
  }),
});

describe("the volunteers and activities page in English", () => {
  test("shows the figures, both tables and the filters without Chinese", () => {
    kit.withQueries(managementQueries(), () => {
      const markup = renderAdminInEnglish(<VolunteerManagement />);
      expectNoChineseText(markup, { allow: ALLOW });
      for (const text of [
        "Volunteers and activities",
        "Create activities, approve registrations and record attendance.",
        "Refresh",
        "Add activity",
        "People awaiting approval in this page&#x27;s activities",
        "Upcoming activities on this page",
        "Registrations shown",
        "Activities",
        "Search by activity name or location",
        'aria-label="Search activities"',
        "Cleaning day · " + FIXTURE.location,
        "Volunteer shift",
        "Group activity",
        "Published",
        "Draft",
        "Closed",
        "Cancelled",
        "Pending 2 · Waitlisted 1",
        "View registrations",
        "Close registration",
        "Publish",
        "Duplicate",
        "Registrations",
        'aria-label="Filter by status"',
        "All statuses",
        "Pending",
        "Approved",
        "Waitlisted",
        "Rejected",
        'aria-label="Filter by attendance"',
        "All attendance statuses",
        "Not recorded",
        "No-show",
        "Search by name, email or phone",
        "Registrant",
        "Activity registered for",
        "People / type",
        "Organisation: " + FIXTURE.organisation,
        "Activity details not loaded",
        "6 people",
        "1 person",
        "Youngest 15 years old",
        "Guardian consent needed",
        "Attendance: Not recorded",
        "Registered on 2 Jul 2026 (Thu)",
        "1 Aug 2026 (Sat) 10:00",
        "to 1 Aug 2026 (Sat) 13:00",
        ">Approve</button>",
        ">Add to waitlist</button>",
        ">Reject</button>",
        "Guardian consent",
        FIXTURE.contact + " · 98765432",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
  });

  test("offers the actions for each status as verbs and says when there is nothing to do", () => {
    kit.withQueries(managementQueries("approved", "completed"), () => {
      const markup = renderAdminInEnglish(<VolunteerManagement />);
      expectNoChineseText(markup, { allow: ALLOW });
      expect(markup).toContain(">Add to waitlist</button>");
      expect(markup).toContain(">Reject</button>");
      expect(markup).not.toContain(">Approve</button>");
    });
    kit.withQueries(managementQueries("approved", "not_marked"), () => {
      expect(renderAdminInEnglish(<VolunteerManagement />)).toContain(">Mark completed</button>");
    });
    kit.withQueries(managementQueries("cancelled"), () => {
      expect(renderAdminInEnglish(<VolunteerManagement />)).toContain("Nothing to do");
    });
  });

  test("tells an empty page and a failed one in English, and shows a refused change", () => {
    kit.withQueries(
      {
        "volunteer-activities": kit.ok({ activities: [], total: 0 }),
        "volunteer-registrations": kit.ok({ registrations: [], total: 0 }),
      },
      () => {
        const markup = renderAdminInEnglish(<VolunteerManagement />);
        expectNoChineseText(markup);
        expect(markup).toContain("No activities yet. Choose Add activity to start.");
        expect(markup).toContain("No registrations match. Try loosening the filters.");
      },
    );
    kit.withQueries(
      { "volunteer-activities": kit.failed(), "volunteer-registrations": kit.failed() },
      () => {
        const markup = renderAdminInEnglish(<VolunteerManagement />);
        expectNoChineseText(markup);
        expect(markup).toContain("Could not load");
      },
    );
    kit.withQueries(managementQueries(), () => {
      kit.withMutationError(
        new AdminApiError({ status: 409, message: "資料已更新，請重新檢查後再試。" }),
        () => {
          const markup = renderAdminInEnglish(<VolunteerManagement />);
          expectNoChineseText(markup, { allow: ALLOW });
          expect(markup).toContain("The data has been updated. Check it again, then try again.");
        },
      );
    });
  });

  test("shows the form that creates an activity in English", () => {
    const markup = renderAdminInEnglish(
      <ActivityCreateForm
        draft={EMPTY_ACTIVITY_DRAFT}
        onChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending={false}
        failed
      />,
    );
    expectNoChineseText(markup);
    for (const text of [
      "Activity name",
      "Activity type",
      "Cleaning day",
      "Start time",
      "End time",
      "Optional",
      "Location",
      "Places",
      "Total number of people who can be approved",
      "Minimum age",
      "Lower limit for individual registrations",
      "Registration settings",
      "Approve automatically",
      "Accept groups",
      "Create activity",
      "Cancel",
      "Could not create the activity. Check the details and try again.",
    ]) {
      expect(markup, text).toContain(text);
    }
    const busy = renderAdminInEnglish(
      <ActivityCreateForm
        draft={EMPTY_ACTIVITY_DRAFT}
        onChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending
        failed={false}
      />,
    );
    expect(busy).toContain("Creating…");
    expect(busy).not.toContain("Could not create");
  });

  test("has English text for every string in the copy and the shared labels", () => {
    expectNoChineseInCopy(volunteerRegistrationCopy.en);
    expectNoChineseInCopy(volunteerCommonCopy.en);
    expectNoChineseInCopy(volunteerFormatCopy.en);
    expect(volunteerRegistrationCopy.en.management.registrations.filterBannerBefore).toBe(
      "Showing only registrations for ",
    );
    expect(volunteerRegistrationCopy.en.management.registrations.filterBannerAfter("1 Aug")).toBe(
      " (1 Aug)",
    );
    expect(volunteerCommonCopy.en.shelterName("cat")).toBe("Cat shelter");
    expect(volunteerCommonCopy.en.shelterName("mystery")).toBe("mystery");
    expect(volunteerCommonCopy.en.unknown("mystery")).toBe("Unknown");
    expect(volunteerCommonCopy.zh.unknown("mystery")).toBe("mystery");
  });

  test("keeps the Chinese page as it was", () => {
    kit.withQueries(managementQueries(), () => {
      const markup = renderAdminInChinese(<VolunteerManagement />);
      for (const text of [
        "義工與活動管理",
        "建立活動、審批報名，並記錄出席。",
        "新增活動",
        "本頁活動待審批人數",
        "待審 2 · 候補 1",
        "查看報名",
        "關閉報名",
        "複製",
        "按狀態篩選",
        "全部出席狀況",
        "機構：" + FIXTURE.organisation,
        "活動資料未載入",
        "6 人",
        "最小 15 歲",
        "需家長同意",
        "出席：未記錄",
        ">已批准</button>",
        ">候補中</button>",
        ">已拒絕</button>",
        FIXTURE.contact + " · 98765432",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
  });
});

const enquirySummary = (over: Record<string, unknown> = {}) => ({
  id: "enquiry-1",
  organisationName: FIXTURE.organisation,
  contactPerson: FIXTURE.contact,
  activityType: "school_talk",
  participantCount: 40,
  status: "new",
  notificationStatus: "failed",
  assignedTo: null,
  createdAt: "2026-07-02T00:00:00.000Z",
  ...over,
});
const enquiryDetail = (over: Record<string, unknown> = {}) => ({
  ...enquirySummary(),
  email: "contact@example.com",
  phone: "91234567",
  otherActivityDescription: null,
  participantAgeProfile: FIXTURE.ageProfile,
  preferredDateNotes: FIXTURE.dates,
  message: FIXTURE.message,
  notificationError: "SMTP timeout",
  adminNotes: FIXTURE.note,
  idempotencyKey: "key-1",
  updatedAt: "2026-07-02T00:00:00.000Z",
  ...over,
});
const enquiryQueries = (detail: unknown = enquiryDetail(), total = 1) => ({
  "group-enquiries": kit.ok({
    enquiries: [
      enquirySummary(),
      enquirySummary({
        id: "e2",
        activityType: "group_workshop",
        status: "in_progress",
        notificationStatus: "pending",
        participantCount: null,
      }),
      enquirySummary({
        id: "e3",
        activityType: "shelter_visit",
        status: "resolved",
        notificationStatus: "sent",
      }),
      enquirySummary({ id: "e4", activityType: "other", status: "closed" }),
    ],
    total,
  }),
  "group-enquiry": kit.ok({ enquiry: detail }),
});

describe("the group enquiries page in English", () => {
  test("shows the list and the open enquiry without Chinese", () => {
    kit.withQueries(enquiryQueries(), () => {
      const markup = renderAdminInEnglish(<GroupEnquiryManagement />);
      expectNoChineseText(markup, { allow: ALLOW });
      for (const text of [
        "Group enquiries",
        "Manage group activity enquiries, internal notes, statuses and retries of failed notifications.",
        "Refresh",
        "Group name or contact person",
        "All statuses",
        "Group",
        "Activity type",
        "Notification",
        "Enquiry date",
        "School talk",
        "Group workshop",
        "Centre visit",
        "Other",
        "About 40 people",
        "New",
        "In progress",
        "Resolved",
        "Closed",
        "Failed to send",
        "Waiting to send",
        "Sent",
        "2 Jul 2026 (Thu)",
        "Participants",
        "Preferred dates",
        "Enquiry",
        "The notification failed to send: SMTP timeout",
        "Internal notes",
        "Visible to staff only, such as follow-up plans or contact records",
        "Update the status and save the notes:",
        "Resend notification",
      ]) {
        expect(markup, text).toContain(text);
      }
      expect(markup).not.toContain("school_talk");
      expect(markup).not.toContain("retryNotification");
    });
  });

  test("shows an 'other' activity with its description and a missing head count", () => {
    kit.withQueries(
      enquiryQueries(
        enquiryDetail({
          activityType: "other",
          otherActivityDescription: FIXTURE.activity,
          participantCount: null,
          participantAgeProfile: null,
          preferredDateNotes: null,
          message: null,
          notificationStatus: "sent",
          notificationError: null,
        }),
      ),
      () => {
        const markup = renderAdminInEnglish(<GroupEnquiryManagement />);
        expectNoChineseText(markup, { allow: ALLOW });
        expect(markup).toContain("Other (" + FIXTURE.activity + ")");
        expect(markup).toContain("Not provided");
        expect(markup).not.toContain("Resend notification");
      },
    );
    kit.withQueries(
      enquiryQueries(enquiryDetail({ notificationStatus: "failed", notificationError: null })),
      () => {
        expect(renderAdminInEnglish(<GroupEnquiryManagement />)).toContain(
          "The notification failed to send: no error message was provided",
        );
      },
    );
  });

  test("explains a conflicting update and any other failure, and the pager and list failures", () => {
    kit.withQueries(enquiryQueries(), () => {
      kit.withMutationError(Object.assign(new Error("conflict"), { status: 409 }), () => {
        expect(renderAdminInEnglish(<GroupEnquiryManagement />)).toContain(
          "Another staff member updated this enquiry. Refresh the page and try again.",
        );
      });
      kit.withMutationError(new Error("boom"), () => {
        expect(renderAdminInEnglish(<GroupEnquiryManagement />)).toContain(
          "Could not update the enquiry. Try again later.",
        );
      });
    });
    kit.withQueries(enquiryQueries(enquiryDetail(), 90), () => {
      const markup = renderAdminInEnglish(<GroupEnquiryManagement />);
      expect(markup).toContain("Next");
    });
    kit.withQueries({ "group-enquiries": kit.failed(), "group-enquiry": {} }, () => {
      const markup = renderAdminInEnglish(<GroupEnquiryManagement />);
      expectNoChineseText(markup);
      expect(markup).toContain("Could not load");
      expect(markup).not.toContain("No group enquiries match your filters.");
    });
    kit.withQueries(
      { "group-enquiries": kit.ok({ enquiries: [], total: 0 }), "group-enquiry": {} },
      () => {
        expect(renderAdminInEnglish(<GroupEnquiryManagement />)).toContain(
          "No group enquiries match your filters.",
        );
      },
    );
  });

  test("has English text for every string in the copy", () => {
    expectNoChineseInCopy(groupEnquiryCopy.en);
    expect(groupEnquiryCopy.en.about(1)).toBe("About 1 person");
  });

  test("keeps the Chinese page as it was", () => {
    kit.withQueries(enquiryQueries(), () => {
      const markup = renderAdminInChinese(<GroupEnquiryManagement />);
      for (const text of [
        "團體查詢",
        "管理團體活動查詢、內部備註、狀態及失敗通知重試。",
        "團體名稱或聯絡人",
        "學校講座",
        "約 40 人",
        "新查詢",
        "發送失敗",
        "人數",
        "通知發送失敗：SMTP timeout",
        "內部備註",
        "更新狀態並儲存備註：",
        "重新發送通知",
        "處理中",
        "已解決",
        "已結案",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
  });
});
