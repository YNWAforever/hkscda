import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShortlistProvider } from "./ShortlistProvider";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => () => undefined,
}));

const animal = {
  id: "animal-1",
  type: "cat" as const,
  name: "小白",
  name_en: null,
  gender: "female" as const,
  age: "2歲",
  age_en: null,
  description: "親人",
  description_en: null,
  notes: "需要安靜家庭",
  notes_en: null,
  status: "available" as const,
  image_url: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

describe("AnimalCard", () => {
  test("uses explicit status text and neutral identity treatment", async () => {
    const { AnimalCard } = await import("./AnimalCard");
    const markup = renderToStaticMarkup(
      <ShortlistProvider>
        <AnimalCard animal={animal} />
      </ShortlistProvider>,
    );

    expect(markup).toContain("待領養");
    expect(markup).toContain("小白");
    expect(markup).toContain("public-animal-card");
    expect(markup).toContain("public-animal-media");
    expect(markup).not.toContain("--color-cat");
    expect(markup).not.toContain("--color-dog");
  });
});
