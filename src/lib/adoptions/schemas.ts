import { z } from "zod";

export const statusCategories = [
  "adoption_case",
  "animal_lifecycle",
  "match",
  "followup",
  "final_outcome",
] as const;

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const nullableOptionalTrimmed = optionalTrimmed.nullable().optional();

const monthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/);

const booleanSearch = z.preprocess((value) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === undefined || value === "") return false;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0" || normalized === "") return false;
  }

  return false;
}, z.boolean());

const defaultTaskType = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : "followup";
  });

export const statusInputSchema = z.object({
  category: z.enum(statusCategories),
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/),
  labelZh: z.string().trim().min(1),
  labelEn: z.string().trim().min(1),
  sortOrder: z.coerce.number().int().min(0).default(0),
  color: z.string().trim().min(1).default("slate"),
  isActive: z.boolean().default(true),
  isClosing: z.boolean().default(false),
  isFinal: z.boolean().default(false),
});

export const statusUpdateSchema = statusInputSchema.partial().extend({
  delete: z.boolean().optional(),
});

export const caseSearchSchema = z.object({
  q: optionalTrimmed,
  statusId: z.string().uuid().optional(),
  animalType: optionalTrimmed,
  openOnly: booleanSearch.default(false),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(25),
});

export const adopterSearchSchema = z.object({
  q: optionalTrimmed,
  blacklisted: z.enum(["all", "yes", "no"]).catch("all"),
  hasOpenCases: booleanSearch.default(false),
  hasOpenTasks: booleanSearch.default(false),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(25),
});

export const animalPipelineSearchSchema = z.object({
  q: optionalTrimmed,
  animalId: optionalTrimmed,
  status: z.enum(["all", "available", "fostered", "adopted"]).catch("all"),
  type: z.enum(["all", "cat", "dog", "sponsor"]).catch("all"),
  adoptable: z.enum(["all", "adoptable", "not_adoptable"]).catch("all"),
  supportPool: z.enum(["all", "inside", "outside"]).catch("all"),
  positionId: optionalTrimmed.transform((value) => value ?? "all"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(25),
});

export const coordinatorExportKindSchema = z.enum([
  "cases",
  "adopters",
  "successful-adoptions",
  "animals",
  "tasks",
]);

export const coordinatorReportHistorySearchSchema = z.object({
  month: monthSchema,
  kind: coordinatorExportKindSchema.optional(),
  actor: optionalTrimmed,
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(25),
});

export const coordinatorMonthlySummarySearchSchema = z.object({
  month: monthSchema,
});

export const coordinatorExportRegenerateSchema = z.object({
  auditLogId: z.string().uuid(),
});

export const statusTransitionSchema = z.object({
  statusId: z.string().uuid(),
  note: optionalTrimmed,
});

export const matchInputSchema = z.object({
  animalId: z.string().uuid(),
  statusId: z.string().uuid(),
  notes: optionalTrimmed,
});

const linkedTaskEntitySchema = z
  .object({
    adoptionCaseId: z.string().uuid().optional(),
    adopterProfileId: z.string().uuid().optional(),
    animalId: z.string().uuid().optional(),
  })
  .refine(
    (value) => Boolean(value.adoptionCaseId || value.adopterProfileId || value.animalId),
    "At least one task link is required",
  );

export const taskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const taskContactChannelSchema = z.enum([
  "phone",
  "whatsapp",
  "email",
  "in_person",
  "internal",
]);

const manualAdopterProfileSchema = z.object({
  nameEnglish: nullableOptionalTrimmed,
  nameChinese: nullableOptionalTrimmed,
  address: nullableOptionalTrimmed,
  householdSize: nullableOptionalTrimmed,
});

export const manualCaseIdentitySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("existing_adopter"),
      adopterProfileId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("existing_supporter"),
      supporterId: z.string().uuid(),
      adopterProfile: manualAdopterProfileSchema.default({}),
    })
    .strict(),
  z
    .object({
      kind: z.literal("new_supporter"),
      supporter: z
        .object({
          name: z.string().trim().min(1),
          phone: z.string().trim().min(1),
          email: optionalTrimmed,
          language: z.enum(["zh-HK", "en"]).default("zh-HK"),
        })
        .strict(),
      adopterProfile: manualAdopterProfileSchema.default({}),
    })
    .strict(),
]);

