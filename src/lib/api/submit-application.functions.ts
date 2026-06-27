import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const applicationSchema = z.object({
  animal_id: z.string().uuid().optional(),
  animal_name: z.string().min(1),
  animal_type: z.string().min(1),
  applicant_name: z.string().min(1),
  phone: z.string().min(8),
  email: z.string().email(),
  address: z.string().min(5),
  housing_type: z.enum(["私人樓宇", "居屋", "公屋", "村屋", "其他"]),
  family_size: z.number().int().positive().optional(),
  existing_pets: z.string().optional(),
  reason: z.string().min(10),
});

type ApplicationInput = z.infer<typeof applicationSchema>;

type AdoptionApplicationInsert = {
  animal_id: string | null;
  animal_name: string;
  animal_type: string;
  applicant_name: string;
  phone: string;
  email: string;
  address: string;
  housing_type: ApplicationInput["housing_type"];
  family_size: number | null;
  existing_pets: string | null;
  reason: string;
};

type ApplicationPersistenceClient = {
  from(table: "adoption_applications"): {
    insert(payload: AdoptionApplicationInsert): {
      select(columns: "id"): {
        single(): Promise<{ data: { id: string } | null; error: unknown }>;
      };
    };
    delete(): {
      eq(column: "id", value: string): Promise<{ error: unknown }>;
    };
  };
};

type CoordinatorCaseService = {
  createCaseFromPublicApplication(args: {
    publicApplicationId: string;
    input: ApplicationInput;
  }): Promise<unknown>;
};

type PersistSubmittedApplicationDependencies<Client extends ApplicationPersistenceClient, Repo> = {
  hasServiceRoleKey?: () => boolean;
  createServiceClient: () => Client;
  createCoordinatorRepository: (client: Client) => Repo;
  createCoordinatorService: (args: { repo: Repo }) => CoordinatorCaseService;
  logger?: Pick<Console, "error">;
};

type EmailSender = {
  send(payload: { from: string; to: string; subject: string; html: string }): Promise<unknown>;
};

type NotificationDependencies = {
  emails: EmailSender;
  logger?: Pick<Console, "error">;
  to?: string;
};

type NotificationSetupDependencies = {
  createEmails: () => EmailSender | Promise<EmailSender>;
  logger?: Pick<Console, "error">;
  to?: string;
};

function toApplicationInsert(data: ApplicationInput): AdoptionApplicationInsert {
  return {
    animal_id: data.animal_id ?? null,
    animal_name: data.animal_name,
    animal_type: data.animal_type,
    applicant_name: data.applicant_name,
    phone: data.phone,
    email: data.email,
    address: data.address,
    housing_type: data.housing_type,
    family_size: data.family_size ?? null,
    existing_pets: data.existing_pets ?? null,
    reason: data.reason,
  };
}

function notificationHtml(data: ApplicationInput) {
  return `
        <h2>新領養申請</h2>
        <p><strong>動物：</strong>${data.animal_name}（${data.animal_type}）</p>
        <p><strong>申請人：</strong>${data.applicant_name}</p>
        <p><strong>電話：</strong>${data.phone}</p>
        <p><strong>電郵：</strong>${data.email}</p>
        <p><strong>住址：</strong>${data.address}</p>
        <p><strong>住宅類型：</strong>${data.housing_type}</p>
        <p><strong>家庭人數：</strong>${data.family_size ?? "未填寫"}</p>
        <p><strong>現有寵物：</strong>${data.existing_pets || "沒有"}</p>
        <p><strong>領養原因：</strong>${data.reason}</p>
      `;
}

export async function sendSubmittedApplicationNotification(
  data: ApplicationInput,
  {
    emails,
    logger = console,
    to = process.env.NOTIFICATION_EMAIL ?? "adoption@hkscda.com",
  }: NotificationDependencies,
) {
  try {
    await emails.send({
      from: "HKSCDA <noreply@hkscda.com>",
      to,
      subject: `新領養申請：${data.animal_name}（${data.applicant_name}）`,
      html: notificationHtml(data),
    });
  } catch (notificationError) {
    logger.error("Failed to send adoption application notification", notificationError);
  }
}

export async function sendSubmittedApplicationNotificationSafely(
  data: ApplicationInput,
  { createEmails, logger = console, to }: NotificationSetupDependencies,
) {
  try {
    await sendSubmittedApplicationNotification(data, {
      emails: await createEmails(),
      logger,
      to,
    });
  } catch (notificationSetupError) {
    logger.error("Failed to prepare adoption application notification", notificationSetupError);
  }
}

export async function persistSubmittedApplication<
  Client extends ApplicationPersistenceClient,
  Repo,
>(
  data: ApplicationInput,
  {
    hasServiceRoleKey = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    createServiceClient,
    createCoordinatorRepository,
    createCoordinatorService,
    logger = console,
  }: PersistSubmittedApplicationDependencies<Client, Repo>,
) {
  if (!hasServiceRoleKey()) {
    logger.error("Missing SUPABASE_SERVICE_ROLE_KEY; cannot save adoption application.");
    throw new Error("Failed to save application");
  }

  const serviceClient = createServiceClient();
  let applicationId: string;

  try {
    const { data: application, error: dbError } = await serviceClient
      .from("adoption_applications")
      .insert(toApplicationInsert(data))
      .select("id")
      .single();

    if (dbError || !application?.id) {
      logger.error("Failed to save adoption application", dbError);
      throw new Error("Failed to save application");
    }

    applicationId = application.id;
  } catch (dbError) {
    if (dbError instanceof Error && dbError.message === "Failed to save application") {
      throw dbError;
    }
    logger.error("Failed to save adoption application", dbError);
    throw new Error("Failed to save application");
  }

  try {
    const coordinatorRepo = createCoordinatorRepository(serviceClient);
    const coordinatorService = createCoordinatorService({ repo: coordinatorRepo });

    await coordinatorService.createCaseFromPublicApplication({
      publicApplicationId: applicationId,
      input: data,
    });
  } catch (caseError) {
    logger.error("Failed to create adoption coordinator case from public application", caseError);
    // The public application and coordinator case writes are separate calls, so compensate here.
    try {
      const { error: cleanupError } = await serviceClient
        .from("adoption_applications")
        .delete()
        .eq("id", applicationId);
      if (cleanupError) {
        logger.error(
          "Failed to clean up public adoption application after coordinator case failure",
          cleanupError,
        );
      }
    } catch (cleanupError) {
      logger.error(
        "Failed to clean up public adoption application after coordinator case failure",
        cleanupError,
      );
    }
    throw new Error("Failed to save application");
  }

  return { id: applicationId };
}

export const submitApplication = createServerFn({ method: "POST" })
  .inputValidator(applicationSchema)
  .handler(async ({ data }) => {
    const { createSupabaseServiceClient } = await import("../donations/supabase.server");
    const { createSupabaseAdoptionCoordinatorRepository } =
      await import("../adoptions/repository.server");
    const { createAdoptionCoordinatorService } = await import("../adoptions/service");

    await persistSubmittedApplication(data, {
      createServiceClient: createSupabaseServiceClient,
      createCoordinatorRepository: createSupabaseAdoptionCoordinatorRepository,
      createCoordinatorService: createAdoptionCoordinatorService,
    });

    await sendSubmittedApplicationNotificationSafely(data, {
      async createEmails() {
        const { Resend } = await import("resend");
        return new Resend(process.env.RESEND_API_KEY!).emails;
      },
    });

    return { success: true };
  });
