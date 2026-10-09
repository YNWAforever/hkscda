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
const { VolunteerOperations, OperationsWorkspace, OperationsSignInGate } =
  await import("./VolunteerOperations");
const { OperationPreview } = await import("./OperationPreview");
const { volunteerOperationsCopy } = await import("./volunteerOperationsCopy");
const { VolunteerTasks } = await import("./VolunteerTasks");
const { volunteerTasksCopy } = await import("./volunteerTasksCopy");

const { FIXTURE } = kit;
const ALLOW = [
  FIXTURE.organisation,
  FIXTURE.contact,
  FIXTURE.activity,
  FIXTURE.role,
  FIXTURE.terms,
];

const listing = (over: Record<string, unknown> = {}) => ({
  staff: true,
  activities: [
    {
      id: "activity-1",
      title: FIXTURE.activity,
      starts_at: "2026-10-10T01:00:00Z",
      capacity: 30,
      group_headcount: 0,
      roles: [{ key: "dog_walker", label: FIXTURE.role }],
    },
    {
      id: "activity-2",
      title: FIXTURE.activity,
      starts_at: "2026-10-17T01:00:00Z",
      capacity: 30,
      group_headcount: 0,
      roles: [],
    },
  ],
  enquiries: [
    {
      id: "enquiry-1",
      organisation: FIXTURE.organisation,
      contact_name: FIXTURE.contact,
      participant_count: 40,
    },
  ],
  requests: ["pending", "confirmed", "cancelled"].map((status, index) => ({
    id: `request-${index}`,
    activity_id: index === 2 ? "missing-activity" : "activity-1",
    headcount: index === 0 ? 1 : 40,
    status,
    revision: 1,
    contact_snapshot: {
      organisation: FIXTURE.organisation,
      contact_name: FIXTURE.contact,
      contact_email: "contact@example.test",
      contact_phone: "91234567",
    },
  })),
  registrations: [
    {
      id: "registration-1",
      activity_id: "activity-1",
      contact_name: FIXTURE.contact,
      status: "approved",
      duty_role: "dog_walker",
      updated_at: "2026-10-01T00:00:00Z",
    },
  ],
  ...over,
});