export const manualCaseInitialTaskSchema = z.object({
  statusId: z.string().uuid(),
  title: z.string().trim().min(1),
  taskType: defaultTaskType,
  priority: taskPrioritySchema.default("normal"),
  dueAt: z.string().datetime().optional(),
  assignedTo: optionalTrimmed,
  volunteer: optionalTrimmed,
  contactChannel: taskContactChannelSchema.optional(),
  remarks: optionalTrimmed,
});

export const manualCaseIntakeSchema = z.object({
  identity: manualCaseIdentitySchema,
  case: z.object({
    initialStatusId: z.string().uuid(),
    requestedAnimalId: z.string().uuid().optional(),
    animalType: optionalTrimmed.pipe(z.string().min(1)),
    applicantName: z.string().trim().min(1),
    applicantPhone: z.string().trim().min(1),
    applicantEmail: optionalTrimmed,
    applicantAddress: optionalTrimmed,
    housingType: optionalTrimmed,
    familySize: z.coerce.number().int().min(1).nullable().optional(),
    existingPets: optionalTrimmed,
    reason: optionalTrimmed,
    preferences: z.record(z.string(), z.unknown()).default({}),
  }),
  initialTask: manualCaseInitialTaskSchema.optional(),
});

const taskFieldsSchema = z.object({
  title: z.string().trim().min(1),
  statusId: z.string().uuid(),
  taskType: defaultTaskType,
  priority: taskPrioritySchema.default("normal"),
  dueAt: z.string().datetime().optional(),
  scheduledAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  assignedTo: optionalTrimmed,
  volunteer: optionalTrimmed,
  contactChannel: taskContactChannelSchema.optional(),
  outcome: optionalTrimmed,
  nextStepAt: z.string().datetime().optional(),
  remarks: optionalTrimmed,
  hasWindowNet: z.boolean().optional(),
  environment: optionalTrimmed,
  score: optionalTrimmed,
});

export const taskListSearchSchema = z.object({
  q: optionalTrimmed,
  statusId: z.string().uuid().optional(),
  priority: taskPrioritySchema.optional(),
  taskType: optionalTrimmed,
  due: z.enum(["overdue", "today", "upcoming", "none", "all"]).catch("all"),
  adoptionCaseId: z.string().uuid().optional(),
  adopterProfileId: z.string().uuid().optional(),
  animalId: z.string().uuid().optional(),
  assignedTo: optionalTrimmed,
  openOnly: booleanSearch.default(false),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(25),
});

export const coordinatorTaskInputSchema = linkedTaskEntitySchema.and(taskFieldsSchema);

export const coordinatorTaskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    statusId: z.string().uuid().optional(),
    adoptionCaseId: z.string().uuid().nullable().optional(),
    adopterProfileId: z.string().uuid().nullable().optional(),
    animalId: z.string().uuid().nullable().optional(),
    taskType: optionalTrimmed,
    priority: taskPrioritySchema.optional(),
    dueAt: z.string().datetime().nullable().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    completedAt: z.string().datetime().nullable().optional(),
    assignedTo: optionalTrimmed.nullable().optional(),
    volunteer: optionalTrimmed.nullable().optional(),
    contactChannel: taskContactChannelSchema.nullable().optional(),
    outcome: optionalTrimmed.nullable().optional(),
    nextStepAt: z.string().datetime().nullable().optional(),
    remarks: optionalTrimmed.nullable().optional(),
    hasWindowNet: z.boolean().nullable().optional(),
    environment: optionalTrimmed.nullable().optional(),
    score: optionalTrimmed.nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Task update cannot be empty",
  );

export const finalizeAdoptionSchema = z.object({
  matchId: z.string().uuid(),
  outcomeStatusId: z.string().uuid(),
  caseNumber: z.string().trim().min(1),
  adoptionFeeCents: z.number().int().min(0).nullable().optional(),
  approvalDate: z.string().date(),
  pickupDate: z.string().date().nullable().optional(),
});
