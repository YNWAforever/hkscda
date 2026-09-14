import { describe, expect, test } from "bun:test";

import { checkRunGuard, downloadPhoto, parseArgs, toCsv } from "./apply-hkscda-photos.mjs";

describe("parseArgs", () => {
  test("defaults to dry-run and requires both flags to write", () => {
    expect(parseArgs([])).toEqual({ apply: false, yes: false, overwrite: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true, yes: false, overwrite: false });
    expect(parseArgs(["--apply", "--yes"])).toEqual({ apply: true, yes: true, overwrite: false });
  });

  test("recognises --overwrite", () => {
    expect(parseArgs(["--apply", "--yes", "--overwrite"])).toEqual({
      apply: true,
      yes: true,
      overwrite: true,
    });
  });
});

describe("checkRunGuard", () => {
  test("allows dry-run without confirmation", () => {
    expect(checkRunGuard({ dryRun: true, yes: false })).toBeNull();
  });

  test("refuses --apply without --yes", () => {
    expect(checkRunGuard({ dryRun: false, yes: false })).toContain("--yes");
  });

  test("allows --apply with --yes", () => {
    expect(checkRunGuard({ dryRun: false, yes: true })).toBeNull();
  });
});

describe("downloadPhoto", () => {
  test("returns bytes for an image response", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "image/jpeg" : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const result = await downloadPhoto(fetchImpl as never, "https://hkscda.com/a.jpeg");
    expect(result.contentType).toBe("image/jpeg");
    expect(Buffer.isBuffer(result.bytes)).toBe(true);
  });

  test("rejects a non-image response", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "text/html" : null) },
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });
    await expect(downloadPhoto(fetchImpl as never, "https://hkscda.com/a")).rejects.toThrow(
      "not an image",
    );
  });

  test("rejects a non-OK response", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 500,
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "image/jpeg" : null) },
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });
    await expect(downloadPhoto(fetchImpl as never, "https://hkscda.com/a")).rejects.toThrow(
      "HTTP 500",
    );
  });

  test("rejects an oversized content-length before reading the body", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => {
          const key = h.toLowerCase();
          if (key === "content-type") return "image/jpeg";
          if (key === "content-length") return String(8 * 1024 * 1024 + 1);
          return null;
        },
      },
      arrayBuffer: async () => {
        throw new Error("arrayBuffer should not be called");
      },
    });
    await expect(downloadPhoto(fetchImpl as never, "https://hkscda.com/big.jpeg")).rejects.toThrow(
      "image too large",
    );
  });

  test("accepts a body of exactly 8 MB", async () => {
    const size = 8 * 1024 * 1024;
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => {
          const key = h.toLowerCase();
          if (key === "content-type") return "image/jpeg";
          if (key === "content-length") return String(size);
          return null;
        },
      },
      arrayBuffer: async () => new Uint8Array(size).buffer,
    });
    const result = await downloadPhoto(fetchImpl as never, "https://hkscda.com/exact.jpeg");
    expect(result.bytes.byteLength).toBe(size);
  });

  test("retries once on a 500 and then succeeds", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 500,
          headers: { get: () => null },
          arrayBuffer: async () => new Uint8Array([1]).buffer,
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "image/jpeg" : null) },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      };
    };
    const result = await downloadPhoto(fetchImpl as never, "https://hkscda.com/a.jpeg", {
      sleepImpl: async () => {},
    });
    expect(calls).toBe(2);
    expect(result.contentType).toBe("image/jpeg");
    expect(result.bytes.byteLength).toBe(3);
  });

  test("rejects after retrying an always-500 response", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return {
        ok: false,
        status: 500,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      };
    };
    await expect(
      downloadPhoto(fetchImpl as never, "https://hkscda.com/a", { sleepImpl: async () => {} }),
    ).rejects.toThrow("HTTP 500");
    expect(calls).toBe(2);
  });

  test("does not retry a 404", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return {
        ok: false,
        status: 404,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      };
    };
    await expect(
      downloadPhoto(fetchImpl as never, "https://hkscda.com/missing", {
        sleepImpl: async () => {},
      }),
    ).rejects.toThrow("HTTP 404");
    expect(calls).toBe(1);
  });
});

describe("toCsv", () => {
  test("quotes values containing commas or quotes", () => {
    expect(toCsv([{ a: "x,y", b: 'q"r' }])).toBe('"a","b"\n"x,y","q""r"');
  });
});
