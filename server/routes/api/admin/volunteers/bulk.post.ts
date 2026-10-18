import { defineEventHandler } from "nitro/h3";

import { handleVolunteerBulk } from "../../../../../src/lib/volunteers/bulk/route.server";

export default defineEventHandler((event) => handleVolunteerBulk(event.req as unknown as Request));
