import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminIdentity } from "../../../lib/admin/access";
import type { PaymentPublicConfig } from "../../../lib/paymentPublicConfig/types";
import { PaymentMethodsManagementView } from "./PaymentMethodsManagement";

const BASE_CONFIG: PaymentPublicConfig = {
  id: "11111111-1111-1111-1111-111111111111",
  method: "fps",
  isPubliclyVisible: true,
  displayLabelZh: "轉數快 FPS",
  displayLabelEn: "FPS",
  sortOrder: 2,
  details: {},
  state: "in_review",
  version: 2,
  createdBy: "admin-1",
  updatedBy: "admin-1",
  submittedBy: "admin-1",
  submittedAt: "2026-08-31T00:00:00Z",
  publishedBy: null,
  publishedAt: null,
  archivedBy: null,
  archivedAt: null,
  createdAt: "2026-08-31T00:00:00Z",
  updatedAt: "2026-08-31T00:00:00Z",
};

const TREASURER_1: AdminIdentity = {
  id: "admin-1",
  authUserId: "auth-1",
  email: "treasurer1@example.com",
  role: "treasurer",
  status: "active",
};
const TREASURER_2: AdminIdentity = {
  id: "admin-2",
  authUserId: "auth-2",
  email: "treasurer2@example.com",
  role: "treasurer",
  status: "active",
};

function noop() {}

describe("PaymentMethodsManagementView", () => {
  test("disables Publish when the signed-in treasurer is the row's own submitter", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={TREASURER_1}
        configs={[BASE_CONFIG]}
        pending={false}
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).toContain("核准並發佈");
    expect(html).toContain('disabled=""');
    // The explanation must be reachable without a mouse hover: associated via
    // aria-describedby and rendered as always-visible text, not a title attribute.
    expect(html).toContain(`aria-describedby="publish-hint-${BASE_CONFIG.id}"`);
    expect(html).toContain("需要由另一位財務或管理員核准");
  });

  test("enables Publish for a different treasurer than the submitter", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={TREASURER_2}
        configs={[BASE_CONFIG]}
        pending={false}
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).toContain("核准並發佈");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("需要由另一位財務或管理員核准");
  });

  test("shows an empty-state message when there are no configured payment methods", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={TREASURER_1}
        configs={[]}
        pending={false}
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).toContain("尚未建立任何付款方式設定");
  });

  test("hides withdraw and publish actions when there is no signed-in identity", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={undefined}
        configs={[BASE_CONFIG]}
        pending={false}
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).not.toContain("撤回");
    expect(html).not.toContain("核准並發佈");
  });

  test("shows only the submit button, with a translated state label, for a draft config", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={TREASURER_1}
        configs={[{ ...BASE_CONFIG, state: "draft" }]}
        pending={false}
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).toContain("提交審批");
    expect(html).not.toContain("撤回");
    expect(html).not.toContain("核准並發佈");
    expect(html).toContain("草稿");
  });

  test("shows withdraw and publish, not submit, with a translated state label, for an in_review config", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={TREASURER_2}
        configs={[BASE_CONFIG]}
        pending={false}
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).toContain("撤回");
    expect(html).toContain("核准並發佈");
    expect(html).not.toContain("提交審批");
    expect(html).toContain("審閱中");
  });

  test("renders published and archived states read-only, with no action buttons", () => {
    for (const state of ["published", "archived"] as const) {
      const html = renderToStaticMarkup(
        <PaymentMethodsManagementView
          identity={TREASURER_1}
          configs={[{ ...BASE_CONFIG, state }]}
          pending={false}
          onSubmit={noop}
          onWithdraw={noop}
          onPublish={noop}
        />,
      );
      expect(html).not.toContain("提交審批");
      expect(html).not.toContain("撤回");
      expect(html).not.toContain("核准並發佈");
    }
  });

  test("shows the not-publicly-visible indicator when isPubliclyVisible is false", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={TREASURER_1}
        configs={[{ ...BASE_CONFIG, isPubliclyVisible: false }]}
        pending={false}
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).toContain("未公開");
  });

  test("renders the error message when present", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={TREASURER_1}
        configs={[]}
        errorMessage="This configuration changed elsewhere. Reload before saving again."
        pending={false}
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).toContain("This configuration changed elsewhere");
  });

  test("disables submit, withdraw, and publish buttons while a mutation is pending, regardless of canPublish", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={TREASURER_2}
        configs={[
          BASE_CONFIG,
          { ...BASE_CONFIG, id: "22222222-2222-2222-2222-222222222222", state: "draft" },
        ]}
        pending
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).toContain("核准並發佈");
    expect(html).toContain("撤回");
    expect(html).toContain("提交審批");
    // Every action button (submit, withdraw, publish) must be disabled while pending,
    // even though TREASURER_2 would otherwise be allowed to publish this row.
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3);
  });
});
