import { describe, expect, test } from "bun:test";

import { resolveAuthLandingTarget } from "./authLanding";

const TOKENS =
  "#access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig&expires_in=3600&refresh_token=rt&token_type=bearer";

describe("resolveAuthLandingTarget (BUG-25 fallback)", () => {
  test("forwards an invite payload from the site root to the set-password screen", () => {
    expect(
      resolveAuthLandingTarget({ pathname: "/", search: "", hash: `${TOKENS}&type=invite` }),
    ).toBe(`/admin/reset-password?intent=invite${TOKENS}&type=invite`);
  });

  test("forwards a recovery payload to the reset screen without an invite intent", () => {
    expect(
      resolveAuthLandingTarget({ pathname: "/", search: "", hash: `${TOKENS}&type=recovery` }),
    ).toBe(`/admin/reset-password${TOKENS}&type=recovery`);
  });

  test("forwards a typed error payload so the page shows the invalid state", () => {
    const hash = "#error=access_denied&error_code=otp_expired&type=invite";
    expect(resolveAuthLandingTarget({ pathname: "/", search: "", hash })).toBe(
      `/admin/reset-password?intent=invite${hash}`,
    );
  });

  test("forwards a Supabase error payload without a type (expired link fallback)", () => {
    const hash =
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid";
    expect(resolveAuthLandingTarget({ pathname: "/", search: "", hash })).toBe(
      `/admin/reset-password${hash}`,
    );
  });

  test("ignores ordinary fragments and queries", () => {
    expect(resolveAuthLandingTarget({ pathname: "/", search: "", hash: "#section" })).toBeNull();
    expect(
      resolveAuthLandingTarget({ pathname: "/animals/cat", search: "?page=2", hash: "" }),
    ).toBeNull();
  });

  test("ignores non invite/recovery auth payload types", () => {
    expect(
      resolveAuthLandingTarget({ pathname: "/", search: "", hash: `${TOKENS}&type=signup` }),
    ).toBeNull();
    expect(
      resolveAuthLandingTarget({ pathname: "/", search: "", hash: `${TOKENS}&type=magiclink` }),
    ).toBeNull();
  });

  test("does not redirect when already on the reset screen", () => {
    expect(
      resolveAuthLandingTarget({
        pathname: "/admin/reset-password",
        search: "?intent=invite",
        hash: `${TOKENS}&type=invite`,
      }),
    ).toBeNull();
  });

  test("ignores fragments with unrelated error keys and no Supabase error markers", () => {
    expect(
      resolveAuthLandingTarget({ pathname: "/", search: "", hash: "#error=some-anchor" }),
    ).toBeNull();
  });
});
