import type { SupabaseClient } from "@supabase/supabase-js";
import { assessmentCommandSchema, type AssessmentCommand, type AssessmentResult } from "./schemas";
export type { AssessmentCommand, AssessmentResult };
export function createAssessmentService(
  execute: (actor: string, command: AssessmentCommand) => Promise<AssessmentResult>,
) {
  return {
    command: (actor: string, input: unknown) =>
      execute(actor, assessmentCommandSchema.parse(input)),
  };
}
export function createAssessmentRepository(client: SupabaseClient) {
  return {
    async execute(actor: string, command: AssessmentCommand) {
      const { data, error } = await client.rpc("volunteer_assessment_command", {
        p_actor: actor,
        p_command: command,
      });
      if (error) throw error;
      return data as AssessmentResult;
    },
  };
}
