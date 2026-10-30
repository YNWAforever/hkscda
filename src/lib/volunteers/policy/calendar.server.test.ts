import { expect, test } from "bun:test";

import type { BulkCommand } from "../bulk/service";
import { readVolunteerCalendar } from "./calendar.server";

const TODAY =
  "http://localhost/api/admin/volunteers/calendar?from=2026-10-30T00:00:00%2B08:00&until=2026-10-31T00:00:00%2B08:00";

function readWith(total: number, returned: number) {
  const commands: BulkCommand[] = [];
  const deps = {
    authorize: async () => "00000000-0000-4000-8000-000000000001",
    execute: async (_actor: string, command: BulkCommand) => {
      commands.push(command);
      return {
        kind: "listed",
        activities: Array.from({ length: returned }, (_, index) => ({ id: `a-${index}` })),
        total,
        page_size: 25,
      };
    },
  };
  return { commands, read: () => readVolunteerCalendar(new Request(TODAY), deps) };
}

test("BUG-62: the Today read lists published sessions only and says when the list is partial", async () => {
  const busy = readWith(40, 25);
  const response = await busy.read();
  expect(response.status).toBe(200);
  const body = (await response.json()) as { activities: unknown[]; truncated: boolean };
  expect(body.activities).toHaveLength(25);
  expect(body.truncated).toBe(true);
  expect(busy.commands).toHaveLength(1);
  const command = busy.commands[0] as Extract<BulkCommand, { action: "list" }>;
  expect(command.filter.status).toBe("published");
  expect(command.filter.from).toBe("2026-10-30");
  expect(command.filter.until).toBe("2026-10-30");

  const quiet = readWith(3, 3);
  expect(((await (await quiet.read()).json()) as { truncated: boolean }).truncated).toBe(false);
});
