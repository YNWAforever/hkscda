import type { BoardMember } from "../../../lib/governance/types";
import { hongKongDay } from "../i18n/format";

export type BoardMemberDraft = {
  id?: string;
  /** The revision the member was loaded at; the save sends it as the optimistic fence. */
  revision?: number;
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
    revision: member?.revision,
    name: member?.name ?? "",
    roleTitle: member?.roleTitle ?? "",
    sortOrder: member?.sortOrder ?? 0,
    effectiveDate: member?.effectiveDate ?? hongKongDay(now()),
  };
}
