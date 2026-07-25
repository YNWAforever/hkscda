export type KnowledgeDestination =
  | { kind: "external"; url: string }
  | { kind: "document"; assetId: string; url?: string };

export type KnowledgePost = {
  id: string;
  title: string;
  topic: string;
  shortIntro: string;
  sourceName: string | null;
  destination: KnowledgeDestination;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgePostInput = {
  id?: string;
  title: string;
  topic: string;
  shortIntro: string;
  sourceName: string | null;
  destination: KnowledgeDestination;
  isPublished: boolean;
  sortOrder: number;
};

export type AdminKnowledgeStatus = "all" | "published" | "draft";

export type AdminKnowledgeQuery = {
  q?: string;
  page: number;
  pageSize: number;
  status: AdminKnowledgeStatus;
};

export type AdminKnowledgePage = {
  posts: KnowledgePost[];
  total: number;
  page: number;
  pageSize: number;
};

export type KnowledgeAuditLog = {
  actor_user_id: string;
  action: "knowledge_post.create" | "knowledge_post.update" | "knowledge_post.delete";
  entity: "knowledge_post";
  entity_id: string;
  detail: Record<string, unknown>;
  timestamp: string;
};

export interface KnowledgeRepository {
  listPublished(): Promise<KnowledgePost[]>;
  listAdmin(input: AdminKnowledgeQuery): Promise<AdminKnowledgePage>;
  upsert(input: KnowledgePostInput): Promise<KnowledgePost>;
  remove(id: string): Promise<void>;
  insertAuditLog(input: KnowledgeAuditLog): Promise<void>;
}
