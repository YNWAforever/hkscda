import { describe, expect, test } from "bun:test";

import { sanitizeHelpQuery } from "./sanitizeQuery";

// Characters are written as escapes so the source file never contains an
// invisible or direction-changing character.
const ZERO_WIDTH_SPACE = "\u200B";
const ZERO_WIDTH_JOINER = "\u200D";
const BYTE_ORDER_MARK = "\uFEFF";
const RIGHT_TO_LEFT_OVERRIDE = "\u202E";
const NUL = "\u0000";

// Postgres text cannot hold NUL, and a bidi control reorders what staff read.
const controlOrFormat = /[\p{Cc}\p{Cf}]/u;

describe("sanitizeHelpQuery control and format characters", () => {
  test.each([
    ["a zero-width space", ZERO_WIDTH_SPACE],
    ["a zero-width joiner", ZERO_WIDTH_JOINER],
    ["a byte order mark", BYTE_ORDER_MARK],
    ["a soft hyphen", "\u00AD"],
  ])("redacts a phone number split by %s", (_label, separator) => {
    expect(sanitizeHelpQuery(`call 9123${separator}4567`)).toEqual({ redacted: true });
  });

  test("redacts a phone number split by a control character", () => {
    expect(sanitizeHelpQuery(`call 9123${NUL}4567`)).toEqual({ redacted: true });
  });

  test("redacts a long number split by format characters", () => {
    expect(sanitizeHelpQuery(`ref 1234${ZERO_WIDTH_SPACE}5678${ZERO_WIDTH_JOINER}9012`)).toEqual({
      redacted: true,
    });
  });

  test("keeps a NUL out of the topic", () => {
    const result = sanitizeHelpQuery(`visa${NUL}`);

    expect(result).toEqual({ redacted: false, queryTopic: "visa" });
    expect(result.queryTopic).not.toContain(NUL);
  });

  test.each([
    ["U+202E right-to-left override", RIGHT_TO_LEFT_OVERRIDE],
    ["U+202A left-to-right embedding", "\u202A"],
    ["U+2066 left-to-right isolate", "\u2066"],
    ["U+2069 pop directional isolate", "\u2069"],
  ])("keeps %s out of the topic", (_label, mark) => {
    const result = sanitizeHelpQuery(`${mark}evil`);

    expect(result).toEqual({ redacted: false, queryTopic: "evil" });
    expect(result.queryTopic).not.toMatch(controlOrFormat);
  });

  test("turns a control character into a word break and drops a format character", () => {
    expect(sanitizeHelpQuery(`visa${NUL}fee`)).toEqual({ redacted: false, queryTopic: "visa fee" });
    expect(sanitizeHelpQuery("visa\u0085fee")).toEqual({ redacted: false, queryTopic: "visa fee" });
    expect(sanitizeHelpQuery(`visa${ZERO_WIDTH_SPACE}fee`)).toEqual({
      redacted: false,
      queryTopic: "visafee",
    });
  });

  test("redacts a query made only of control and format characters", () => {
    expect(sanitizeHelpQuery(`${NUL}${ZERO_WIDTH_SPACE}${RIGHT_TO_LEFT_OVERRIDE}\u2066`)).toEqual({
      redacted: true,
    });
    expect(sanitizeHelpQuery(BYTE_ORDER_MARK)).toEqual({ redacted: true });
  });

  test("leaves an ordinary Chinese query unchanged", () => {
    expect(sanitizeHelpQuery("領養程序")).toEqual({ redacted: false, queryTopic: "領養程序" });
  });

  test("cuts to 80 characters after cleaning, so removed characters use no budget", () => {
    const result = sanitizeHelpQuery(`${"a".repeat(79)}${ZERO_WIDTH_SPACE}b${NUL}c`);

    expect(result.redacted).toBe(false);
    expect(result.queryTopic).toBe(`${"a".repeat(79)}b`);
  });
});

describe("sanitizeHelpQuery Hong Kong phone numbers", () => {
  // Every eight-digit Hong Kong number starts with 2-9: landlines with 2 or 3,
  // mobiles and other services with 4-9. All of them are personal data here.
  test.each([
    ["a landline starting with 2", "電話 21234567"],
    ["a landline starting with 3", "office 3123 4567"],
    ["a number starting with 4", "call 41234567"],
    ["a mobile starting with 5", "51234567"],
    ["a mobile starting with 6", "6123-4567"],
    ["a mobile starting with 7", "call 71234567"],
    ["a number starting with 8", "81234567 please"],
    ["a mobile starting with 9", "91234567"],
    ["a landline with the +852 prefix", "+852 2123 4567"],
    ["a landline with the 852 prefix", "852-31234567"],
    ["a landline written straight after Chinese text", "電話21234567"],
  ])("redacts %s", (_label, query) => {
    expect(sanitizeHelpQuery(query)).toEqual({ redacted: true });
  });

  test.each([
    ["a year", "2025年報", "2025年報"],
    ["an amount", "捐款 100", "捐款 100"],
    ["a short hotline number", "1823", "1823"],
    ["seven digits", "1234567", "1234567"],
  ])("keeps %s", (_label, query, topic) => {
    expect(sanitizeHelpQuery(query)).toEqual({ redacted: false, queryTopic: topic });
  });
});
