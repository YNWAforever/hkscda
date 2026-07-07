import { describe, expect, spyOn, test } from "bun:test";

import { sanitizeHelpQuery, trackHelpEvent } from "./analytics";
import * as analytics from "../analytics";

describe("help analytics privacy redaction", () => {
  test("redacts email addresses", () => {
    expect(sanitizeHelpQuery("my email is donor@example.com")).toEqual({ redacted: true });
  });

  test("redacts Hong Kong phone-like numbers", () => {
    expect(sanitizeHelpQuery("please call 9864 1089")).toEqual({ redacted: true });
    expect(sanitizeHelpQuery("+852 9123 4567 receipt")).toEqual({ redacted: true });
  });

  test("redacts long payment or reference-like numbers", () => {
    expect(sanitizeHelpQuery("payment reference 123456789012")).toEqual({ redacted: true });
  });

  test("redacts Traditional Chinese personal and case identifiers", () => {
    expect(sanitizeHelpQuery("我叫陳小明，想查收據")).toEqual({ redacted: true });
    expect(sanitizeHelpQuery("地址是旺角彌敦道，想改收據")).toEqual({ redacted: true });
    expect(sanitizeHelpQuery("付款編號 ABC12345")).toEqual({ redacted: true });
    expect(sanitizeHelpQuery("申請編號 ADOPT-88A123")).toEqual({ redacted: true });
    expect(sanitizeHelpQuery("我的領養申請進度")).toEqual({ redacted: true });
  });

  test("redacts possible uploaded file content or path", () => {
    expect(sanitizeHelpQuery("uploaded my report_final_v1.pdf file")).toEqual({ redacted: true });
    expect(sanitizeHelpQuery("file contents: photo.jpg and notes.txt")).toEqual({ redacted: true });
  });

  test("allows ordinary short topic queries", () => {
    expect(sanitizeHelpQuery("sponsor adoption")).toEqual({
      redacted: false,
      queryTopic: "sponsor adoption",
    });
    expect(sanitizeHelpQuery("How to adopt a dog?")).toEqual({
      redacted: false,
      queryTopic: "how to adopt a dog",
    });
  });

  test("caps long non-personal topic queries at 80 characters", () => {
    const result = sanitizeHelpQuery(
      "adoption preparation window safety home visit photos landlord approval and daily care budget",
    );
    expect(result.redacted).toBe(false);
    expect(result.queryTopic?.length).toBeLessThanOrEqual(80);
  });

  test("trackHelpEvent does not include raw query when redacted", () => {
    const callSpy = spyOn(analytics, "gtagEvent");

    trackHelpEvent("help_search", {
      query: "donor@example.com 9864 1089",
      category: "donation",
      language: "en",
      resultCount: 3,
      pagePath: "/help",
    });

    expect(callSpy).toHaveBeenCalledTimes(1);
    const [, eventParams] = callSpy.mock.calls[0];
    expect(eventParams).toBeDefined();
    if (!eventParams) {
      throw new Error("Expected help analytics event params");
    }

    expect(eventParams.redacted).toBe(true);
    expect(eventParams.query_topic).toBeUndefined();
    expect(eventParams).not.toHaveProperty("query");
    callSpy.mockRestore();
  });

  test("trackHelpEvent sends redacted query topic for non-sensitive queries", () => {
    const callSpy = spyOn(analytics, "gtagEvent");

    trackHelpEvent("help_search", {
      query: "How do I apply to adopt a dog?",
      faqId: "adoption-apply",
      confidenceBucket: "high",
      resultCount: 1,
      language: "en",
      pagePath: "/help",
    });

    expect(callSpy).toHaveBeenCalledTimes(1);
    const [, eventParams] = callSpy.mock.calls[0];
    expect(eventParams).toBeDefined();
    if (!eventParams) {
      throw new Error("Expected help analytics event params");
    }

    expect(eventParams.redacted).toBe(false);
    expect(eventParams.query_topic).toBe("how do i apply to adopt a dog");
    callSpy.mockRestore();
  });
});
