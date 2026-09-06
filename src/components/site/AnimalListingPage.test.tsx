import { expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => () => undefined,
}));

test("listing error preserves one page heading and the selected species navigation", async () => {
  const { AnimalListingError } = await import("./AnimalListingPage");
  for (const species of ["cat", "dog"] as const) {
    const markup = renderToStaticMarkup(
      <AnimalListingError species={species} onRetry={() => undefined} />,
    );
    expect(markup.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(markup).toContain(`<a href="/animals/${species}" aria-current="page">`);
    expect(markup).toContain("再試一次");
    expect(markup).toContain('role="alert"');
  }
});
