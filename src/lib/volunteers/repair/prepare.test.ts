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

// These exercise the emitter's input boundary, not PostgreSQL execution.
test("release rejects nonempty security labels before any SQL can be emitted", () => {
  expect(() =>
    prepareVolunteerDbRepair(sources, {
      reasonSecurityLabels: [{ provider: "unapproved_provider", label: "restricted" }],
    }),
  ).toThrow("Unsupported volunteer repair metadata");
});

for (const reasonComment of ["bad\0comment", "x".repeat(2049)]) {
  test("release refuses an unsupported comment rather than silently losing metadata", () => {
    expect(() => prepareVolunteerDbRepair(sources, { reasonComment })).toThrow(
      "Unsupported volunteer repair metadata",
    );
  });
}

test("release refuses an unbound bulk body hash", () => {
  expect(() =>
    prepareVolunteerDbRepair(sources, { bulkBodyCanonicalLfSha256: "unreviewed" }),
  ).toThrow("Unsupported volunteer repair metadata");
});

test("release cannot expand its permission set through unknown approval fields", () => {
  expect(() =>
    prepareVolunteerDbRepair(sources, { extraAllowedRole: "unexpected_executor" }),
  ).toThrow("Unsupported volunteer repair metadata");
});

test("reviewed comment cannot close the release DO literal", () => {
  const sql = prepareVolunteerDbRepair(sources, {
    reasonComment: "Operator's note $volunteer_release_v2$; select 1; --",
  }).releaseSql;
  const opening = /^do (\$\w+\$)\n/.exec(sql);
  expect(opening).not.toBeNull();
  const tag = opening![1];
  const closing = sql.lastIndexOf(tag);
  expect(sql.indexOf(tag, opening![0].length)).toBe(closing);
  expect(sql.slice(closing + tag.length)).toBe(";\n");
});
