import { createSupabaseServiceClient } from "../supabase.server";
import { createSupabaseDocumentRepository } from "./repository.server";
import type { DocumentRepository } from "./service";

type PublicDocumentRepository = Pick<
  DocumentRepository,
  "listPublishedAnnualReports" | "listPublishedSlots"
>;

function defaultRepository() {
  return createSupabaseDocumentRepository(createSupabaseServiceClient());
}

export async function loadPublishedAnnualReports(repository?: PublicDocumentRepository) {
  try {
    return await (repository ?? defaultRepository()).listPublishedAnnualReports();
  } catch (error) {
    console.error(error);
    throw new Error("Could not load annual reports");
  }
}

export async function loadPublishedDocumentSlots(
  slotKeys: string[],
  repository?: PublicDocumentRepository,
) {
  try {
    return await (repository ?? defaultRepository()).listPublishedSlots(slotKeys);
  } catch (error) {
    console.error(error);
    throw new Error("Could not load document slots");
  }
}
