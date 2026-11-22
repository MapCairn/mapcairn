// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, describe, expect, it, vi } from "vitest";

const RECORDS = [
  { id: "/a/", url: "/a/", page: "A", heading: "", text: "alpha" },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("loadSearch", () => {
  it("fetches once and gives the same search to every caller", async () => {
    vi.resetModules();
    const fetchIndex = vi.fn(async () => Response.json(RECORDS));
    vi.stubGlobal("fetch", fetchIndex);
    const { loadSearch } = await import("./loadSearch");
    const [first, second] = await Promise.all([
      loadSearch("/i.json"),
      loadSearch("/i.json"),
    ]);
    expect(first).toBe(second);
    expect(fetchIndex).toHaveBeenCalledTimes(1);
    expect(first("alpha")).toHaveLength(1);
  });

  it("forgets a failure so the next call tries again", async () => {
    vi.resetModules();
    const fetchIndex = vi
      .fn()
      .mockResolvedValueOnce(new Response("no", { status: 500 }))
      .mockResolvedValueOnce(Response.json(RECORDS));
    vi.stubGlobal("fetch", fetchIndex);
    const { loadSearch } = await import("./loadSearch");
    await expect(loadSearch("/i.json")).rejects.toThrow("500");
    await expect(loadSearch("/i.json")).resolves.toBeTypeOf("function");
    expect(fetchIndex).toHaveBeenCalledTimes(2);
  });
});
