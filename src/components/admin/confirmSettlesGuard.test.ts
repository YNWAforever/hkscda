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

describe("confirm dialogs that will take a reason wait for the request", () => {
  for (const path of SITES) {
    test(path, async () => {
      const bodies = onConfirmBodies(await Bun.file(path).text());
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        expect(body).toMatch(/await [\w.]*(mutateAsync|onAction)/);
        expect(body).not.toMatch(/\.mutate\(/);
      }
    });
  }

  test("the check sees a fire-and-forget handler", () => {
    const bad = "<ConfirmActionDialog onConfirm={async () => { m.mutate(x); }} />";
    expect(onConfirmBodies(bad)[0]).toMatch(/\.mutate\(/);
    expect(onConfirmBodies("<Other onConfirm={x} />")).toEqual([]);
  });
});
