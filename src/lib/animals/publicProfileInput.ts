import type { AnimalPublicProfile } from "../../types/animal";
import { parsePublicAnimalProfile } from "./publicProfile";

/**
 * Writer side of `animals.public_profile`.
 *
 * The allowlisted fields are the only animal facts the public site
 * renders -- reference number, birthday, neutered, suitability, record date,
 * personality, care needs and story -- and until now none of them could be
 * edited anywhere in the admin. Staff could change a name and a photo and
 * nothing else, so "edit one animal and the public site shows its personality
 * and story" was not achievable at all.
 *
 * The same rules are enforced in three places: the database CHECK constraint
 * `animals_public_profile_valid` (migration 20260906181657), the reader
 * `parsePublicAnimalProfile`, and this writer. Rather than spell the regexes
 * out a third time and let them drift, a candidate is validated by running it
 * through the READER and checking nothing came back null. That makes
 * writer/reader agreement true by construction: a value this function accepts
 * is, by definition, a value the public page will render. The alternative
 * failure mode is the nasty one -- staff save a sentence, the save succeeds,
 * and the reader quietly strips it, so the field stays blank in public with no
 * indication why.
 *
 * The database remains the authority. This runs in the browser and is a
 * courtesy that produces a usable error instead of a constraint violation.
 */

export type PublicProfileFields = {
  code: string;
  birthday: string;
  neutered: "" | "yes" | "no";
  suitability: "" | "newbie" | "experienced";
  recordDate: string;
  personality: string;
  health: string;
  sponsorUse: string;
  recentProgress: string;
  story: string;
};

export const EMPTY_PUBLIC_PROFILE_FIELDS: PublicProfileFields = {
  code: "",
  birthday: "",
  neutered: "",
  suitability: "",
  recordDate: "",
  personality: "",
  health: "",
  sponsorUse: "",
  recentProgress: "",
  story: "",
};

export type PublicProfileBuildResult =
  | { ok: true; profile: Record<string, string | boolean> }
  | { ok: false; rejected: (keyof PublicProfileFields)[] };

/** Loads an existing stored profile back into editable form values. */
export function toPublicProfileFields(
  profile: AnimalPublicProfile | null | undefined,
): PublicProfileFields {
  const parsed = parsePublicAnimalProfile(profile ?? {});
  return {
    code: parsed.code ?? "",
    birthday: parsed.birthday ?? "",
    neutered: parsed.neutered === true ? "yes" : parsed.neutered === false ? "no" : "",
    suitability: parsed.suitability ?? "",
    recordDate: parsed.recordDate ?? "",
    personality: parsed.personality ?? "",
    health: parsed.health ?? "",
    sponsorUse: parsed.sponsorUse ?? "",
    recentProgress: parsed.recentProgress ?? "",
    story: parsed.story ?? "",
  };
}

/**
 * Builds the jsonb payload, or reports which fields the public reader would
 * refuse.
 *
 * Blank fields are omitted rather than written as null. The CHECK constraint
 * accepts either, and omitting keeps the stored object to what was actually
 * recorded instead of empty keys.
 */
export function buildPublicProfile(fields: PublicProfileFields): PublicProfileBuildResult {
  const candidate: Record<string, string | boolean> = {};
  const text = (value: string) => value.trim();

  if (text(fields.code)) candidate.code = text(fields.code);
  if (text(fields.birthday)) candidate.birthday = text(fields.birthday);
  if (fields.neutered) candidate.neutered = fields.neutered === "yes";
  if (fields.suitability) candidate.suitability = fields.suitability;
  if (text(fields.recordDate)) candidate.recordDate = text(fields.recordDate);
  if (text(fields.personality)) candidate.personality = text(fields.personality);
  if (text(fields.health)) candidate.health = text(fields.health);
  if (text(fields.sponsorUse)) candidate.sponsorUse = text(fields.sponsorUse);
  if (text(fields.recentProgress)) candidate.recentProgress = text(fields.recentProgress);
  if (text(fields.story)) candidate.story = text(fields.story);

  const parsed = parsePublicAnimalProfile(candidate);
  const rejected = (Object.keys(candidate) as (keyof PublicProfileFields)[]).filter(
    (key) => parsed[key as keyof AnimalPublicProfile] === null,
  );

  return rejected.length > 0 ? { ok: false, rejected } : { ok: true, profile: candidate };
}

/** Field labels for the rejection message, in the product's primary language. */
export const PUBLIC_PROFILE_LABELS: Record<keyof PublicProfileFields, string> = {
  code: "編號",
  birthday: "出生日期",
  neutered: "絕育狀態",
  suitability: "適合的領養者",
  recordDate: "記錄日期",
  personality: "性格",
  health: "照顧與健康需要",
  sponsorUse: "助養用途",
  recentProgress: "近況",
  story: "牠的故事",
};
