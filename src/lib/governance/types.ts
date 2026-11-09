// src/lib/governance/types.ts
export type BoardMember = {
  id: string;
  name: string;
  roleTitle: string;
  sortOrder: number;
  effectiveDate: string;
  isActive: boolean;
  /** The row's revision, sent back as `expectedRevision` on the next save (the optimistic fence). */
  revision?: number;
  createdAt: string;
  updatedAt: string;
};

export type BoardMemberInput = {
  id?: string;
  expectedRevision?: number;
  name: string;
  roleTitle: string;
  sortOrder: number;
  effectiveDate: string;
};

export type PublicBoardRosterMember = {
  name: string;
  roleTitle: string;
  sortOrder: number;
};

export type PublicBoardRoster = {
  members: PublicBoardRosterMember[];
  lastUpdated: string | null;
};

export type GovernanceAuditLog = {
  actor_user_id: string;
  action: "board_member.create" | "board_member.update" | "board_member.deactivate";
  entity: "board_member";
  entity_id: string;
  detail: Record<string, unknown>;
  timestamp: string;
};

export interface GovernanceRepository {
  usesAtomicAudit?: boolean;
  listPublicRoster(): Promise<PublicBoardRoster>;
  listAdmin(): Promise<BoardMember[]>;
  upsert(input: BoardMemberInput, actorUserId: string): Promise<BoardMember>;
  deactivate(id: string, actorUserId: string | undefined, reason: string): Promise<void>;
  insertAuditLog(input: GovernanceAuditLog): Promise<void>;
}
