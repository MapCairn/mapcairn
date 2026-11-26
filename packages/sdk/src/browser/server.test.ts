// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { MountMapError, mountMap } from "./index";

describe("the browser entry on a server", () => {
  it("imports without touching the document", () => {
    expect(typeof mountMap).toBe("function");
  });

  it("refuses to mount, and says why", () => {
    let thrown: unknown;
    try {
      mountMap({} as never);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MountMapError);
    expect((thrown as MountMapError).kind).toBe("server");
    expect((thrown as MountMapError).message).toMatch(/needs a browser/);
  });
});
