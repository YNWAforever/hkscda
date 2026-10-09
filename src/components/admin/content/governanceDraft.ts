import type { BoardMember } from "../../../lib/governance/types";
import { hongKongDay } from "../i18n/format";

export type BoardMemberDraft = {
  id?: string;
  name: string;
  roleTitle: string;
  sortOrder: number;
  effectiveDate: string;
};

/** The form for a member; a new member's effective date defaults to today in Hong Kong. */
export function draftFromMember(
  member?: BoardMember,
  now: () => Date = () => new Date(),
): BoardMemberDraft {
  return {
    id: member?.id,
    name: member?.name ?? "",
    roleTitle: member?.roleTitle ?? "",
    sortOrder: member?.sortOrder ?? 0,
    effectiveDate: member?.effectiveDate ?? hongKongDay(now()),
  };
}
