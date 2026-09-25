import { describe, expect, test } from "bun:test";
import { readBoundedInternshipFormData } from "./attachments.server";

describe("internship attachment request size", () => {
  test("rejects an oversized multipart request without Content-Length", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array(11 * 1024 * 1024)], "oversized.pdf", { type: "application/pdf" }),
    );
    const request = new Request("http://localhost/api/internships/attachment", {
      method: "POST",
      body: form,
    });
    expect(request.headers.get("content-length")).toBeNull();

    expect(await readBoundedInternshipFormData(request)).toBeNull();
  });

  test("still parses a bounded multipart request", async () => {
    const form = new FormData();
    form.set("application_id", "test-application");
    form.set("file", new File(["%PDF-small"], "proof.pdf", { type: "application/pdf" }));
    const request = new Request("http://localhost/api/internships/attachment", {
      method: "POST",
      body: form,
    });

    const parsed = await readBoundedInternshipFormData(request);
    expect(parsed?.get("application_id")).toBe("test-application");
    expect((parsed?.get("file") as File).name).toBe("proof.pdf");
  });
});
