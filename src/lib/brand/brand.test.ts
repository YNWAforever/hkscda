import { describe, expect, test } from "bun:test";
import { brand } from "./brand";

describe("HKSCDA brand contract", () => {
  test("uses the authentic organisation identity and canonical sampled colours", () => {
    expect(brand.nameZh).toBe("香港拯救貓狗協會");
    expect(brand.nameEn).toBe("Hong Kong Saving Cat and Dog Association");
    expect(brand.logo.alt).toBe("香港拯救貓狗協會 HKSCDA");
    expect(brand.colors).toEqual({ blue: "#05648E", magenta: "#A61C56" });
  });

  test("ships a local non-trivial JPEG logo asset", async () => {
    const asset = Bun.file(`public${brand.logo.src}`);
    expect(asset.type).toBe("image/jpeg");
    expect(asset.size).toBeGreaterThan(50_000);
  });
});
