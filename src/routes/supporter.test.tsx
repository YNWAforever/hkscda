import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

test("supporter recovery offers a generic email verification path", async () => {
  const { SupporterPage } = await import("./supporter");
  const markup = renderToStaticMarkup(<SupporterPage />);
  expect(markup).toContain("找回");
  expect(markup).toContain("電郵");
  expect(markup).toContain("人機驗證");
});
