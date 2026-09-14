import { describe, expect, test } from "bun:test";

import {
  checkRunGuard,
  downloadPhoto,
  parseArgs,
  preparePhotoForUpload,
  setImageUrlWith,
  toCsv,
} from "./apply-hkscda-photos.mjs";

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

  test("accepts a body larger than 8 MB when a custom maxBytes is raised", async () => {
    const body = new Uint8Array(200);
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => {
          const key = h.toLowerCase();
          if (key === "content-type") return "image/jpeg";
          if (key === "content-length") return String(body.byteLength);
          return null;
        },
      },
      arrayBuffer: async () => body.buffer,
    });
    const result = await downloadPhoto(fetchImpl as never, "https://hkscda.com/large.jpeg", {
      maxBytes: 50 * 1024 * 1024,
    });
    expect(result.bytes.byteLength).toBe(200);
  });

  test("rejects a body over a custom maxBytes alongside a smaller one that fits", async () => {
    const body = new Uint8Array(200);
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => {
          const key = h.toLowerCase();
          if (key === "content-type") return "image/jpeg";
          if (key === "content-length") return String(body.byteLength);
          return null;
        },
      },
      arrayBuffer: async () => body.buffer,
    });
    const small = new Uint8Array(50);
    const smallFetch = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => {
          const key = h.toLowerCase();
          if (key === "content-type") return "image/jpeg";
          if (key === "content-length") return String(small.byteLength);
          return null;
        },
      },
      arrayBuffer: async () => small.buffer,
    });
    const accepted = await downloadPhoto(smallFetch as never, "https://hkscda.com/small.jpeg", {
      maxBytes: 100,
    });
    expect(accepted.bytes.byteLength).toBe(50);
    await expect(
      downloadPhoto(fetchImpl as never, "https://hkscda.com/big.jpeg", { maxBytes: 100 }),
    ).rejects.toThrow("image too large");
  });

  test("rejects a body over the default 8 MB cap", async () => {
    const size = 8 * 1024 * 1024 + 1;
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
    await expect(downloadPhoto(fetchImpl as never, "https://hkscda.com/big.jpeg")).rejects.toThrow(
      "image too large",
    );
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

describe("preparePhotoForUpload", () => {
  test("returns the downscaled result marked downscaled:true when the downscaler succeeds", async () => {
    const downscaled = { bytes: Buffer.from([9, 9]), contentType: "image/webp" };
    const result = await preparePhotoForUpload(
      { bytes: Buffer.from([1, 2, 3]), contentType: "image/jpeg" },
      { downscaleImpl: async () => downscaled },
    );
    expect(result.downscaled).toBe(true);
    expect(result.bytes).toBe(downscaled.bytes);
    expect(result.contentType).toBe("image/webp");
  });

  test("falls back to the original bytes when the downscaler throws and the original fits", async () => {
    const bytes = Buffer.from([1, 2, 3]);
    const result = await preparePhotoForUpload(
      { bytes, contentType: "image/jpeg" },
      {
        downscaleImpl: async () => {
          throw new Error("VipsJpeg: Invalid SOS parameters");
        },
        maxBytes: 100,
      },
    );
    expect(result).toEqual({
      bytes,
      contentType: "image/jpeg",
      downscaled: false,
      fallbackReason: "VipsJpeg: Invalid SOS parameters",
    });
  });

  test("rethrows when the downscaler throws and the original exceeds maxBytes", async () => {
    const bytes = Buffer.alloc(200, 1);
    await expect(
      preparePhotoForUpload(
        { bytes, contentType: "image/jpeg" },
        {
          downscaleImpl: async () => {
            throw new Error("VipsJpeg: Invalid SOS parameters");
          },
          maxBytes: 100,
        },
      ),
    ).rejects.toThrow("VipsJpeg: Invalid SOS parameters");
  });
});

describe("setImageUrlWith", () => {
  function makeFake({ data = [{ id: "id-1" }], error = null } = {}) {
    const calls = {
      from: [] as string[],
      update: [] as unknown[],
      eq: [] as [string, unknown][],
      is: [] as [string, unknown][],
      select: [] as (string | undefined)[],
    };
    const builder = {
      update(values: unknown) {
        calls.update.push(values);
        return this;
      },
      eq(column: string, value: unknown) {
        calls.eq.push([column, value]);
        return this;
      },
      is(column: string, value: unknown) {
        calls.is.push([column, value]);
        return this;
      },
      select(columns?: string) {
        calls.select.push(columns);
        return this;
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve({ data, error }).then(resolve, reject);
      },
    };
    const supabase = {
      from(table: string) {
        calls.from.push(table);
        return builder;
      },
    };
    return { supabase, calls };
  }

  test("without overwrite, targets only rows whose image_url is null", async () => {
    const { supabase, calls } = makeFake();
    await setImageUrlWith(supabase as never, "id-1", "https://x/y.jpg");
    expect(calls.from).toEqual(["animals"]);
    expect(calls.update).toEqual([{ image_url: "https://x/y.jpg" }]);
    expect(calls.eq).toEqual([["id", "id-1"]]);
    expect(calls.is).toEqual([["image_url", null]]);
    expect(calls.select).toEqual(["id"]);
  });

  test("with overwrite, omits the image_url IS NULL guard", async () => {
    const { supabase, calls } = makeFake();
    await setImageUrlWith(supabase as never, "id-2", "https://x/z.jpg", { overwrite: true });
    expect(calls.update).toEqual([{ image_url: "https://x/z.jpg" }]);
    expect(calls.eq).toEqual([["id", "id-2"]]);
    expect(calls.is).toEqual([]);
    expect(calls.select).toEqual(["id"]);
  });

  test("throws when the update affects no rows", async () => {
    const { supabase } = makeFake({ data: [] });
    await expect(setImageUrlWith(supabase as never, "id-1", "https://x/y.jpg")).rejects.toThrow(
      "animal id-1 was not updated",
    );
  });

  test("propagates a Supabase error", async () => {
    const boom = { message: "boom" };
    const { supabase } = makeFake({ data: null, error: boom });
    await expect(setImageUrlWith(supabase as never, "id-1", "https://x/y.jpg")).rejects.toBe(boom);
  });
});

describe("toCsv", () => {
  test("quotes values containing commas or quotes", () => {
    expect(toCsv([{ a: "x,y", b: 'q"r' }])).toBe('"a","b"\n"x,y","q""r"');
  });
});
