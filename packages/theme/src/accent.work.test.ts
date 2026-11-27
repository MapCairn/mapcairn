// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAccent } from "./accent";
import { measurePair } from "./contrastPairs";

vi.mock("./contrastPairs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./contrastPairs")>();
  return { ...actual, measurePair: vi.fn(actual.measurePair) };
});

/** An input no lightness can pass: both surfaces are mid grey. */
const noPass = { light: { surface: "#595959", surfaceRaised: "#595959" } };

beforeEach(() => {
  vi.mocked(measurePair).mockClear();
});

describe("resolveAccent work", () => {
  it("measures one pass of the pairs the accent touches for an accent that holds as given", () => {
    resolveAccent("#0b5c3a", {}, ["light"]);

    // One full pass over the pairs the accent touches is 30 measurements.
    expect(vi.mocked(measurePair).mock.calls.length).toBeLessThanOrEqual(40);
  });

  it("measures only the pairs the accent touches, in one theme, when no lightness passes", () => {
    const result = resolveAccent("#0b5c3a", noPass, ["light"]);

    expect(result.ok).toBe(false);
    // At most 2,000 candidates (a thousand steps each way), each stopping at
    // its first failing pair: 3,309 measurements today, against 60,000 for
    // 2,000 full passes of 30.
    expect(vi.mocked(measurePair).mock.calls.length).toBeLessThanOrEqual(6_000);
  });

  it("does not measure the other theme when asked for one", () => {
    resolveAccent("#2e8b57", {}, ["dark"]);
    const dark = vi.mocked(measurePair).mock.calls.length;
    vi.mocked(measurePair).mockClear();
    resolveAccent("#2e8b57");

    expect(vi.mocked(measurePair).mock.calls.length).toBeGreaterThan(dark);
  });
});
