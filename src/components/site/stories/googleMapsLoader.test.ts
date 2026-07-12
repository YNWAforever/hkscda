import { describe, expect, test } from "bun:test";

import { googleMapsScriptUrl } from "./googleMapsLoader";

describe("googleMapsScriptUrl", () => {
  test("encodes the browser key and requests the weekly Maps JavaScript API", () => {
    const url = googleMapsScriptUrl("key with + symbols");

    expect(url).toBe(
      "https://maps.googleapis.com/maps/api/js?key=key%20with%20%2B%20symbols&v=weekly",
    );
  });
});
