import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const { AdminLanguageProvider } = await import("../adminI18n");
const { StatusAdmin, StatusLoadErrorRow } = await import("./StatusAdmin");

describe("StatusLoadErrorRow", () => {
  test("announces the statuses table load error", () => {
    const markup = renderToStaticMarkup(
      <table>
        <tbody>
          <StatusLoadErrorRow message="Could not load statuses" />
        </tbody>
      </table>,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Could not load statuses");
  });
});

describe("StatusAdmin", () => {
  test("renders required validation errors for blank status fields", () => {
    const client = new QueryClient();
    const markup = renderToStaticMarkup(
      <AdminLanguageProvider>
        <QueryClientProvider client={client}>
          <StatusAdmin />
        </QueryClientProvider>
      </AdminLanguageProvider>,
    );

    expect(markup).toContain("Key is required.");
    expect(markup).toContain("Chinese label is required.");
    expect(markup).toContain("English label is required.");
    expect(markup).toContain('aria-describedby="status-key-error"');
    expect(markup).toContain('aria-describedby="status-label-zh-error"');
    expect(markup).toContain('aria-describedby="status-label-en-error"');
    expect(markup).toContain('id="status-key-error"');
    expect(markup).toContain('id="status-label-zh-error"');
    expect(markup).toContain('id="status-label-en-error"');
    expect(markup).toContain('role="alert"');
  });
});
