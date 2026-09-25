import { describe, expect, test } from "bun:test";

import * as capture from "./error-capture";

describe("request error capture", () => {
  test("keeps concurrent request errors separate", async () => {
    const withRequestErrorCapture = (
      capture as typeof capture & {
        withRequestErrorCapture?: <T>(run: () => Promise<T>) => Promise<T>;
      }
    ).withRequestErrorCapture;
    expect(withRequestErrorCapture).toBeFunction();
    if (!withRequestErrorCapture) return;

    const first = withRequestErrorCapture(async () => {
      globalThis.dispatchEvent(new ErrorEvent("error", { error: new Error("first request") }));
      await Promise.resolve();
      return (capture.consumeLastCapturedError() as Error | undefined)?.message;
    });
    const second = withRequestErrorCapture(async () => {
      globalThis.dispatchEvent(new ErrorEvent("error", { error: new Error("second request") }));
      return (capture.consumeLastCapturedError() as Error | undefined)?.message;
    });

    expect(await Promise.all([first, second])).toEqual(["first request", "second request"]);
    expect(capture.consumeLastCapturedError()).toBeUndefined();
  });
});
