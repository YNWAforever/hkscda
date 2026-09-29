import { expect, test } from "bun:test";
import { createReceiptFontLoader } from "./receiptFont.server";

test("concurrent receipt generation shares one font load and byte buffer", async () => {
  let loads = 0;
  const load = createReceiptFontLoader(async () => {
    loads++;
    return new Uint8Array([1, 2, 3]);
  });
  const [one, two, three] = await Promise.all([load(), load(), load()]);
  expect(loads).toBe(1);
  expect(one).toBe(two);
  expect(two).toBe(three);
});

test("failed font fetch clears the promise so a later request can retry", async () => {
  let attempts = 0;
  const load = createReceiptFontLoader(async () => {
    attempts++;
    if (attempts === 1) throw Error("synthetic outage");
    return new Uint8Array([4]);
  });
  await expect(load()).rejects.toThrow("synthetic outage");
  expect(await load()).toEqual(new Uint8Array([4]));
  expect(attempts).toBe(2);
});
