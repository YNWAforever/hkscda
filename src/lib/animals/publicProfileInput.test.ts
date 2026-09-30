import { describe, expect, test } from "bun:test";

import {
  buildPublicProfile,
  EMPTY_PUBLIC_PROFILE_FIELDS,
  toPublicProfileFields,
  type PublicProfileFields,
} from "./publicProfileInput";
import { parsePublicAnimalProfile } from "./publicProfile";

function fields(overrides: Partial<PublicProfileFields> = {}): PublicProfileFields {
  return { ...EMPTY_PUBLIC_PROFILE_FIELDS, ...overrides };
}

describe("buildPublicProfile", () => {
  test("omits blank fields instead of writing eight keys of nothing", () => {
    const result = buildPublicProfile(fields({ personality: "親人、愛撒嬌" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile).toEqual({ personality: "親人、愛撒嬌" });
  });

  test("stores neutered as a boolean, and distinguishes 'no' from 'not recorded'", () => {
    const yes = buildPublicProfile(fields({ neutered: "yes" }));
    const no = buildPublicProfile(fields({ neutered: "no" }));
    const unset = buildPublicProfile(fields({ neutered: "" }));

    expect(yes.ok && yes.profile.neutered).toBe(true);
    expect(no.ok && no.profile.neutered).toBe(false);
    // Absent, not false: "we never recorded it" is not "this animal is entire".
    expect(unset.ok && "neutered" in unset.profile).toBe(false);
  });

  test("rejects contact details rather than saving text the public page will strip", () => {
    // The nasty failure this prevents: the save succeeds, the reader discards
    // the value, and the field is blank in public with nothing to explain why.
    const cases: [keyof PublicProfileFields, string][] = [
      ["story", "請致電 98765432 了解更多"],
      ["personality", "聯絡 adopt@example.com"],
      ["health", "詳情見 https://example.com/cici"],
      ["story", "<script>alert(1)</script>"],
    ];
    for (const [key, value] of cases) {
      const result = buildPublicProfile(fields({ [key]: value } as Partial<PublicProfileFields>));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.rejected).toContain(key);
    }
  });

  test("keeps a date inside prose without mistaking it for a phone number", () => {
    // The reader strips the date before its contact check, so a story that
    // mentions a rescue date is not rejected as a phone number.
    const result = buildPublicProfile(fields({ story: "牠在 2026-03-15 被救起，現已康復。" }));
    expect(result.ok).toBe(true);
  });

  test("rejects a malformed reference number and an impossible date", () => {
    expect(buildPublicProfile(fields({ code: "  " })).ok).toBe(true); // blank is simply omitted
    expect(buildPublicProfile(fields({ code: "壹貳參" })).ok).toBe(false);
    expect(buildPublicProfile(fields({ birthday: "2026-02-31" })).ok).toBe(false);
    expect(buildPublicProfile(fields({ birthday: "15/03/2026" })).ok).toBe(false);
  });

  test("enforces the same length limits the database constraint does", () => {
    expect(buildPublicProfile(fields({ personality: "貓".repeat(1000) })).ok).toBe(true);
    expect(buildPublicProfile(fields({ personality: "貓".repeat(1001) })).ok).toBe(false);
    expect(buildPublicProfile(fields({ health: "貓".repeat(2001) })).ok).toBe(false);
    expect(buildPublicProfile(fields({ story: "貓".repeat(8001) })).ok).toBe(false);
  });
});

describe("writer and reader agree", () => {
  test("anything accepted for saving survives the public reader unchanged", () => {
    // This is the property that matters: the writer validates BY running the
    // reader, so a value staff can save is by construction a value the public
    // page renders. If these ever diverge, staff edits vanish silently.
    const input = fields({
      code: "C3761",
      birthday: "2024-05-01",
      neutered: "yes",
      suitability: "newbie",
      recordDate: "2026-01-09",
      personality: "親人、愛撒嬌",
      health: "需要定期檢查牙齒",
      story: "荃海棠在街上被發現，現正等待新家。",
    });

    const built = buildPublicProfile(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const readBack = parsePublicAnimalProfile(built.profile);
    expect(readBack.code).toBe("C3761");
    expect(readBack.birthday).toBe("2024-05-01");
    expect(readBack.neutered).toBe(true);
    expect(readBack.suitability).toBe("newbie");
    expect(readBack.recordDate).toBe("2026-01-09");
    expect(readBack.personality).toBe("親人、愛撒嬌");
    expect(readBack.health).toBe("需要定期檢查牙齒");
    expect(readBack.story).toBe("荃海棠在街上被發現，現正等待新家。");
  });

  test("a stored profile round-trips back into the form unchanged", () => {
    const original = fields({
      code: "C3761",
      birthday: "2024-05-01",
      neutered: "no",
      suitability: "experienced",
      personality: "怕生，需要耐心",
    });

    const built = buildPublicProfile(original);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    // Editing an animal twice must not lose or alter what was recorded before.
    expect(toPublicProfileFields(parsePublicAnimalProfile(built.profile))).toEqual(original);
  });
});

test("sponsor facts round-trip through the approved profile writer", () => {
  const input = fields({ sponsorUse: "糧食及覆診", recentProgress: "已完成術後檢查" });
  const result = buildPublicProfile(input);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(parsePublicAnimalProfile(result.profile).sponsorUse).toBe("糧食及覆診");
  expect(toPublicProfileFields(parsePublicAnimalProfile(result.profile))).toEqual(input);
});

test("sponsor text with a bare at-sign is rejected before the database constraint", () => {
  const result = buildPublicProfile(fields({ sponsorUse: "use @ vet" }));
  expect(result.ok).toBe(false);
});
