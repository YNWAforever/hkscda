import { describe, expect, test } from "bun:test";

import { expectNoChineseText } from "../../components/admin/i18n/testing";
import { deliveryLabel } from "./deliveryLabel";

const STATES = ["delivered", "bounced", "failed", "complained", "delivery_delayed"] as const;

describe("deliveryLabel", () => {
  test("keeps the zh-HK wording by default, word for word", () => {
    // Staff screens and the supporter timeline have always shown these words.
    expect(deliveryLabel("delivered")).toBe("已送達收件伺服器");
    expect(deliveryLabel("bounced")).toBe("退信：需要跟進");
    expect(deliveryLabel("failed")).toBe("服務商回報失敗：需要跟進");
    expect(deliveryLabel("complained")).toBe("收件人投訴：停止重發並跟進");
    expect(deliveryLabel("delivery_delayed")).toBe("服務商仍在嘗試送達");
    expect(deliveryLabel("something_new")).toBe("送達狀態待核實");
    for (const state of STATES) expect(deliveryLabel(state, "zh")).toBe(deliveryLabel(state));
  });

  test("has no label when there is no state", () => {
    expect(deliveryLabel(null)).toBeNull();
    expect(deliveryLabel(undefined, "en")).toBeNull();
    expect(deliveryLabel("", "en")).toBeNull();
  });

  test("writes each state in English without any Chinese", () => {
    expect(deliveryLabel("delivered", "en")).toBe("Delivered to the recipient's mail server");
    expect(deliveryLabel("bounced", "en")).toBe("Bounced: follow up");
    expect(deliveryLabel("something_new", "en")).toBe("Delivery status not yet verified");
    for (const state of [...STATES, "something_new"]) {
      expectNoChineseText(deliveryLabel(state, "en") ?? "");
    }
  });
});
