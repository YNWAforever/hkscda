import { buildCsv } from "../crm/csv";

import type {
  CoordinatorAdopterExportRow,
  CoordinatorAnimalExportRow,
  CoordinatorCaseExportRow,
  CoordinatorSuccessfulAdoptionExportRow,
  CoordinatorTaskExportRow,
} from "./types";

function centsToDecimal(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

function nullableCentsToDecimal(amountCents: number | null) {
  return amountCents === null ? "" : centsToDecimal(amountCents);
}

export function buildCoordinatorCaseCsv(rows: CoordinatorCaseExportRow[]) {
  return buildCsv(
    [
      "case_id",
      "applicant_name",
      "applicant_phone",
      "applicant_email",
      "status",
      "animal_type",
      "requested_animal",
      "adopter_profile_id",
      "supporter_id",
      "created_at",
      "closed_at",
    ],
    rows.map((row) => [
      row.caseId,
      row.applicantName,
      row.applicantPhone,
      row.applicantEmail,
      row.status,
      row.animalType,
      row.requestedAnimal,
      row.adopterProfileId,
      row.supporterId,
      row.createdAt,
      row.closedAt,
    ]),
  );
}

export function buildCoordinatorAdopterCsv(rows: CoordinatorAdopterExportRow[]) {
  return buildCsv(
    [
      "adopter_profile_id",
      "supporter_id",
      "display_name",
      "email",
      "phone",
      "living_area",
      "is_blacklisted",
      "open_case_count",
      "successful_adoption_count",
      "open_task_count",
      "latest_case_at",
    ],
    rows.map((row) => [
      row.adopterProfileId,
      row.supporterId,
      row.displayName,
      row.email,
      row.phone,
      row.livingArea,
      row.isBlacklisted,
      row.openCaseCount,
      row.successfulAdoptionCount,
      row.openTaskCount,
      row.latestCaseAt,
    ]),
  );
}

export function buildCoordinatorSuccessfulAdoptionCsv(
  rows: CoordinatorSuccessfulAdoptionExportRow[],
) {
  return buildCsv(
    [
      "successful_adoption_id",
      "case_id",
      "case_number",
      "adopter_profile_id",
      "supporter_id",
      "animal_id",
      "animal_name",
      "adoption_fee_hkd",
      "approval_date",
      "pickup_date",
    ],
    rows.map((row) => [
      row.successfulAdoptionId,
      row.caseId,
      row.caseNumber,
      row.adopterProfileId,
      row.supporterId,
      row.animalId,
      row.animalName,
      nullableCentsToDecimal(row.adoptionFeeCents),
      row.approvalDate,
      row.pickupDate,
    ]),
  );
}

export function buildCoordinatorAnimalCsv(rows: CoordinatorAnimalExportRow[]) {
  return buildCsv(
    [
      "animal_id",
      "type",
      "name",
      "name_en",
      "status",
      "internal_code",
      "current_position",
      "arrival_source",
      "is_adoptable",
      "is_inside_support_pool",
      "adopted_at",
      "deceased_at",
    ],
    rows.map((row) => [
      row.animalId,
      row.type,
      row.name,
      row.nameEn,
      row.status,
      row.internalCode,
      row.currentPosition,
      row.arrivalSource,
      row.isAdoptable,
      row.isInsideSupportPool,
      row.adoptedAt,
      row.deceasedAt,
    ]),
  );
}

export function buildCoordinatorTaskCsv(rows: CoordinatorTaskExportRow[]) {
  return buildCsv(
    [
      "task_id",
      "title",
      "status",
      "priority",
      "due_at",
      "completed_at",
      "adoption_case_id",
      "adopter_profile_id",
      "animal_id",
      "assigned_to",
      "volunteer",
      "contact_channel",
      "outcome",
      "remarks",
    ],
    rows.map((row) => [
      row.taskId,
      row.title,
      row.status,
      row.priority,
      row.dueAt,
      row.completedAt,
      row.adoptionCaseId,
      row.adopterProfileId,
      row.animalId,
      row.assignedTo,
      row.volunteer,
      row.contactChannel,
      row.outcome,
      row.remarks,
    ]),
  );
}
