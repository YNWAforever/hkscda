import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { prepareVolunteerDbRepair, type VolunteerDbRepairSources } from "./prepare.server";

const sources: VolunteerDbRepairSources = {
  registrationReason: readFileSync(
    "supabase/migrations/20261010130100_sp5b2_volunteer_registration_reason.sql",
    "utf8",
  ),
  singleProjection: readFileSync(
    "supabase/migrations/20261015122315_volunteer_workspace_single_projection.sql",
    "utf8",
  ),
  pageProjection: readFileSync(
    "supabase/migrations/20261015181456_volunteer_workspace_page_projection.sql",
    "utf8",
  ),
};

for (const name of ["registrationReason", "singleProjection", "pageProjection"] as const) {
  test(`refuses unreviewed ${name} input before emitting repair SQL`, () => {
    expect(() =>
      prepareVolunteerDbRepair({ ...sources, [name]: sources[name] + "\nselect 1;" }),
    ).toThrow("Unreviewed volunteer repair source: " + name);
  });
}
