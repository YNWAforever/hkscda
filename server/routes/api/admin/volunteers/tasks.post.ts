import { defineEventHandler } from "nitro/h3";

import { handleVolunteerTask } from "../../../../../src/lib/volunteers/jobs/tasks.server";

export default defineEventHandler((event) => handleVolunteerTask(event.req as unknown as Request));
