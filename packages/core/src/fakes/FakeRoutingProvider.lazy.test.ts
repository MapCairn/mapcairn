// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";

vi.mock("../geometry/operations", () => {
  throw new TypeError("Failed to fetch dynamically imported module");
});

describe("FakeRoutingProvider reachableArea when its lazy chunk fails to load", () => {
  it("rejects with a RoutingError of kind network", async () => {
    const { FakeRoutingProvider } = await import("./FakeRoutingProvider");
    const provider = new FakeRoutingProvider();
    await expect(
      provider.reachableArea({
        origin: { lat: -1.29, lng: 36.82 },
        minutes: 10,
        mode: "walk",
      }),
    ).rejects.toMatchObject({ name: "RoutingError", kind: "network" });
  });
});
