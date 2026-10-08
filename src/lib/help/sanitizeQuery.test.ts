import { describe, expect, test } from "bun:test";

import { sanitizeHelpQuery } from "./sanitizeQuery";

// Characters are written as escapes so the source file never contains an
// invisible or direction-changing character.
const ZERO_WIDTH_SPACE = "​";
const ZERO_WIDTH_JOINER = "‍";
const BYTE_ORDER_MARK = "﻿";
const RIGHT_TO_LEFT_OVERRIDE = "‮";
const NUL = "\u0000";

// Postgres text cannot hold NUL, and a bidi control reorders what staff read.
const controlOrFormat = /[\p{Cc}\p{Cf}]/u;

describe("sanitizeHelpQuery control and format characters", () => {
  test.each([
    ["a zero-width space", ZERO_WIDTH_SPACE],
    ["a zero-width joiner", ZERO_WIDTH_JOINER],
    ["a byte order mark", BYTE_ORDER_MARK],
    ["a soft hyphen", "­"],
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
    ["U+202A left-to-right embedding", "‪"],
    ["U+2066 left-to-right isolate", "⁦"],
    ["U+2069 pop directional isolate", "⁩"],
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
    expect(sanitizeHelpQuery(`${NUL}${ZERO_WIDTH_SPACE}${RIGHT_TO_LEFT_OVERRIDE}⁦`)).toEqual({
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
