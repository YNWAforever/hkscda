import { expect, test } from "bun:test";
import { consentChanges } from "./consentChanges";
test("editing email leaves unknown WhatsApp untouched", () => {
  expect(
    consentChanges({ email: null, whatsapp: null }, { email: "opt_in", whatsapp: null }),
  ).toEqual({ email: true });
});
test("no change does not manufacture opt-out; explicit refusal patches only that channel", () => {
  expect(consentChanges({ email: null, whatsapp: null }, { email: null, whatsapp: null })).toEqual(
    {},
  );
  expect(
    consentChanges({ email: "opt_in", whatsapp: null }, { email: "opt_out", whatsapp: null }),
  ).toEqual({ email: false });
});
