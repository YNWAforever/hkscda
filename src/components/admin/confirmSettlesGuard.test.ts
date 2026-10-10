import { describe, expect, test } from "bun:test";

/**
 * SP-5b-2 gives these seven actions a required reason. A reason that staff typed must survive a
 * failed request, so each dialog's `onConfirm` has to wait for the request and let a failure
 * reject (`ConfirmActionDialog` then keeps itself open and shows the error). A fire-and-forget
 * `mutate(...)` returns at once and closes the dialog before the request settles.
 */
const SITES = [
  "src/components/admin/donations/PaymentsReconcile.tsx",
  "src/components/admin/adoptions/StatusAdmin.tsx",
  "src/components/admin/content/AdoptionInformationManagement.tsx",
  "src/components/admin/content/DocumentManagement.tsx",
  "src/components/admin/content/AnnualReportManagement.tsx",
  "src/components/admin/volunteers/VolunteerManagement.tsx",
  "src/components/admin/volunteers/VolunteerRegistrationDetail.tsx",
];

/** The `onConfirm` bodies of every ConfirmActionDialog in `text`. */
export function onConfirmBodies(text: string): string[] {
  const bodies: string[] = [];
  for (const block of text.split("<ConfirmActionDialog").slice(1)) {
    const dialog = block.slice(0, block.indexOf("/>"));
    const start = dialog.indexOf("onConfirm=");
    if (start >= 0) bodies.push(dialog.slice(start));
  }
  return bodies;
}

/** Why an `onConfirm` body would not keep the dialog open on failure; empty when it would. */
export function reasonSiteProblems(body: string): string[] {
  const problems: string[] = [];
  if (!/await [\w.]*(mutateAsync|onAction)/.test(body)) problems.push("does not await the request");
  if (/\.mutate\(/.test(body)) problems.push("fires and forgets with mutate()");
  // `.catch(` turns a failure into success, so the dialog would close and lose the reason.
  if (/\.catch\(/.test(body)) problems.push("swallows the rejection with .catch()");
  return problems;
}

describe("confirm dialogs that will take a reason wait for the request", () => {
  for (const path of SITES) {
    test(path, async () => {
      const bodies = onConfirmBodies(await Bun.file(path).text());
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        expect(reasonSiteProblems(body)).toEqual([]);
      }
    });
  }

  test("the check sees a fire-and-forget handler", () => {
    const bad = "<ConfirmActionDialog onConfirm={async () => { m.mutate(x); }} />";
    expect(reasonSiteProblems(onConfirmBodies(bad)[0])).not.toEqual([]);
    expect(onConfirmBodies("<Other onConfirm={x} />")).toEqual([]);
  });

  test("the check sees a rejection swallowed with .catch(", () => {
    const bad =
      "<ConfirmActionDialog onConfirm={async () => { await m.mutateAsync(x).catch(() => undefined); }} />";
    expect(reasonSiteProblems(onConfirmBodies(bad)[0])).not.toEqual([]);
  });

  test("the check passes a handler that awaits and lets a failure reject", () => {
    const good = "<ConfirmActionDialog onConfirm={async () => { await m.mutateAsync(x); }} />";
    expect(reasonSiteProblems(onConfirmBodies(good)[0])).toEqual([]);
  });
});
