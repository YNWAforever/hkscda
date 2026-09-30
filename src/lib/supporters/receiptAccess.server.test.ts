import { expect, test } from "bun:test";
import { authorizeReceiptRow } from "./receiptAccess.server";

const receipt = {
  id: "r1",
  supporter_id: "s1",
  receipt_no: "HKSCDA-2026-1",
  status: "issued",
  pdf_url: "2026/HKSCDA-2026-1.pdf",
  donation_ids: ["d1", "d2"],
};

test("receipt signing requires the owner and every linked donation", () => {
  expect(authorizeReceiptRow(receipt, "s1", ["d1", "d2"])).toEqual({
    path: receipt.pdf_url,
    fileName: "HKSCDA-2026-1.pdf",
  });
  expect(authorizeReceiptRow(receipt, "s2", ["d1", "d2"])).toBeNull();
  expect(authorizeReceiptRow(receipt, "s1", ["d1"])).toBeNull();
  expect(authorizeReceiptRow({ ...receipt, status: "void" }, "s1", ["d1", "d2"])).toBeNull();
  expect(
    authorizeReceiptRow({ ...receipt, pdf_url: "../secret.pdf" }, "s1", ["d1", "d2"]),
  ).toBeNull();
});
