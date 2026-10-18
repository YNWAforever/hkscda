import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import type { AdminLanguage } from "../../../lib/admin/language";
import {
  invalidateVolunteerQueries,
  type VolunteerChange,
} from "../../../lib/volunteers/queryKeys";
import { pickAdminCopy } from "../i18n/copy";
import { volunteerCommonCopy } from "./volunteerCommonCopy";
/** Only call after a successful server write. A refresh failure must not reject that write. */
export async function refreshVolunteerQueries(
  client: QueryClient,
  change: VolunteerChange,
  language: AdminLanguage,
): Promise<void> {
  try {
    await invalidateVolunteerQueries(client, change);
  } catch {
    toast.warning(pickAdminCopy(volunteerCommonCopy, language).savedRefreshFailed);
  }
}
