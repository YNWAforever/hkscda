import { describe, expect, test } from "bun:test";

const publicFiles = [
  "src/routes/index.tsx",
  "src/components/site/Hero.tsx",
  "src/components/site/FeatureTrio.tsx",
  "src/components/site/BestRescue.tsx",
  "src/components/site/FundraisingCard.tsx",
  "src/components/site/AdoptionSteps.tsx",
  "src/routes/about/cccp.tsx",
  "src/routes/about/tnr.tsx",
];

describe("public brand migration", () => {
  test("removes deprecated visual-system utilities and unverified impact copy", async () => {
    const source = (await Promise.all(publicFiles.map((path) => Bun.file(path).text()))).join("\n");

    expect(source).not.toContain("card-dashed");
    expect(source).not.toContain("arch-mask");
    expect(source).not.toContain("bg-topo");
    expect(source).not.toContain("平均每 14 小時");
    expect(source).not.toContain("每年救助超過600");
  });
});
