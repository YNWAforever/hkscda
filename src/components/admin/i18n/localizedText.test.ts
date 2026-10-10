import { describe, expect, test } from "bun:test";

import { englishAlongside, localizedText } from "./localizedText";

describe("localizedText", () => {
  test("English shows the English column", () => {
    expect(localizedText("小白", "Snowy", "en")).toBe("Snowy");
  });

  test("English falls back to the Chinese value when the English one is empty, blank or null", () => {
    expect(localizedText("小白", "", "en")).toBe("小白");
    expect(localizedText("小白", "   ", "en")).toBe("小白");
    expect(localizedText("小白", null, "en")).toBe("小白");
    expect(localizedText("小白", undefined, "en")).toBe("小白");
  });

  test("Chinese always shows the Chinese value, as it did before the English admin", () => {
    expect(localizedText("小白", "Snowy", "zh")).toBe("小白");
    expect(localizedText("小白", null, "zh")).toBe("小白");
    // No English stand-in for a missing Chinese value: the Chinese screens show what they showed.
    expect(localizedText("", "Snowy", "zh")).toBe("");
    expect(localizedText(null, "Snowy", "zh")).toBe("");
  });

  test("shows the value as it was typed", () => {
    expect(localizedText("小白", " Snowy ", "en")).toBe(" Snowy ");
  });
});

describe("englishAlongside", () => {
  test("Chinese lists the English column beside the Chinese value", () => {
    expect(englishAlongside("Snowy", "zh")).toBe("Snowy");
    expect(englishAlongside(null, "zh")).toBeNull();
    expect(englishAlongside("", "zh")).toBeNull();
  });

  test("English lists nothing beside the main value", () => {
    expect(englishAlongside("Snowy", "en")).toBeNull();
  });
});
