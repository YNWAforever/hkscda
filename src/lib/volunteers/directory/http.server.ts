import { withVolunteerTiming, logVolunteerFailure } from "../telemetry.server";
import { z } from "zod";
import { directoryQuerySchema, type DirectoryQuery } from "./schemas";
import type { DirectoryDetail, DirectoryList } from "./types";
export type DirectoryDependencies = {
  authorize: (request: Request) => Promise<string>;
  read: (actor: string, input: DirectoryQuery) => Promise<DirectoryList | DirectoryDetail | null>;
};
export function createDirectoryHandler(deps: DirectoryDependencies) {
  return withVolunteerTiming("directory_read", async (request: Request) => {
    const headers = { "cache-control": "no-store" };
    try {
      const actor = await deps.authorize(request);
      const input = directoryQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      const data = await deps.read(actor, input);
      return Response.json(data ?? { error: "找不到義工身份" }, {
        status: data ? 200 : 404,
        headers,
      });
    } catch (error) {
      if (error instanceof Response)
        return new Response(error.body, {
          status: error.status,
          headers: { ...Object.fromEntries(error.headers), ...headers },
        });
      if (error instanceof z.ZodError)
        return Response.json({ error: "請檢查搜尋條件" }, { status: 400, headers });
      if (error && typeof error === "object" && "code" in error && error.code === "42501")
        return Response.json({ error: "沒有查閱權限" }, { status: 403, headers });
      logVolunteerFailure("directory_read", error);
      return Response.json({ error: "未能載入義工資料，請重試" }, { status: 500, headers });
    }
  });
}
