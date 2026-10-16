import type { SupabaseClient } from "@supabase/supabase-js";
import type { BulkCommand } from "./service";
import { z } from "zod";
import { attendanceActionCapabilities } from "../actionEligibility";
const rosterDetail = z
  .object({
    attendance_contract: z.literal(1),
    asOf: z.string().datetime({ offset: true }),
    activity: z
      .object({ starts_at: z.string(), ends_at: z.string().nullable(), status: z.string() })
      .passthrough(),
    registrations: z.array(
      z
        .object({
          id: z.string().uuid(),
          contact_name: z.string(),
          status: z.string(),
          attendance_status: z.string(),
          updated_at: z.string().datetime({ offset: true }),
          participant_count: z.number().int().positive(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
export function createBulkRepository(client: SupabaseClient) {
  return {
    async execute(actor: string, command: BulkCommand): Promise<unknown> {
      const timing = requestTimingContext.getStore();
      if (timing) timing.action = `bulk_${command.action}`;
      const { data, error } = await measureRequestStage("rpc", async () =>
        client.rpc(
          ["attendance_preview", "attendance_apply", "attendance_lookup"].includes(command.action)
            ? "volunteer_roster_attendance_command"
            : "volunteer_bulk_command",
          {
            p_actor: actor,
            p_command: command,
          },
        ),
      );
      if (error) throw error;
      if (
        command.action === "detail" &&
        typeof data === "object" &&
        data !== null &&
        "attendance_contract" in data &&
        data.attendance_contract === 1
      ) {
        const response = rosterDetail.safeParse(data);
        if (!response.success) throw new Error("Invalid server roster projection");
        const parsed = response.data;
        const asOf = new Date(parsed.asOf);
        return {
          ...parsed,
          registrations: parsed.registrations.map((row) => ({
            ...row,
            attendance_actions: attendanceActionCapabilities(
              {
                ...row,
                starts_at: parsed.activity.starts_at,
                ends_at: parsed.activity.ends_at,
                activity_status: parsed.activity.status,
              },
              () => asOf,
            ),
          })),
        };
      }
      return data;
    },
  };
}
import { measureRequestStage, requestTimingContext } from "../../operations/requestTiming.server";