describe("the group requests and rescheduling screen in English", () => {
  test("shows the list, the staff actions and the rescheduling without Chinese", () => {
    kit.withQueries({ "volunteer-operations": kit.ok(listing()) }, () => {
      const markup = renderAdminInEnglish(<OperationsWorkspace userId="user-1" />);
      expectNoChineseText(markup, { allow: ALLOW });
      for (const text of [
        "Group requests and volunteer rescheduling",
        "All times are Hong Kong time.",
        "Back to the volunteer calendar",
        'aria-label="Steps on this page"',
        "Add group to session",
        "Add a group enquiry to a session",
        "Existing group enquiry",
        "Session to join",
        "Group size",
        "Submit group for confirmation",
        "Group request records",
        FIXTURE.organisation + " · 1 person · Awaiting confirmation · " + FIXTURE.activity,
        FIXTURE.organisation + " · 40 people · Confirmed",
        " · 10 Oct 2026 (Sat) 09:00",
        "Original session",
        "Confirm, change the size of or cancel a group",
        "Confirm or change size",
        "Cancel group",
        "Preview group impact",
        "If the group freeze cut-off has passed, confirm you have checked this late change by hand",
        "Volunteer rescheduling",
        "The original booking is kept until you confirm the new one.",
        "Current registration",
        "Destination session",
        "Destination role",
        "Preview rescheduling impact",
      ]) {
        expect(markup, text).toContain(text);
      }
      expect(markup).not.toContain("undefined");
    });
  });

  test("leaves the staff section out when the signed-in person is not staff, and says when nothing matches", () => {
    kit.withQueries(
      { "volunteer-operations": kit.ok(listing({ staff: false, enquiries: [], requests: [] })) },
      () => {
        const markup = renderAdminInEnglish(<OperationsWorkspace userId="user-1" />);
        expectNoChineseText(markup, { allow: ALLOW });
        expect(markup).not.toContain("Confirm, change the size of or cancel a group");
        expect(markup).toContain("No group requests yet.");
        expect(markup).toContain(
          "No group enquiry matches this verified email. Submit a group enquiry first or ask staff for help.",
        );
      },
    );
  });

  test("tells the loading, the failure and the missing permission in English, with next steps", () => {
    kit.withQueries({}, () => {
      const markup = renderAdminInEnglish(<OperationsWorkspace userId="user-1" />);
      expect(markup).toContain("Loading…");
    });
    const denied = new AdminApiError({ status: 403, message: "你沒有此操作權限，請聯絡管理員。" });
    kit.withQueries({ "volunteer-operations": kit.failed(denied) }, () => {
      const markup = renderAdminInEnglish(<OperationsWorkspace userId="user-1" />);
      expectNoChineseText(markup);
      expect(markup).toContain(
        "You do not have permission for this action. Contact an administrator.",
      );
    });
    kit.withQueries({ "volunteer-operations": kit.failed("not an error") }, () => {
      const markup = renderAdminInEnglish(<OperationsWorkspace userId="user-1" />);
      expect(markup).toContain("The action was not completed. Check the details and try again.");
    });
  });

  test("shows the impact of a group change and of a rescheduling, with the terms", () => {
    const copy = volunteerOperationsCopy.en.preview;
    const base = {
      preview_id: "preview-1",
      manifest: { group_headcount: 40, volunteer_capacity: 30, capacity: 30, remaining: 4 },
    };
    const render = (preview: Record<string, unknown>, publicMode = false, accepted = false) =>
      renderAdminInEnglish(
        <OperationPreview
          preview={{ ...base, ...preview } as never}
          copy={copy}
          publicMode={publicMode}
          destinationAccepted={accepted}
          onAccept={() => {}}
          reason=""
          onReason={() => {}}
          applyDisabled
          onApply={() => {}}
        />,
      );
    const group = render({
      apply_action: "group_apply",
      late: true,
      manifest: { ...base.manifest, scenario: "confirmed_group" },
      contact_snapshot: {
        organisation: FIXTURE.organisation,
        contact_name: FIXTURE.contact,
        contact_email: "contact@example.test",
        contact_phone: "91234567",
      },
    });
    expectNoChineseText(group, { allow: ALLOW });
    for (const text of [
      "Confirm this change",
      "Total group size: 40. Total places available to volunteers: 30. Scenario: A, with a group.",
      FIXTURE.organisation + " · " + FIXTURE.contact + " · 91234567",
      "This is a change checked by hand after the freeze cut-off.",
      "Reason for the change",
      "Confirm and apply the change",
    ]) {
      expect(group, text).toContain(text);
    }
    expect(render({ apply_action: "group_apply" })).toContain("Scenario: B, without a group.");
    // Large figures are grouped in English and stay plain in Chinese.
    const large = render({
      apply_action: "group_apply",
      manifest: { group_headcount: 1200, volunteer_capacity: 1000 },
    });
    expect(large).toContain(
      "Total group size: 1,200. Total places available to volunteers: 1,000.",
    );
    expect(
      render({ apply_action: "move_apply", manifest: { capacity: 2500, remaining: 1100 } }),
    ).toContain("The destination session has 2,500 places in total and 1,100 left.");
    expect(volunteerOperationsCopy.zh.preview.group(1200, 1000, "A 有團體")).toBe(
      "團體總人數：1200；可供義工使用的總位：1000；情況：A 有團體。",
    );
    expect(volunteerOperationsCopy.zh.preview.move(2500, 1100)).toBe(
      "目的場次總位 2500，目前剩餘 1100。確認前伺服器會再次檢查。",
    );

    const staffMove = render({
      apply_action: "move_apply",
      terms_body: FIXTURE.terms,
      consent_required: true,
    });
    expectNoChineseText(staffMove, { allow: ALLOW });
    expect(staffMove).toContain(
      "The destination session has 30 places in total and 4 left. The server checks again before confirming.",
    );
    expect(staffMove).toContain("Destination session terms");
    expect(staffMove).toContain(FIXTURE.terms);
    expect(staffMove).toContain(
      "The volunteer must sign in to the rescheduling page to read and agree to the destination session terms. Staff cannot agree on their behalf.",
    );
    const publicMove = render(
      { apply_action: "move_apply", terms_body: FIXTURE.terms },
      true,
      true,
    );
    expect(publicMove).toContain("I have read and agree to the destination session terms");
    expect(publicMove).toContain('checked=""');
  });

  test("shows the names of the checking state, and keeps the public page in Chinese", () => {
    const admin = renderAdminInEnglish(<VolunteerOperations />);
    expectNoChineseText(admin);
    expect(admin).toContain("Group requests and volunteer rescheduling");
    expect(admin).toContain("Checking your sign-in…");
    const publicInEnglish = renderAdminInEnglish(<VolunteerOperations publicMode />);
    expect(publicInEnglish).toContain("團體申請及義工改期");
    expect(publicInEnglish).not.toContain("Checking your sign-in");
    kit.withQueries({ "volunteer-operations": kit.ok(listing()) }, () => {
      const publicWorkspace = renderAdminInEnglish(<OperationsWorkspace publicMode userId="u" />);
      for (const text of ["返回義工服務", "提交待確認團體", "團體申請記錄", "義工改期"]) {
        expect(publicWorkspace, text).toContain(text);
      }
      expect(publicWorkspace).not.toContain("Group size");
      expect(publicWorkspace).not.toContain("Confirm, change the size");
    });
  });

  test("has English text for every string in the copy, and none of it holds Chinese", () => {
    expectNoChineseInCopy(volunteerOperationsCopy.en);
    expectNoChineseInCopy(volunteerTasksCopy.en);
  });

  test("keeps the Chinese screen as it was", () => {
    kit.withQueries({ "volunteer-operations": kit.ok(listing()) }, () => {
      const markup = renderAdminInChinese(<OperationsWorkspace userId="user-1" />);
      for (const text of [
        "團體申請及義工改期",
        "所有時間為香港時間。團體查詢不等於已確認團體；確認及改期均重新檢查當前政策和名單。",
        "返回義工月曆",
        'aria-label="本頁步驟"',
        "把團體查詢加入指定場次",
        FIXTURE.organisation + " · 1 人 · 待確認 · " + FIXTURE.activity,
        FIXTURE.organisation + " · 40 人 · 已確認",
        "原場次",
        "確認／調整人數",
        "預覽團體影響",
        "確認改期前會保留原有預約。",
        "預覽改期影響",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
    expect(renderAdminInChinese(<VolunteerOperations />)).toContain("正在驗證登入狀態…");
  });

  test("tells staff to sign in again once nobody is signed in, instead of checking for ever", () => {
    // The gate's two admin states, in both languages: still checking, and signed out (also what a
    // sign-out on another tab leaves). The signed-out state names a next step and links to sign-in.
    const checking = renderAdminInEnglish(<OperationsSignInGate publicMode={false} checking />);
    expect(checking).toContain("Checking your sign-in…");
    expect(checking).not.toContain("/admin/login");
    const signedOut = renderAdminInEnglish(
      <OperationsSignInGate publicMode={false} checking={false} />,
    );
    expectNoChineseText(signedOut);
    expect(signedOut).toContain("Group requests and volunteer rescheduling");
    expect(signedOut).toContain("Not signed in. Sign in again.");
    expect(signedOut).toContain('href="/admin/login"');
    expect(signedOut).toContain("Back to sign in");
    expect(signedOut).not.toContain("Checking your sign-in");

    const checkingZh = renderAdminInChinese(<OperationsSignInGate publicMode={false} checking />);
    expect(checkingZh).toContain("正在驗證登入狀態…");
    const signedOutZh = renderAdminInChinese(
      <OperationsSignInGate publicMode={false} checking={false} />,
    );
    expect(signedOutZh).toContain("團體申請及義工改期");
    expect(signedOutZh).toContain("未登入");
    expect(signedOutZh).toContain('href="/admin/login"');
    expect(signedOutZh).toContain("返回登入");
    expect(signedOutZh).not.toContain("正在驗證登入狀態");

    // The public page never shows the staff messages: it keeps the volunteer's own sign-in.
    for (const isChecking of [true, false]) {
      const publicGate = renderAdminInEnglish(
        <OperationsSignInGate publicMode checking={isChecking} />,
      );
      expect(publicGate).toContain("團體申請及義工改期");
      expect(publicGate).not.toContain("/admin/login");
      expect(publicGate).not.toContain("Not signed in");
    }
  });
});

const task = (over: Record<string, unknown> = {}) => ({
  id: "task-1",
  kind: "volunteer_booking_changed",
  contact_name: FIXTURE.volunteer,
  registration_id: "registration-1",
  ...over,
});
const notification = (over: Record<string, unknown> = {}) => ({
  id: "notification-1",
  kind: "volunteer_policy_reminder",
  status: "queued",
  attempts: 0,
  ...over,
});
const tasksData = {
  pending: [
    task({ id: "p1", kind: "", title: FIXTURE.activity }),
    task({ id: "p2", kind: "", registration_id: undefined }),
  ],
  tasks: [
    task(),
    task({ id: "t2", kind: "volunteer_qualification_review" }),
    task({ id: "t3", kind: "volunteer_operation_changed", registration_id: undefined }),
    task({ id: "t4", kind: "volunteer_policy_contact" }),
    task({ id: "t5", kind: "mystery_kind" }),
  ],
  notifications: [
    notification(),
    notification({ id: "n2", status: "claimed", attempts: 1, delivery_state: "delivered" }),
    notification({
      id: "n3",
      kind: "volunteer_monthly_assessment_notification",
      status: "failed",
      attempts: 3,
      last_error: FIXTURE.error,
      delivery_state: "bounced",
    }),
    notification({ id: "n4", status: "provider_accepted", attempts: 1, delivery_state: "mystery" }),
    notification({ id: "n5", kind: "mystery_kind", status: "delivered", attempts: 1 }),
    notification({ id: "n6", status: "mystery_status", attempts: 2 }),
  ],
};

describe("today's volunteer tasks in English", () => {
  test("shows the tasks, the follow-ups and the notifications without Chinese", () => {
    kit.withQueries({ "volunteer-tasks": kit.ok(tasksData) }, () => {
      const markup = renderAdminInEnglish(<VolunteerTasks />);
      expectNoChineseText(markup, { allow: [FIXTURE.volunteer, FIXTURE.activity, FIXTURE.error] });
      for (const text of [
        "Volunteer tasks and notifications for today",
        "Recording a contact or follow-up result does not change qualifications",
        'aria-label="Steps on this page"',
        "Awaiting approval",
        "Contact follow-up",
        "Notification status",
        "To contact or verify",
        "Open " + FIXTURE.activity,
        "Open related task",
        "Registration, cancellation or terms update · " + FIXTURE.volunteer,
        "Qualification exception to verify",
        "Group or rescheduling follow-up",
        "Policy or time change: contact registered volunteers",
        "Operations follow-up",
        "Record follow-up result",
        "Notification handling status",
        "Service reminder · Waiting to be handled · Attempted 0 times",
        "Service reminder · In progress · Attempted 1 time",
        "Delivered to the recipient&#x27;s mail server",
        "Monthly attendance reminder · Failed · Attempted 3 times",
        "Bounced: follow up",
        "Reason: " + FIXTURE.error,
        "Retry this notification",
        "Accepted by provider",
        "Delivery status not yet verified",
        "Notification · Delivery evidence received · Attempted 1 time",
        "Awaiting verification · Attempted 2 times",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
  });

  test("says when there is nothing to do, and when the tasks could not be read", () => {
    kit.withQueries(
      { "volunteer-tasks": kit.ok({ pending: [], tasks: [], notifications: [] }) },
      () => {
        const markup = renderAdminInEnglish(<VolunteerTasks />);
        expectNoChineseText(markup);
        for (const text of [
          "No registrations are awaiting approval.",
          "No follow-ups are outstanding.",
          "No notification jobs.",
        ]) {
          expect(markup, text).toContain(text);
        }
      },
    );
    kit.withQueries({ "volunteer-tasks": kit.failed() }, () => {
      const markup = renderAdminInEnglish(<VolunteerTasks />);
      expect(markup).toContain("Could not load the tasks. <button");
      expect(markup).toContain(">Reload</button>");
    });
    kit.withQueries({}, () => {
      expect(renderAdminInEnglish(<VolunteerTasks />)).toContain("Loading…");
    });
  });

  test("turns a refused follow-up into English text that says what to do", () => {
    const updateFailed = new AdminApiError({ status: 500, message: "未能更新跟進事項" });
    kit.withQueries({ "volunteer-tasks": kit.ok(tasksData) }, () => {
      kit.withMutationError(updateFailed, () => {
        const markup = renderAdminInEnglish(<VolunteerTasks />);
        expect(markup).toContain("Could not update the follow-up. Try again.");
      });
      kit.withMutationError(new AdminApiError({ status: 400, message: "請檢查跟進資料" }), () => {
        expect(renderAdminInEnglish(<VolunteerTasks />)).toContain(
          "Check the follow-up details and try again.",
        );
      });
    });
  });

  test("keeps the Chinese screen as it was", () => {
    kit.withQueries({ "volunteer-tasks": kit.ok(tasksData) }, () => {
      const markup = renderAdminInChinese(<VolunteerTasks />);
      for (const text of [
        "義工今日待辦與通知",
        "記錄聯絡及跟進結果不會更改資格、名額或批准結果，也不等同訊息已送達。",
        "待審批",
        "待聯絡／核實",
        "開啟" + FIXTURE.activity,
        "開啟相關工作",
        "報名／取消／條款更新 · " + FIXTURE.volunteer,
        "營運跟進",
        "等候處理 · 已嘗試 0 次",
        "已送達收件伺服器",
        "退信：需要跟進",
        "原因：" + FIXTURE.error,
        "重試此通知",
        "供應商已接收",
        "送達狀態待核實",
        "待核實 · 已嘗試 2 次",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
  });
});
